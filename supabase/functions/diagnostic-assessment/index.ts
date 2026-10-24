import { createClient } from 'npm:@supabase/supabase-js@2';
import { presentation, newPresentations, canonicalAnswer } from '../_shared/sata-presentation.mjs';
import {
  pickNextQuestion,
  shouldStop,
  shouldStopMock,
  updateAbility,
  updateNGNAbility,
  shouldStopNGN,
} from '../_shared/diagnostic-assessment-engine.mjs';
import {
  MODEL, registryEntry, currentInteraction, publicInteraction, publicCheckpoint,
  selectCurrent, validateDraft, scoreCurrent, recordCredit, responseDetail,
} from '../_shared/diagnostic-ngn.mjs';

const allowedOrigins = new Set([
  'https://portal.studywithmadison.com',
  'https://madisondvahle-lab.github.io',
]);

const corsHeaders = (request: Request) => {
  const origin = request.headers.get('Origin') ?? '';
  const allowedOrigin = allowedOrigins.has(origin)
    ? origin
    : 'https://portal.studywithmadison.com';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const reply = (request: Request, body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });

const requiredString = (value: unknown, name: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${name} is required.`);
  return value.trim();
};

function requirePresentationClient(attempt: Record<string, any>, body: Record<string, any>) {
  if (attempt.checkpoint?.optionProtocol && body.optionProtocol !== presentation.VERSION) {
    throw new HttpError(409, 'This assessment uses saved answer ordering. Refresh to the current assessment page to continue.');
  }
}

function requireMCQPresentationClient(attempt: Record<string, any>, body: Record<string, any>) {
  if (attempt.checkpoint?.mcqOptionProtocol && body.mcqOptionProtocol !== 'mcq-order-v1') {
    throw new HttpError(409, 'This assessment uses saved MCQ answer ordering. Refresh to the current assessment page to continue.');
  }
}

function decodeAnswer(attempt: Record<string, any>, id: string, answer: unknown, draft = false) {
  const checkpoint = attempt.checkpoint;
  const saved = { ...checkpoint?.presentations, ...checkpoint?.ngnState?.current?.presentations };
  try { return canonicalAnswer(saved, id, answer, draft); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Invalid answer identity.'); }
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = canonicalize((value as Record<string, unknown>)[key]);
      return result;
    }, {});
  }
  return value;
};

const answersEqual = (selected: unknown, correct: unknown) =>
  selected !== null && selected !== undefined && correct !== null && correct !== undefined &&
  JSON.stringify(canonicalize(selected)) === JSON.stringify(canonicalize(correct));

function cleanExamTimer(timer: Record<string, unknown> | null, mode: string) {
  if (mode !== 'mock' || !timer) return null;
  const multiplier = [1, 1.5, 2].includes(Number(timer.multiplier)) ? Number(timer.multiplier) : 1;
  const remainingMs = Number(timer.remainingMs);
  return {
    multiplier,
    showTimer: timer.showTimer !== false,
    showQuestionCount: timer.showQuestionCount !== false,
    remainingMs: Number.isFinite(remainingMs) ? Math.max(0, Math.min(10 * 60 * 60 * 1000, remainingMs)) : 5 * 60 * 60 * 1000 * multiplier,
    runningSince: typeof timer.runningSince === 'string' ? timer.runningSince : null,
    overTime: timer.overTime === true,
  };
}

async function createContext(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in to use the assessment.');

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) throw new HttpError(503, 'Assessment services are not configured.');

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) throw new HttpError(401, 'Your session has expired. Sign in again.');

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: student, error: studentError } = await service
    .from('students')
    .select('id,name,portal_stage')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (studentError) throw studentError;

  const { data: isAdmin, error: adminError } = await userClient.rpc('is_app_admin');
  if (adminError) throw adminError;
  return { user, student, isAdmin: isAdmin === true, service };
}

type SupabaseClient = Awaited<ReturnType<typeof createContext>>['service'];

async function attemptForStudent(service: SupabaseClient, attemptId: string, studentId: string) {
  const { data, error } = await service
    .from('in_house_assessment_attempts')
    .select('id,student_id,session_key,assessment_key,assessment_title,assessment_version,mode,status,result,ability_estimate,target_questions,total_questions,correct_questions,checkpoint,checkpoint_revision,qa_mode,started_at,updated_at,completed_at')
    .eq('id', attemptId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Assessment attempt not found.');
  return data;
}

async function itemKeys(service: SupabaseClient, scope: string, includeNGN = false) {
  const { data, error } = await service
    .from('in_house_diagnostic_item_keys')
    .select('bank_scope,item_id,item_source,parent_item_id,selectable,item_type,difficulty,blueprint,category,nclex_category,topic,cognitive_level,core_tags,correct_response,rationale,sequence_order,case_length')
    .eq('bank_scope', scope);
  if (error) throw error;
  const keys = data || [];
  if (!includeNGN || scope !== 'diagnostic') return keys;
  const ngnKeys: Array<NonNullable<Awaited<ReturnType<typeof registryEntry>>>> = [];
  for (let offset = 0; ; offset += 100) {
    const { data: questions, error: questionError } = await service.from('questions')
      .select('id,stem,rationale,option_rationales,active,source_key,item_type,item_data,difficulty,nclex_category,topic')
      .eq('active', true).eq('item_data->>schemaVersion', '1')
      .like('source_key', 'qbank-bulk-%').order('id').range(offset, offset + 99);
    if (questionError) throw questionError;
    if (!questions?.length) break;
    const { data: reviews, error: reviewError } = await service.from('question_import_reviews')
      .select('source_key,status').in('source_key', questions.map(q => q.source_key)).in('status', ['approved', 'published']);
    if (reviewError) throw reviewError;
    for (const question of questions) {
      const key = await registryEntry(question, reviews?.find(review => review.source_key === question.source_key));
      if (key) ngnKeys.push(key);
    }
    if (questions.length < 100) break;
  }
  return [...keys, ...ngnKeys];
}

function keyForItem(keys: Array<Record<string, any>>, id: string) {
  const item = keys.find(row => row.item_id === id);
  if (!item) throw new HttpError(400, 'This item is not available in the diagnostic bank.');
  return item;
}

async function responseRows(service: SupabaseClient, attemptId: string) {
  const { data, error } = await service
    .from('in_house_assessment_item_responses')
    .select('item_id,item_source,blueprint,nclex_category,system,topic,cognitive_level,difficulty,question_type,selected_answer,correct_answer,is_correct,answered_at')
    .eq('attempt_id', attemptId)
    .order('answered_at', { ascending: true })
    .order('item_id', { ascending: true });
  if (error) throw error;
  return data || [];
}

function historyFor(rows: Array<Record<string, any>>, keys: Array<Record<string, any>>, reveal: boolean, checkpoint: Record<string, any> = {}) {
  const byId = new Map(keys.map(row => [row.item_id, row]));
  return rows.map(row => {
    const key = byId.get(row.item_id);
    const sourceId = checkpoint.ngnState?.responses?.[row.item_id]?.parentId || key?.parent_item_id || row.item_id;
    const record: Record<string, any> = {
      ...row,
      id: row.item_id,
      sourceId,
      type: row.question_type || key?.item_type || 'mcq',
      difficulty: row.difficulty ?? key?.difficulty ?? 2,
      blueprint: row.blueprint || key?.blueprint || null,
      nclex_category: row.nclex_category || key?.nclex_category || null,
      core_tags: key?.core_tags || [],
      correct: reveal ? Boolean(row.is_correct) : null,
      selectedAnswer: row.selected_answer,
      scoringModel: checkpoint.scoringModel || 'in-house-core-v1',
      ...(checkpoint.presentations?.[row.item_id] ? { presentation: checkpoint.presentations[row.item_id] } : {}),
    };
    if (reveal) {
      record.correctAnswer = row.correct_answer;
      record.rationale = key?.rationale || null;
      record.is_correct = Boolean(row.is_correct);
      Object.assign(record, responseDetail(checkpoint, row.item_id, true));
      if (record.interaction) {
        record.rationale = record.interaction.rationale;
        record.correctAnswer = row.correct_answer;
      }
    } else {
      delete record.correct_answer;
      delete record.is_correct;
    }
    return record;
  });
}

function selectionHistory(rows: Array<Record<string, any>>, keys: Array<Record<string, any>>, checkpoint: Record<string, any> = {}) {
  const full = historyFor(rows, keys, true, checkpoint);
  return full.map(row => ({
    id: row.id,
    sourceId: row.sourceId,
    difficulty: row.difficulty,
    blueprint: row.blueprint,
    nclex_category: row.nclex_category,
    core_tags: row.core_tags,
    correct: row.is_correct,
    ...(checkpoint.scoringModel === MODEL ? {
      evidenceGroup: row.sourceId,
      evidenceComplete: !checkpoint.ngnState?.current || checkpoint.ngnState.current.key.item_id !== row.sourceId ||
        checkpoint.ngnState.current.stage >= (checkpoint.ngnState.current.key.case_length || 1),
      evidenceCredit: row.credit?.score ?? (row.is_correct ? 1 : 0),
    } : {}),
  }));
}

function canReveal(attempt: Record<string, any>) {
  if (attempt.status === 'completed') return true;
  return attempt.checkpoint?.scoringModel === MODEL
    ? !['nclex', 'mock', 'assessment'].includes(attempt.checkpoint?.mode)
    : attempt.checkpoint?.mode !== 'mock';
}

function attemptSummary(attempt: Record<string, any>) {
  const reveal = canReveal(attempt);
  const checkpoint = publicCheckpoint(attempt.checkpoint || {});
  if (!reveal) delete checkpoint.ability;
  return {
    id: attempt.id,
    student_id: attempt.student_id,
    session_key: attempt.session_key,
    assessment_key: attempt.assessment_key,
    assessment_title: attempt.assessment_title,
    assessment_version: attempt.assessment_version,
    mode: attempt.mode,
    status: attempt.status,
    result: attempt.result,
    ability_estimate: reveal ? attempt.ability_estimate : null,
    target_questions: attempt.target_questions,
    total_questions: attempt.total_questions,
    correct_questions: reveal ? attempt.correct_questions : null,
    checkpoint,
    checkpoint_revision: attempt.checkpoint_revision,
    qa_mode: attempt.qa_mode,
    updated_at: attempt.updated_at,
    completed_at: attempt.completed_at,
  };
}

async function stateForAttempt(service: SupabaseClient, attempt: Record<string, any>, keys: Array<Record<string, any>>) {
  const rows = await responseRows(service, attempt.id);
  const reveal = canReveal(attempt);
  return {
    attempt: attemptSummary(attempt),
    responses: historyFor(rows, keys, reveal, attempt.checkpoint),
    currentItemId: attempt.checkpoint?.currentItemId || null,
    currentItem: publicInteraction(attempt.checkpoint),
  };
}

function attemptMode(mode: string) {
  return mode === 'assessment' ? 'practice' : mode;
}

function targetFor(mode: string, requested: unknown) {
  if (mode === 'assessment') return 85;
  if (mode === 'nclex') return 45;
  if (mode === 'mock') return 150;
  const count = Number(requested);
  if (!Number.isInteger(count) || count < 1 || count > 150) throw new HttpError(400, 'Question count is invalid.');
  return count;
}

const CLIENT_PROTOCOL = 'ngn-cat-v1';

function requireCompatibleClient(attempt: Record<string, any>, body: Record<string, any>) {
  requirePresentationClient(attempt, body);
  requireMCQPresentationClient(attempt, body);
  if (attempt.checkpoint?.scoringModel === MODEL && body.clientProtocol !== CLIENT_PROTOCOL) {
    throw new HttpError(409, 'This saved assessment requires the updated CAT page. Refresh the portal and resume; your progress is unchanged.');
  }
}

async function startAttempt(context: Awaited<ReturnType<typeof createContext>>, body: Record<string, any>) {
  if (!context.student) throw new HttpError(403, 'No student profile is linked to this account.');
  const mode = requiredString(body.mode ?? body.profile?.mode, 'Assessment mode');
  if (!['practice', 'nclex', 'mock', 'remediation', 'assessment'].includes(mode)) {
    throw new HttpError(400, 'Assessment mode is not supported.');
  }
  if (mode === 'assessment' && context.student.portal_stage !== 'assessment') {
    throw new HttpError(403, 'This assessment is not available to this account.');
  }
  const sessionKey = requiredString(body.sessionKey, 'Assessment session key');
  const assessmentKey = mode === 'assessment' ? 'readiness-assessment' : `diagnostic-${mode}`;
  const scope = mode === 'remediation' ? 'remediation' : 'diagnostic';
  const ngnEnabled = Deno.env.get('NGN_CAT_NEW_ATTEMPTS_ENABLED') === 'true' &&
    body.clientProtocol === CLIENT_PROTOCOL && ['nclex', 'mock', 'assessment'].includes(mode);
  const profile = {
    mode,
    weakAreas: Array.isArray(body.profile?.weakAreas) ? body.profile.weakAreas.filter((value: unknown) => typeof value === 'string').slice(0, 8) : [],
    externalCategoryWeights: body.profile?.externalCategoryWeights && typeof body.profile.externalCategoryWeights === 'object'
      ? body.profile.externalCategoryWeights
      : {},
  };
  const targetQuestions = targetFor(mode, body.profile?.qCount);

  const { data: existing, error: existingError } = await context.service
    .from('in_house_assessment_attempts')
    .select('id,student_id,session_key,assessment_key,assessment_title,assessment_version,mode,status,result,ability_estimate,target_questions,total_questions,correct_questions,checkpoint,checkpoint_revision,qa_mode,started_at,updated_at,completed_at')
    .eq('student_id', context.student.id)
    .eq('assessment_key', assessmentKey)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    requireCompatibleClient(existing, body);
    const existingKeys = await itemKeys(context.service, scope, existing.checkpoint?.scoringModel === MODEL);
    return await stateForAttempt(context.service, existing, existingKeys);
  }
  const keys = await itemKeys(context.service, scope, ngnEnabled);
  if (ngnEnabled) Object.assign(profile, { scoringModel: MODEL });

  const requirements = await coreRequirements(context.service);
  const firstItem = pickNextQuestion(keys.filter(row => row.selectable), [], profile, 0.5, requirements, targetQuestions);
  if (!firstItem) throw new HttpError(503, 'No assessment items are available for this mode.');
  const now = new Date().toISOString();
  const examTimer = mode === 'mock'
    ? cleanExamTimer({
      multiplier: body.profile?.examTimerSettings?.multiplier,
      showTimer: body.profile?.examTimerSettings?.showTimer,
      showQuestionCount: body.profile?.examTimerSettings?.showQuestionCount,
      remainingMs: 5 * 60 * 60 * 1000 * Number(body.profile?.examTimerSettings?.multiplier || 1),
      runningSince: now,
    }, mode)
    : null;
  const title = mode === 'assessment'
    ? 'NCLEX Readiness Assessment'
    : mode === 'mock'
      ? 'SWM-CAT'
      : String(body.profile?.name || 'Adaptive Diagnostic').slice(0, 120);
  const checkpoint = {
    schemaVersion: ngnEnabled ? 4 : 3,
    assessmentVersion: ngnEnabled ? MODEL : 'in-house-core-v1',
    ...(ngnEnabled ? { scoringModel: MODEL, ngnState: selectCurrent({ optionProtocol: body.optionProtocol, mcqOptionProtocol: body.mcqOptionProtocol }, firstItem) } : {}),
    ...(body.optionProtocol === presentation.VERSION ? {
      optionProtocol: presentation.VERSION,
    } : {}),
    ...(body.mcqOptionProtocol === 'mcq-order-v1' ? {
      mcqOptionProtocol: 'mcq-order-v1',
      presentations: newPresentations(keys, true),
    } : {}),
    ...(body.optionProtocol === presentation.VERSION && body.mcqOptionProtocol !== 'mcq-order-v1' ? { presentations: newPresentations(keys) } : {}),
    mode,
    profile,
    currentItemId: firstItem.item_id,
    ability: 0.5,
    answeredItemIds: [],
    examTimer,
    draft: { selected: [], btState: { left: [], center: [], right: [] }, csAnswers: {}, submitted: false },
  };
  checkpoint.currentItemId = currentInteraction(checkpoint)?.id || firstItem.item_id;
  const { data: attempt, error } = await context.service
    .from('in_house_assessment_attempts')
    .insert({
      student_id: context.student.id,
      session_key: sessionKey,
      assessment_key: assessmentKey,
      assessment_title: title,
      assessment_version: ngnEnabled ? MODEL : 'in-house-core-v1',
      mode: attemptMode(mode),
      status: 'in_progress',
      result: null,
      ability_estimate: 0.5,
      target_questions: targetQuestions,
      total_questions: 0,
      correct_questions: 0,
      started_at: now,
      updated_at: now,
      completed_at: null,
      checkpoint,
      checkpoint_revision: 0,
      qa_mode: false,
    })
    .select('id,student_id,session_key,assessment_key,assessment_title,assessment_version,mode,status,result,ability_estimate,target_questions,total_questions,correct_questions,checkpoint,checkpoint_revision,qa_mode,started_at,updated_at,completed_at')
    .single();
  if (error) throw error;
  return await stateForAttempt(context.service, attempt, keys);
}

async function coreRequirements(service: SupabaseClient) {
  const { data, error } = await service
    .from('in_house_diagnostic_item_keys')
    .select('item_id,core_tags')
    .eq('bank_scope', 'diagnostic')
    .eq('selectable', true);
  if (error) throw error;
  const tags = new Map((data || []).map((row: Record<string, any>) => [row.item_id, row.core_tags || []]));
  const keys = [
    'delegation', 'consent_rights', 'infection_prevention', 'insulin_glucose',
    'high_alert_medications', 'blood_administration', 'airway_breathing',
    'circulation_shock', 'fluids_electrolytes', 'postoperative_risk',
    'maternal_newborn', 'pediatrics', 'psych_safety',
  ];
  return keys.map(key => ({ key, itemIds: [...tags.entries()].filter(([, itemTags]) => itemTags.includes(key)).map(([id]) => id) }));
}

async function resumeAttempt(context: Awaited<ReturnType<typeof createContext>>, body: Record<string, any>) {
  if (!context.student) throw new HttpError(403, 'No student profile is linked to this account.');
  const assessmentKey = requiredString(body.assessmentKey, 'Assessment key');
  const { data: attempt, error } = await context.service
    .from('in_house_assessment_attempts')
    .select('id,student_id,session_key,assessment_key,assessment_title,assessment_version,mode,status,result,ability_estimate,target_questions,total_questions,correct_questions,checkpoint,checkpoint_revision,qa_mode,started_at,updated_at,completed_at')
    .eq('student_id', context.student.id)
    .eq('assessment_key', assessmentKey)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!attempt) return null;
  requireCompatibleClient(attempt, body);
  const keys = await itemKeys(context.service, attempt.checkpoint?.mode === 'remediation' ? 'remediation' : 'diagnostic', attempt.checkpoint?.scoringModel === MODEL);
  return await stateForAttempt(context.service, attempt, keys);
}

async function checkpointAttempt(context: Awaited<ReturnType<typeof createContext>>, body: Record<string, any>) {
  if (!context.student) throw new HttpError(403, 'No student profile is linked to this account.');
  const attemptId = requiredString(body.attemptId, 'Attempt ID');
  const revision = Number(body.expectedRevision);
  if (!Number.isInteger(revision)) throw new HttpError(400, 'Checkpoint revision is invalid.');
  const attempt = await attemptForStudent(context.service, attemptId, context.student.id);
  requireCompatibleClient(attempt, body);
  if (attempt.status !== 'in_progress' || attempt.checkpoint_revision !== revision) {
    throw new HttpError(409, 'This assessment changed in another session. Reload and resume it.');
  }
  const incoming = body.checkpoint;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    throw new HttpError(400, 'Checkpoint is invalid.');
  }
  if (incoming.presentations && JSON.stringify(incoming.presentations) !== JSON.stringify(attempt.checkpoint?.presentations)) {
    throw new HttpError(400, 'Saved answer mappings cannot be replaced by the client.');
  }
  const selected = currentInteraction(attempt.checkpoint) ? [] :
    decodeAnswer(attempt, attempt.checkpoint.currentItemId, incoming.draft?.selected || [], true);
  const csAnswers: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(incoming.draft?.csAnswers || {})) {
    csAnswers[id] = decodeAnswer(attempt, `${attempt.checkpoint.currentItemId}:${id}`, value, true);
  }
  const checkpoint = {
    ...attempt.checkpoint,
    draft: {
      selected: Array.isArray(selected) ? selected : [],
      btState: incoming.draft?.btState || { left: [], center: [], right: [] },
      csAnswers,
      submitted: false,
    },
    examTimer: cleanExamTimer(incoming.examTimer, attempt.checkpoint?.mode),
  };
  if (currentInteraction(attempt.checkpoint)) {
    try { Object.assign(checkpoint.draft, { ngn: validateDraft(attempt.checkpoint, incoming.draft?.ngn) }); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Invalid NGN draft.'); }
  }
  const { data, error } = await context.service
    .from('in_house_assessment_attempts')
    .update({ checkpoint, checkpoint_revision: revision + 1, updated_at: new Date().toISOString() })
    .eq('id', attempt.id)
    .eq('student_id', context.student.id)
    .eq('status', 'in_progress')
    .eq('checkpoint_revision', revision)
    .select('checkpoint_revision')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(409, 'This assessment changed in another session. Reload and resume it.');
  return { checkpointRevision: data.checkpoint_revision };
}

function selectedAnswer(item: Record<string, any>, submitted: unknown) {
  if (item.item_type === 'mcq' && !item.parent_item_id && Array.isArray(submitted)) return submitted[0];
  return submitted;
}

function correctAnswer(item: Record<string, any>) {
  if (item.item_type === 'mcq' && !item.parent_item_id && Array.isArray(item.correct_response)) return item.correct_response[0];
  return item.correct_response;
}

async function answerAttempt(context: Awaited<ReturnType<typeof createContext>>, body: Record<string, any>) {
  if (!context.student) throw new HttpError(403, 'No student profile is linked to this account.');
  const attemptId = requiredString(body.attemptId, 'Attempt ID');
  const revision = Number(body.expectedRevision);
  const itemId = requiredString(body.itemId, 'Item ID');
  if (!Number.isInteger(revision)) throw new HttpError(400, 'Assessment revision is invalid.');
  const attempt = await attemptForStudent(context.service, attemptId, context.student.id);
  requireCompatibleClient(attempt, body);
  if (body.presentations || body.presentation || body.optionOrder) throw new HttpError(400, 'Answer mappings are server-owned.');
  if (attempt.status !== 'in_progress') throw new HttpError(409, 'This assessment is no longer active.');
  if (attempt.checkpoint_revision !== revision || attempt.checkpoint?.currentItemId !== itemId) {
    throw new HttpError(409, 'This response no longer matches the current assessment item. Reload and resume.');
  }

  const mode = attempt.checkpoint.mode;
  const scope = mode === 'remediation' ? 'remediation' : 'diagnostic';
  const versioned = attempt.checkpoint.scoringModel === MODEL;
  const keys = await itemKeys(context.service, scope, versioned);
  const ngnItem = currentInteraction(attempt.checkpoint);
  const item = ngnItem ? attempt.checkpoint.ngnState.current.key : keyForItem(keys, itemId);
  if (!item.selectable) throw new HttpError(400, 'This item cannot be submitted independently.');
  const answeredAt = new Date().toISOString();
  const outcomes: Array<Record<string, any>> = [];
  let ngnResult: ReturnType<typeof recordCredit> | null = null;

  if (ngnItem) {
    let detail;
    const canonical = decodeAnswer(attempt, itemId, body.answer);
    try { detail = scoreCurrent(attempt.checkpoint, canonical); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Invalid NGN response.'); }
    ngnResult = recordCredit(attempt.checkpoint, detail);
    const correct = ngnItem.type === 'highlight'
      ? ngnItem.segments.filter((s: Record<string, any>) => s.id && s.correct).map((s: Record<string, any>) => s.id)
      : ngnItem.type === 'cloze' ? ngnItem.dropdowns.map((d: Record<string, any>) => d.correct) : ngnItem.correct;
    const row = {
      item_id: ngnItem.id, item_source: item.item_source, blueprint: item.blueprint,
      nclex_category: item.nclex_category, topic: item.topic, difficulty: item.difficulty,
      question_type: ngnItem.type, selected_answer: canonical, correct_answer: correct,
      is_correct: detail.credit.full, answered_at: answeredAt,
    };
    outcomes.push({
      ...row, isCorrect: row.is_correct,
      databaseRow: (attemptId: string) => ({ ...row, attempt_id: attemptId }),
      toClient: (reveal: boolean) => reveal ? { ...row, rationale: ngnItem.rationale, credit: detail.credit } :
        { item_id: row.item_id, question_type: row.question_type, selected_answer: row.selected_answer },
    });
  } else if (item.item_type === 'casestudy') {
    const submitted = body.caseAnswers;
    if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) {
      throw new HttpError(400, 'Case-study responses are required.');
    }
    const children = keys.filter(row => row.parent_item_id === itemId).sort((a, b) => a.sequence_order - b.sequence_order);
    if (children.length !== item.case_length || Object.keys(submitted).length !== children.length) {
      throw new HttpError(400, 'Complete every item in the case study before submitting.');
    }
    for (const child of children) {
      const subId = child.item_id.slice(itemId.length + 1);
      const answer = decodeAnswer(attempt, child.item_id, submitted[subId]);
      if (!Object.hasOwn(submitted, subId) || !Array.isArray(answer) || !answer.length) {
        throw new HttpError(400, 'Complete every item in the case study before submitting.');
      }
      outcomes.push(score(child, answer, answeredAt));
    }
  } else {
    if (body.answer === undefined || body.answer === null) throw new HttpError(400, 'A response is required.');
    outcomes.push(score(item, decodeAnswer(attempt, itemId, body.answer), answeredAt));
  }

  const priorRows = await responseRows(context.service, attempt.id);
  const historyBefore = selectionHistory(priorRows, keys, attempt.checkpoint);
  let ability = Number(attempt.ability_estimate ?? 0.5);
  const newHistory = [...historyBefore];
  for (const outcome of outcomes) {
    if (!ngnItem && !versioned) ability = updateAbility(ability, outcome.isCorrect, item.difficulty);
    newHistory.push({
      id: outcome.item_id,
      sourceId: item.item_id,
      difficulty: item.difficulty,
      blueprint: item.blueprint,
      nclex_category: item.nclex_category,
      core_tags: item.core_tags || [],
      correct: outcome.isCorrect,
      ...(versioned ? { evidenceGroup: item.item_id, evidenceComplete: !ngnResult || ngnResult.final,
        evidenceCredit: outcome.isCorrect ? 1 : ngnResult ? ngnResult.state.responses[outcome.item_id].credit.score : 0 } : {}),
    });
  }
  if (versioned) {
    if (ngnResult?.final) ability = updateNGNAbility(ability, ngnResult.evidenceScore, item.difficulty);
    else if (!ngnResult) ability = updateNGNAbility(ability, outcomes.filter(o => o.isCorrect).length / outcomes.length, item.difficulty);
    if (ngnResult?.final) newHistory.forEach(row => { if (row.evidenceGroup === item.item_id) row.evidenceComplete = true; });
  }

  const requirements = await coreRequirements(context.service);
  let result: string | null = null;
  const continuingCase = ngnResult && !ngnResult.final;
  if (!continuingCase && versioned && (mode === 'nclex' || mode === 'mock')) result = shouldStopNGN(newHistory, ability, requirements, mode);
  else if (!continuingCase && mode === 'nclex') result = shouldStop(newHistory, ability, requirements);
  else if (!continuingCase && mode === 'mock') result = shouldStopMock(newHistory, ability, requirements);
  else if (mode === 'assessment' && newHistory.length >= attempt.target_questions) result = null;
  if (!versioned && mode === 'nclex' && newHistory.length >= 45) result ||= ability >= 0.6 ? 'PASS' : 'FAIL';
  if (!versioned && mode === 'mock' && newHistory.length >= 150) result ||= ability >= 0.6 ? 'PASS' : 'FAIL';
  const reachedTarget = !continuingCase && (mode === 'assessment'
    ? newHistory.length >= attempt.target_questions
    : mode === 'nclex' || mode === 'mock'
      ? Boolean(result) || (versioned && newHistory.length >= attempt.target_questions)
      : newHistory.length >= attempt.target_questions);
  const next = continuingCase ? item : reachedTarget ? null : pickNextQuestion(
    keys.filter(row => row.selectable),
    newHistory,
    attempt.checkpoint.profile || { mode },
    ability,
    requirements,
    attempt.target_questions,
  );
  const complete = reachedTarget || !next;
  if (complete && !versioned && (mode === 'nclex' || mode === 'mock')) result ||= ability >= 0.6 ? 'PASS' : 'FAIL';

  const nextRevision = revision + 1;
  const checkpoint = {
    ...attempt.checkpoint,
    currentItemId: next?.item_id || null,
    ability,
    answeredItemIds: newHistory.map(row => row.id),
    draft: { selected: [], btState: { left: [], center: [], right: [] }, csAnswers: {}, submitted: false },
    examTimer: cleanExamTimer(body.examTimer, mode) || attempt.checkpoint.examTimer || null,
  };
  if (versioned) {
    const stateCheckpoint = { ...attempt.checkpoint, ...(ngnResult ? { ngnState: ngnResult.state } : {}) };
    checkpoint.ngnState = ngnResult && !ngnResult.final ? ngnResult.state : selectCurrent(stateCheckpoint, next);
    checkpoint.currentItemId = currentInteraction(checkpoint)?.id || next?.item_id || null;
    checkpoint.completionReason = complete ? result ? 'confidence-rule' : reachedTarget ? 'item-limit-or-fixed-length' : 'insufficient-items' : null;
  }
  const { data: committed, error: commitError } = await context.service.rpc('commit_in_house_diagnostic_answer', {
    p_attempt_id: attempt.id,
    p_expected_revision: revision,
    p_responses: outcomes.map(outcome => outcome.databaseRow(attempt.id)),
    p_checkpoint: checkpoint,
    p_ability_estimate: Number(ability.toFixed(3)),
    p_result: result,
    p_complete: complete,
  });
  if (commitError) {
    if (commitError.message.includes('Assessment response conflict or attempt is no longer active')) {
      throw new HttpError(409, 'This assessment changed in another session. Reload and resume.');
    }
    throw commitError;
  }
  if (!committed || (Array.isArray(committed) && committed.length !== 1)) throw new HttpError(409, 'This assessment changed in another session. Reload and resume.');

  const allRows = await responseRows(context.service, attempt.id);
  const reveal = canReveal({ status: complete ? 'completed' : 'in_progress', checkpoint });
  const responses = historyFor(allRows, keys, reveal, checkpoint);
  return {
    attemptId: attempt.id,
    checkpointRevision: nextRevision,
    totalQuestions: newHistory.length,
    correctQuestions: reveal ? newHistory.filter(row => row.correct).length : null,
    abilityEstimate: reveal ? Number(ability.toFixed(3)) : null,
    result,
    completed: complete,
    nextItemId: checkpoint.currentItemId,
    nextItem: publicInteraction(checkpoint),
    scoringModel: attempt.checkpoint.scoringModel || 'in-house-core-v1',
    completionReason: checkpoint.completionReason || null,
    outcomes: outcomes.map(outcome => outcome.toClient(reveal)),
    responses,
  };
}

function score(item: Record<string, any>, submitted: unknown, answeredAt: string) {
  const answer = selectedAnswer(item, submitted);
  const expected = correctAnswer(item);
  const isCorrect = answersEqual(answer, expected);
  const storedAnswer = item.parent_item_id ? submitted : answer;
  const row = {
    item_id: item.item_id,
    item_source: item.item_source || 'existing-original-bank',
    blueprint: item.blueprint,
    nclex_category: item.nclex_category,
    topic: item.topic || null,
    cognitive_level: item.cognitive_level || null,
    difficulty: item.difficulty,
    question_type: item.item_type,
    selected_answer: storedAnswer,
    correct_answer: expected,
    is_correct: isCorrect,
    answered_at: answeredAt,
  };
  return {
    ...row,
    isCorrect,
    databaseRow: (attemptId: string) => ({ ...row, attempt_id: attemptId }),
    toClient: (reveal: boolean) => ({
      item_id: row.item_id,
      question_type: row.question_type,
      selected_answer: row.selected_answer,
      ...(reveal ? {
        correct_answer: row.correct_answer,
        is_correct: row.is_correct,
        rationale: item.rationale || null,
      } : {}),
    }),
  };
}

async function abandonAttempt(context: Awaited<ReturnType<typeof createContext>>, body: Record<string, any>) {
  if (!context.student) throw new HttpError(403, 'No student profile is linked to this account.');
  const attemptId = requiredString(body.attemptId, 'Attempt ID');
  const { data: attempt, error: readError } = await context.service
    .from('in_house_assessment_attempts')
    .select('checkpoint')
    .eq('id', attemptId)
    .eq('student_id', context.student.id)
    .maybeSingle();
  if (readError) throw readError;
  if (!attempt) return { abandoned: false };
  requireCompatibleClient(attempt, body);
  const { data, error } = await context.service
    .from('in_house_assessment_attempts')
    .update({ status: 'abandoned', updated_at: new Date().toISOString() })
    .eq('id', attemptId)
    .eq('student_id', context.student.id)
    .eq('status', 'in_progress')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return { abandoned: Boolean(data) };
}

async function reviewAttempt(context: Awaited<ReturnType<typeof createContext>>, body: Record<string, any>) {
  const attemptId = requiredString(body.attemptId, 'Attempt ID');
  const { data: attempt, error } = await context.service
    .from('in_house_assessment_attempts')
    .select('id,student_id,assessment_key,mode,status,checkpoint')
    .eq('id', attemptId)
    .maybeSingle();
  if (error) throw error;
  if (!attempt) throw new HttpError(404, 'Assessment attempt not found.');
  if (!context.isAdmin && (!context.student || attempt.student_id !== context.student.id)) {
    throw new HttpError(403, 'You cannot view this assessment review.');
  }
  if (attempt.status !== 'completed') throw new HttpError(403, 'Question review is available after the assessment is complete.');
  requireCompatibleClient(attempt, body);
  const keys = await itemKeys(context.service, attempt.checkpoint?.mode === 'remediation' ? 'remediation' : 'diagnostic');
  const rows = await responseRows(context.service, attempt.id);
  return { responses: historyFor(rows, keys, true, attempt.checkpoint), scoringModel: attempt.checkpoint?.scoringModel || 'in-house-core-v1' };
}

export default {
  async fetch(request: Request) {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
    if (request.method !== 'POST') return reply(request, { error: 'Method not allowed.' }, 405);
    const origin = request.headers.get('Origin') ?? '';
    if (origin && !allowedOrigins.has(origin)) return reply(request, { error: 'Origin not allowed.' }, 403);

    try {
      const context = await createContext(request);
      const body = await request.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Request body is invalid.');
      let result: unknown;
      switch (body.action) {
        case 'start': result = await startAttempt(context, body); break;
        case 'resume': result = await resumeAttempt(context, body); break;
        case 'checkpoint': result = await checkpointAttempt(context, body); break;
        case 'answer': result = await answerAttempt(context, body); break;
        case 'abandon': result = await abandonAttempt(context, body); break;
        case 'review': result = await reviewAttempt(context, body); break;
        default: throw new HttpError(400, 'Assessment action is not supported.');
      }
      return reply(request, result as object);
    } catch (error) {
      if (error instanceof HttpError) return reply(request, { error: error.message }, error.status);
      console.error(error);
      return reply(request, { error: 'The assessment service could not complete this request.' }, 500);
    }
  },
};
