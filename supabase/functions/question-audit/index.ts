import { createClient } from "npm:@supabase/supabase-js@2";
import {
  AUDIT_CRITERIA_VERSION,
  LETTERS,
  PRICES,
  autoFixContent,
  compareVerification,
  contentHash,
  estimateCost,
  optionsOf,
  screenDeterministic,
  snapshotContent,
  syncScoring,
  validateContent,
} from "../shared/question-audit-core.mjs";

const allowedOrigins = new Set([
  "https://portal.studywithmadison.com",
  "https://madisondvahle-lab.github.io",
]);
const corsHeaders = (request: Request) => ({
  "Access-Control-Allow-Origin": allowedOrigins.has(request.headers.get("Origin") ?? "")
    ? request.headers.get("Origin")!
    : "https://portal.studywithmadison.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
});
const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });

const MODELS = {
  screen: Deno.env.get("AUDIT_SCREEN_MODEL") ?? "gpt-4.1-mini",
  revise: Deno.env.get("AUDIT_REVISE_MODEL") ?? "gpt-4.1",
  verify: Deno.env.get("AUDIT_VERIFY_MODEL") ?? "gpt-4o",
};
const MAX_REVISION_ATTEMPTS = 2;
const DEFAULT_MAX_COST_USD = 0.25;
const DEADLINE_MS = 120_000;

const STANDARDS = `You are an experienced NCLEX-RN item writer and nurse educator reviewing one question for an entry-level NCLEX preparation bank.
Standards:
- Clinical accuracy and patient safety come first. If you are not confident a clinical claim is correct, say so; never invent an explanation to justify a questionable key.
- Items measure entry-level RN competence and clinical judgment (current NCSBN test plan, NCSBN Clinical Judgment Measurement Model). Straightforward foundational items are acceptable when well written. Do NOT make items harder for its own sake or add unnecessary complexity.
- Distractors must be plausible alternatives or common misconceptions that require reasoning to eliminate, yet remain clearly incorrect or less appropriate from the information given. Avoid absurd, extreme, unrelated, or generic options ("reassure the client", "document and reassess").
- Options must not coach: avoid options that state their own rationale ("to prevent further deterioration", "immediately assess airway"), a keyed answer that is consistently longer/more detailed, grammatical clues, or stem-word echoing.
- Difficulty rubric: easy = foundational knowledge; medium = interpreting findings, differentiating plausible interventions, basic prioritization; hard = multiple cues and competing priorities. Long scenarios or obscure facts are not "hard".
- Rationales must teach: why the key is right, which findings or principles support it, and why each other option is wrong. No generic text ("This is not the best answer").`;

const SCREEN_SCHEMA = `Return JSON: {"classification":"PASS|MINOR|MAJOR|RETIRE","clinical_risk":"low|medium|high","answer_key_concern":boolean,"clinical_uncertainty":boolean,"difficulty_assessment":"easy|medium|hard","issues":[{"category":"clinical_accuracy|distractors|answer_clues|difficulty|rationale|relevance|scoring","detail":"specific problem"}],"revise_scope":["stem"|"options"|"rationale"|"difficulty"]}
PASS = accurate, entry-level appropriate, defensible key, reasonable distractors, no clues, meaningful rationale (leave unchanged). MINOR = small wording/clarity/rationale issue. MAJOR = clinical inaccuracy, wrong/ambiguous key, weak or implausible distractors, answer-choice clues, or inadequate rationale. RETIRE = fundamentally unsuitable. Do not mark an item down for being simple if it is clinically important and well written. clinical_risk reflects harm if a student learns this item incorrectly (medication doses, safety, priority actions = higher).`;

const VERIFY_PROMPT = `You are an independent NCLEX-RN item reviewer. You are NOT given the answer key. Answer the item yourself first.
Return JSON: {"answer":[option numbers you believe are correct, 1-based],"multiple_defensible":boolean,"clinical_accuracy_concern":boolean,"sufficient_information":boolean,"entry_level_appropriate":boolean,"apparent_difficulty":"easy|medium|hard","implausible_distractors":["option numbers"],"answer_clues":["description"],"concerns":["short statements"]}
For multiple-choice items give exactly one number. multiple_defensible = true if a second option could reasonably be argued correct. Flag any clinical statement you are not confident is current, accepted practice.`;

type Content = ReturnType<typeof snapshotContent>;
type Meter = { input: number; output: number; cost: number; models: Set<string>; maxCost: number };

class BudgetError extends Error {}

class AuditServiceError extends Error {
  code: string;
  httpStatus: number;
  constructor(message: string, code: string, httpStatus: number) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

async function chat(meter: Meter, model: string, system: string, user: string, temperature = 0) {
  if (meter.cost >= meter.maxCost) throw new BudgetError("Per-question spending limit reached.");
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new AuditServiceError("OPENAI_API_KEY is not configured in Supabase. Configure it before retrying.", "ai_configuration", 503);
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];
  // A UTF-8 byte bound deliberately overestimates prompt tokens to reserve the request's maximum cost.
  const inputBound = new TextEncoder().encode(JSON.stringify(messages)).length + 256;
  const outputPrice = (PRICES[model] || PRICES["gpt-4.1"])[1];
  const outputLimit = Math.min(4096, Math.floor((meter.maxCost - meter.cost - estimateCost(model, inputBound, 0)) * 1e6 / outputPrice));
  if (outputLimit < 128) throw new BudgetError("Insufficient remaining audit budget for another AI request. No additional request was sent.");
  const body: Record<string, unknown> = {
    model,
    response_format: { type: "json_object" },
    messages,
    max_completion_tokens: outputLimit,
  };
  if (!/^(o\d|gpt-5)/.test(model)) body.temperature = temperature;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    let providerCode = "";
    try {
      const parsed = JSON.parse(detail);
      providerCode = String(parsed.error?.code || parsed.error?.type || "");
    } catch {
      // Non-JSON provider errors still have an actionable HTTP status.
    }
    if (/credit_balance_exhausted|insufficient_quota/.test(providerCode) || /insufficient_quota/.test(detail)) {
      throw new AuditServiceError("OpenAI API credits are exhausted. Add API credits to the project associated with OPENAI_API_KEY, then retry. ChatGPT subscriptions do not include API credits.", "ai_quota_exhausted", 503);
    }
    if (response.status === 401 || response.status === 403) {
      throw new AuditServiceError("OpenAI rejected the configured API key or project permissions. Check OPENAI_API_KEY in Supabase before retrying.", "ai_configuration", 503);
    }
    throw new AuditServiceError(`OpenAI request failed (HTTP ${response.status}${providerCode ? `, ${providerCode}` : ""}). The batch has stopped; retry after the service is available.`, "ai_service_error", 503);
  }
  const data = await response.json();
  const input = data.usage?.prompt_tokens ?? 0;
  const output = data.usage?.completion_tokens ?? 0;
  meter.input += input;
  meter.output += output;
  meter.cost += estimateCost(model, input, output);
  meter.models.add(model);
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    throw new Error("The AI service returned an unreadable response.");
  }
}

function describe(content: Content, includeKey: boolean) {
  const { options, correct } = optionsOf(content);
  const lines = [
    `Item type: ${content.item_type === "sata" ? "Select all that apply" : "Multiple choice (one best answer)"}`,
    `Stem: ${content.stem}`,
    ...options.map((option: string, i: number) => `Option ${i + 1}: ${option}`),
  ];
  if (includeKey) {
    lines.push(`Keyed correct option number(s): ${correct.map((i: number) => i + 1).join(", ")}`);
    lines.push(`Main rationale: ${content.rationale ?? ""}`);
    const rationales = content.option_rationales ?? {};
    const keys = content.item_type === "sata" ? options.map((_: unknown, i: number) => String(i)) : LETTERS;
    keys.forEach((key: string, i: number) => lines.push(`Rationale for option ${i + 1}: ${rationales[key] ?? "(none)"}`));
    lines.push(`Stored difficulty: ${content.difficulty}; topic: ${content.topic}; category: ${content.nclex_category}`);
  }
  return lines.join("\n");
}

function jaccard(a: string, b: string) {
  const words = (s: string) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((x) => x.length > 3));
  const x = words(a), y = words(b);
  let both = 0;
  x.forEach((word) => { if (y.has(word)) both++; });
  return both / Math.max(1, new Set([...x, ...y]).size);
}

const keyedText = (content: Content) => {
  const { options, correct } = optionsOf(content);
  return options.filter((_: unknown, i: number) => correct.includes(i)).join(" ");
};

function assembleRevision(original: Content, draft: any): Content {
  const options = Array.isArray(draft.options) ? draft.options.map((o: unknown) => String(o ?? "").trim()) : [];
  const correct = Array.isArray(draft.correct) ? draft.correct.map((i: unknown) => Number(i) - 1) : [];
  const rationaleList = Array.isArray(draft.option_rationales) ? draft.option_rationales.map((r: unknown) => String(r ?? "").trim()) : [];
  const next: any = JSON.parse(JSON.stringify(original));
  next.stem = String(draft.stem ?? "").trim();
  next.rationale = String(draft.rationale ?? "").trim();
  if (["easy", "medium", "hard"].includes(draft.difficulty)) next.difficulty = draft.difficulty;
  if (typeof draft.clinical_judgment_skill === "string" && draft.clinical_judgment_skill.trim()) {
    next.clinical_judgment_skill = draft.clinical_judgment_skill.trim();
  }
  if (original.item_type === "mcq") {
    LETTERS.forEach((letter, i) => { next[`option_${letter}`] = options[i] ?? ""; });
    next.correct_answer = LETTERS[correct[0]] ?? "";
    next.option_rationales = Object.fromEntries(LETTERS.map((letter, i) => [letter, rationaleList[i] ?? ""]));
  } else {
    next.item_data = { ...(original.item_data ?? {}), options, correct };
    next.option_rationales = Object.fromEntries(options.map((_: string, i: number) => [String(i), rationaleList[i] ?? ""]));
  }
  return syncScoring(next);
}

function reviseInstruction(original: Content, screen: any, deterministic: any, structural: any[], feedback: string[]) {
  const optionCount = optionsOf(original).options.length;
  return `${describe(original, true)}

Screening findings:
${(screen.issues ?? []).map((i: any) => `- [${i.category}] ${i.detail}`).join("\n") || "- (none)"}
Automated signals: ${deterministic.signals.map((s: any) => s.message).join(" | ") || "none"}
Structural problems: ${structural.map((s) => `${s.field}: ${s.message}`).join(" | ") || "none"}
${feedback.length ? `\nProblems found in your previous attempt (fix them):\n${feedback.map((f) => `- ${f}`).join("\n")}\n` : ""}
Make the SMALLEST clinically appropriate revision that fixes these findings. Keep a good stem; change only what is deficient (${(screen.revise_scope ?? []).join(", ") || "as needed"}). Keep the same learning objective and number of options (${optionCount}). Keep the keyed answer unless the screening found the key clinically wrong; if you change it, set answer_key_changed true and explain. Place the correct option(s) in varied positions and keep correct and incorrect options similar in length and detail. Do not add reasoning phrases inside options. Write a rationale that teaches, plus one specific rationale per option (why right or why wrong). Do not invent references.
Return JSON: {"stem":string,"options":[string...],"correct":[1-based option numbers],"rationale":string,"option_rationales":[string per option, same order],"difficulty":"easy|medium|hard","clinical_judgment_skill":string,"answer_key_changed":boolean,"clinical_uncertainty":boolean,"change_summary":"what changed and why, one or two sentences"}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json(request, { error: "Sign in as an admin to run audits." }, 401);
  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!projectUrl || !publishableKey) return json(request, { error: "Server configuration is incomplete." }, 500);

  // Every database call uses the admin's own session, so existing RLS applies.
  const db = createClient(projectUrl, publishableKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData.user) return json(request, { error: "Your admin session has expired. Please sign in again." }, 401);
  const isAdmin = await db.rpc("is_app_admin");
  if (isAdmin.error || isAdmin.data !== true) return json(request, { error: "Only Madison's admin account can run audits." }, 403);

  let payload: { question_id?: string; max_cost_usd?: number; priority?: number; priority_reason?: string };
  try { payload = await request.json(); } catch { return json(request, { error: "Send a question_id." }, 400); }
  const questionId = String(payload.question_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(questionId)) return json(request, { error: "Send a valid question_id." }, 400);
  const meter: Meter = {
    input: 0, output: 0, cost: 0, models: new Set(),
    maxCost: Math.min(Math.max(Number(payload.max_cost_usd) || DEFAULT_MAX_COST_USD, 0.01), 1),
  };
  const started = Date.now();

  const { data: question, error: questionError } = await db.from("questions").select("*").eq("id", questionId).maybeSingle();
  if (questionError || !question) return json(request, { error: "Question not found." }, 404);

  const open = await db.from("question_revision_drafts").select("id,status").eq("question_id", questionId)
    .in("status", ["pending_review", "approved"]).maybeSingle();
  if (open.error) return json(request, { error: `Could not check correction drafts: ${open.error.message}` }, 500);
  if (open.data) {
    return json(request, { status: "skipped", reason: `An ${open.data.status === "approved" ? "approved" : "pending"} correction draft already exists; it was not touched.` });
  }

  const original = snapshotContent(question);
  const hash = contentHash(original);
  const cached = await db.from("question_audits").select("*").eq("question_id", questionId).eq("content_hash", hash)
    .eq("criteria_version", AUDIT_CRITERIA_VERSION).neq("audit_status", "error").maybeSingle();
  if (cached.error) return json(request, { error: `Could not check previous audits: ${cached.error.message}` }, 500);
  if (cached.data) return json(request, { status: "cached", audit: cached.data, cost_usd: 0 });

  const failed = await db.from("question_audits").select("*").eq("question_id", questionId).eq("content_hash", hash)
    .eq("criteria_version", AUDIT_CRITERIA_VERSION).eq("audit_status", "error")
    .order("audited_at", { ascending: false }).limit(1).maybeSingle();
  if (failed.error) return json(request, { error: `Could not check failed audits: ${failed.error.message}` }, 500);
  const previous = failed.data;
  const structural = validateContent(original).filter((i: any) => i.severity === "error");
  const deterministic = screenDeterministic(original);
  const findings: Record<string, unknown> = {
    structural, signals: deterministic.signals,
    ...(previous ? { previous_errors: [...(previous.findings?.previous_errors || []), {
      note: previous.note, audited_at: previous.audited_at, failure: previous.findings?.failure ?? null,
    }] } : {}),
  };
  const record: Record<string, unknown> = {
    question_id: questionId, content_hash: hash, criteria_version: AUDIT_CRITERIA_VERSION,
    priority: payload.priority ?? null, priority_reason: payload.priority_reason ?? null, audited_by: userData.user.id,
    note: null, screening_class: null, clinical_risk: null, verification: null, revision_id: null,
  };

  const finish = async (fields: Record<string, unknown>, extra: Record<string, unknown> = {}, httpStatus = 200) => {
    const row = {
      ...record, findings, ...fields,
      models: { ...previous?.models, ...Object.fromEntries([...meter.models].map((m) => [m, true])) },
      input_tokens: (previous?.input_tokens || 0) + meter.input,
      output_tokens: (previous?.output_tokens || 0) + meter.output,
      est_cost_usd: Number((Number(previous?.est_cost_usd || 0) + meter.cost).toFixed(4)),
      audited_at: new Date().toISOString(),
    };
    const saved = await (previous
      ? db.from("question_audits").update(row).eq("id", previous.id).eq("audit_status", "error")
      : db.from("question_audits").insert(row)).select("*").single();
    if (saved.error) {
      return json(request, { error: `Could not record the audit: ${saved.error.message}`, cost_usd: meter.cost }, 500);
    }
    return json(request, { status: saved.data.audit_status, audit: saved.data, cost_usd: meter.cost, ...extra }, httpStatus);
  };

  const createDraft = (proposed: unknown, summary: string) =>
    db.from("question_revision_drafts").insert({
      question_id: questionId, base_content: original, proposed_content: proposed,
      change_summary: summary, proposed_by: userData.user.id, status: "pending_review",
    }).select("id").single();

  try {
    // Stage A: lightweight screening.
    const screen = await chat(
      meter, MODELS.screen, `${STANDARDS}\n${SCREEN_SCHEMA}`,
      `${describe(original, true)}\n\nAutomated signals: ${deterministic.signals.map((s: any) => s.message).join(" | ") || "none"}\nStructural problems: ${structural.map((s: any) => `${s.field}: ${s.message}`).join(" | ") || "none"}`,
    );
    let classification = ["PASS", "MINOR", "MAJOR", "RETIRE"].includes(screen.classification) ? screen.classification : "MAJOR";
    if (structural.length && (classification === "PASS" || classification === "MINOR")) classification = "MAJOR";
    const risk = ["low", "medium", "high"].includes(screen.clinical_risk) ? screen.clinical_risk : "medium";
    findings.screen = screen;
    record.screening_class = classification;
    record.clinical_risk = screen.answer_key_concern ? "high" : risk;

    if (classification === "PASS") {
      const fix = autoFixContent(original);
      if (fix.changes.length) {
        const draft = await createDraft(fix.content, `[Automated audit] Whitespace-only cleanup (${fix.changes.join(", ")}). No wording changed.`);
        if (draft.error) throw new Error(`Could not save the correction draft: ${draft.error.message}`);
        return await finish({ audit_status: "auto_fix", revision_id: draft.data.id, attempts: 0 });
      }
      return await finish({ audit_status: "pass", attempts: 0 });
    }

    if (classification === "RETIRE") {
      return await finish({ audit_status: "quarantine", attempts: 0, note: "Screening recommends retirement or replacement. No changes were made." });
    }

    // Stages B and C: targeted revision, then blind verification, with a small retry budget.
    let feedback: string[] = [];
    let lastProposed: Content | null = null;
    const attemptLog: unknown[] = [];
    for (let attempt = 1; attempt <= MAX_REVISION_ATTEMPTS; attempt++) {
      if (Date.now() - started > DEADLINE_MS) throw new Error("Audit timed out; try this question again.");
      const draft = await chat(meter, MODELS.revise, STANDARDS, reviseInstruction(original, screen, deterministic, structural, feedback), 0.2);
      const proposed = autoFixContent(assembleRevision(original, draft)).content;
      lastProposed = proposed;

      const problems = validateContent(proposed, { requireRationales: true }).filter((i: any) => i.severity === "error");
      if (problems.length) {
        feedback = problems.map((p: any) => `${p.field}: ${p.message}`);
        attemptLog.push({ attempt, outcome: "validation_failed", problems });
        continue;
      }

      const keyChanged = draft.answer_key_changed === true || jaccard(keyedText(original), keyedText(proposed)) < 0.3;
      const remaining = screenDeterministic(proposed).signals.filter((s: any) => s.weight >= 2).map((s: any) => s.code);
      const verdict = await chat(meter, MODELS.verify, VERIFY_PROMPT, describe(proposed, false));
      const comparison = compareVerification(proposed, {
        ...verdict, answer: Array.isArray(verdict.answer) ? verdict.answer.map((n: unknown) => Number(n) - 1) : [],
      });
      attemptLog.push({ attempt, outcome: comparison.agrees ? "verified" : "disagreed", problems: comparison.problems, verdict, remaining_signals: remaining, key_changed: keyChanged });

      if (!comparison.agrees || draft.clinical_uncertainty === true) {
        feedback = [
          ...comparison.problems, ...(verdict.concerns ?? []),
          ...(draft.clinical_uncertainty ? ["You reported clinical uncertainty; resolve it or keep the original wording."] : []),
          ...(verdict.answer_clues?.length ? [`Answer clues noticed: ${verdict.answer_clues.join("; ")}`] : []),
        ];
        continue;
      }

      const summary = `[Automated audit ${AUDIT_CRITERIA_VERSION}] ${String(draft.change_summary ?? "Targeted revision.").slice(0, 600)}${keyChanged ? " ANSWER KEY CHANGED — review carefully." : ""} Independent blind review agreed with the key; clinical review still required.`;
      const saved = await createDraft(proposed, summary);
      if (saved.error) throw new Error(`Could not save the correction draft: ${saved.error.message}`);
      return await finish({
        audit_status: "revised", revision_id: saved.data.id, attempts: attempt, verification: { agreed: true, attempts: attemptLog },
        clinical_risk: keyChanged ? "high" : record.clinical_risk,
      }, { draft_id: saved.data.id });
    }

    findings.rejected_attempt = lastProposed;
    return await finish({
      audit_status: "quarantine", attempts: MAX_REVISION_ATTEMPTS, verification: { agreed: false, attempts: attemptLog },
      note: "Revision could not be verified within the retry budget. No draft was saved and the live question is unchanged.",
    });
  } catch (error) {
    // Errors are recorded so spend stays visible, but they remain retryable.
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof AuditServiceError ? error.code : error instanceof BudgetError ? "audit_budget" : "audit_failed";
    findings.failure = { code, stop_batch: true };
    console.error(JSON.stringify({ event: "question_audit_failed", question_id: questionId, code, message }));
    return await finish({ audit_status: "error", note: message.slice(0, 500), attempts: 0 }, {
      error_code: code, stop_batch: true,
    }, error instanceof AuditServiceError ? error.httpStatus : error instanceof BudgetError ? 409 : 500);
  }
});
