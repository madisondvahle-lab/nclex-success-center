# Question-Bank QA Automation (pilot)

Status: dashboard and failure-handling fixes published through PRs #230, #231, and #232. After funding, one authenticated Q-0024 retry succeeded, but its proposed correction failed educational-quality review. Pilot expansion remains paused. Criteria v3 historical-regression improvements were merged in #234, deployed to the Edge Function, and verified on GitHub Pages.
Follows `.agents/tasks/question-bank-audit.md` (protocol) and `.agents/CLINICAL-STANDARDS.md`.

## What exists
- `supabase-question-audit.sql` (APPLIED to live DB 2026-10-19): table `question_audits` (one row per audit; cached by question + content hash + criteria version) and admin-only RPC `set_question_quarantine(question_id, quarantine, reason)`. Rollback: drop function, drop table.
- `supabase/functions/shared/question-audit-core.mjs`: free deterministic checks (content hash, SATA/MCQ scoring sync, field-level validation, answer-clue signals, whitespace auto-fix, priority). Used by the function AND the dashboard; stored outside Jekyll's ignored `_shared` folder so GitHub Pages can serve it.
- `supabase/functions/question-audit/index.ts`: admin-only, one question per call. Screen (gpt-4.1-mini) -> revise (gpt-4.1) -> blind answer/quality review (gpt-4o) -> separate original-versus-revised improvement comparison (gpt-4o), max 2 revision attempts, $0.25 standard per-question budget. Models are overridable via function secrets `AUDIT_SCREEN_MODEL`, `AUDIT_REVISE_MODEL`, `AUDIT_VERIFY_MODEL`. Uses the existing `OPENAI_API_KEY` secret. Writes only `question_audits` and `question_revision_drafts` (status `pending_review`) using the admin's own session (RLS applies).
- `question-audit-panel.js` + small hooks in `question-bank-review.html` (Review & Flags tab): batch builder, run/pause/resume, spend cap, results with filters, batch approve (approve only), quarantine/release. Correction editor now syncs scoring JSON and shows field-specific errors.
- Tests: `supabase/functions/_shared/question-audit.test.mjs`, `supabase/functions/question-audit/question-audit.test.mjs` (mocked DB/AI), `tests/question-audit-wiring.test.cjs`.

## Existing-question editor fix (release pending approval)
- `question-bank-review.html` supplies the bank's `item_type` and stable ID
  when older interaction data omits them. Conflicting stored interaction
  types block saving rather than silently converting the question.
- Standard standalone MCQ/SATA show their answer controls without a clinical
  record builder. Existing NGN charts, scoring settings, and cases retain
  their controls. Structured option rationales and references are available
  in direct edits and correction drafts without JSON editing.
- Opening and typing do not save. Existing-question correction drafts still
  require separate save, approval, and application.
- Authenticated read-only Q-1008 verification: `item_type=sata`, `is_ngn=false`,
  six options, five correct selections, and six option rationales. Its
  `item_data` has only `options` and `correct`, confirming the missing nested
  type/ID compatibility bug. The locally routed candidate loaded its saved
  correction draft and supported unsaved choice/key/rationale edits.
  Database readback confirmed the question and draft were unchanged.
- Regression coverage: `tests/existing-question-author.test.cjs`. This release
  has no schema, Edge Function, student assessment, or NGN CAT changes.
- Release validation: 85 focused authoring, correction, scoring, legacy
  assessment, and immutable-history regression tests passed; JavaScript
  syntax and whitespace checks passed. Browser checks using synthetic
  fixtures passed for MCQ, SATA, matrix, cloze, highlight, bow-tie, numeric,
  and unfolding-case controls, saved keys, and editable individual rationales.
  These used local candidate files routed into the authenticated browser;
  they are not a deployment or live database save test.
- Safe Delete compatibility (2026-10-25): integrated deployed main merge
  `04700cc` from PR #250 without conflicts in an isolated editor worktree.
  The combined editor, correction-draft, NGN/scoring/history, and Safe Delete
  Node suite passed 94/94 tests. Syntax and whitespace checks passed.
- The disposable local PostgreSQL suite passed checks 1-9 and 2b, migration
  re-application, rollback/re-application, and concurrency checks A-G.
  Student-history fixtures remained unchanged; concurrent student writes
  had zero failed transactions. The test container was removed afterward.
  No production database reads or writes were performed in this integration.
- The deployed Safe Delete UI function section, SQL, rollback, and tests
  remain byte-for-byte identical to main. Relative to main, PR #249 still
  contains only the five editor-related source, test, and documentation
  files, with no migration or student-history changes. Merge and deployment
  remain pending separate owner authorization.

## Rules baked in
- Questions with a pending/approved draft are skipped and never overwritten.
- Revisions keep UUID, question_no, type, topic, category, references (no AI-invented citations).
- Quarantine only flags; removing a question from student assessments is a manual, reversible button (flips `questions.active`, previous state restored on release).
- Blind-verifier agreement is a safeguard, not clinical validation; every draft still needs tutor approval and a separate apply.

## Findings (2026-10-19, deterministic scan of all 1,133 questions)
- 417 review count = 412 unique questions (379 imported drafts awaiting first review + 36 pending correction drafts, 3 overlap) + 5 open "discuss" flags.
- 898 duplicate results = candidate pairs covering 656 questions; 0 exact; 156 pairs >= 50% wording overlap.
- Keyed answer is the longest option in 61% of MCQs (chance is 25%); 113 questions contain coaching phrases; 657 have no option rationales; 89 store references as bare URLs (editor expects title+url).
- Scoring/structure problems on published items: Q-0366 and Q-0371 have option_rationales keyed `A`-`D` (editor/validator expect `a`-`d`).
- NCLEX category has about 23 spellings/variants (e.g. "Health Promotion & Maintenance" vs "...and...", "pharm", "safe_effective_care"): topic/category standardization is a separate, still-pending step.
- Student response data uses text item IDs (100 rows) and cannot be tied to questions; not used as a signal.

## Remaining
1. Keep Q-0024's existing pending draft untouched and unpublished. It has not passed the new gates. The live original remains hard; the saved legacy draft was medium, not hard.
2. Not yet built: sampling-based QA of passed items, taxonomy standardization, defect-propagation flags, audit of duplicates.

## Manual quarantine re-audit
- Quarantine results offer **Re-audit with current criteria**. Confirming queues only that question; the owner must then click **Run audit**. Normal batch building still excludes quarantined questions.
- Admin-only requests send the quarantined audit UUID, reuse that record under the current criteria, and archive the previous complete findings, verification, outcomes, and cumulative usage/cost in `findings.audit_history`. The new outcome is stored separately in `findings.current_audit_outcome`; the row remains quarantined until explicitly released. Question activation and quarantine timestamps are untouched.
- Both dashboard and function block pending/approved correction drafts. Existing unique-open-draft protection, scoring validation, two-attempt limit, per-request budget, and $2 dashboard cap remain in effect. No schema change, paid audit, live question update, or correction publication is part of this change.
- Validation: 98 focused audit, dashboard, editor, wiring, and navigation tests pass, including cross-version and same-version manual re-audits, full history/cumulative usage, failed-run retries, draft/admin guards, scoring, and spending limits.

## First pilot failure: verified diagnosis
- All 10 saved error records contain OpenAI HTTP 429, `insufficient_quota` / `credit_balance_exhausted`. Zero tokens and estimated cost; the configured API project has no remaining credits. ChatGPT subscription billing is separate.
- Historical deployed request logs show browser function POST 200, auth user lookup 200, `is_app_admin` 200, question/draft/cache reads 200, audit inserts 201, and dashboard refreshes 200. Callers match `app_admins`. Authentication, browser connectivity, and audit-table write permissions were not the cause.
- The old function returned provider failures as HTTP-200 error results. The dashboard counted those as finished and continued all 10 questions.
- Owner explicitly chose "I will restore credits later; fix the software first." Do not change secrets or claim successful real AI validation.
- Read-only baseline during investigation: 1,133 questions, 490 active, 120 correction drafts, 10 error audits for 10 questions. The earlier 491 active count changed outside this task.

## Failure-handling fix
- Actionable provider quota/configuration errors, non-2xx responses, and structured sanitized failure logs.
- Dashboard stops on the first failure, distinguishes completed/failed/skipped, and keeps failed questions selectable for a manual retry. Refresh failures stay visible.
- Retries update the matching failed audit UUID and preserve earlier error notes and cumulative usage/cost. Successful retries clear stale failure state. Existing successful-cache and open-draft checks prevent repeat audits/drafts.
- Dashboard cap defaults to and cannot exceed $2; remaining budget is forwarded to each request. AI completion limits reserve estimated prompt/output cost before calls. Costs remain estimates based on configured model prices.
- No schema changes; no automatic apply, approval, publication, or quarantine actions.
- Tests include mocked backend persistence/retry/provider failures and dashboard first-error stop, manual resume, $2 cap, remaining-budget forwarding, refresh failures, and run/build guards. Mocked authentication is not a successful real authenticated audit.
- Validation: 60 focused tests cover the audit core, Edge Function, panel behavior/wiring, correction editor, and student navigation, including pre-request budget rejection and cumulative paid-retry usage. Live read-only counts still match the investigation baseline: 1,133 questions, 490 active, 120 drafts, 10 error audits, $0 audit cost.
- Updated Edge Function deployed with `supabase functions deploy question-audit --project-ref pmjwwktwlsqpetwfvolb --use-api`. No database migration or live records were changed.

## Criteria v2 quality gates
- Work resumed from the existing uncommitted implementation, without restarting or adding features.
- Screening and blind review require a complete, individually justified plausibility assessment for every option, four explicit cueing checks, overall acceptability, and a justified difficulty rating. Missing assessments block acceptance. Hard requires multi-cue reasoning and competing priorities.
- Deterministic checks reject Q-0024's original and paraphrased parent-notification, glucose-wait, and routine-recheck distractors, and explanation phrases inside answer choices.
- Blind review remains isolated from the key, rationales, original item, and screening findings. Key agreement alone cannot pass quality concerns.
- A separate comparison must document material improvement for every identified weakness. Option shuffling, unchanged items, cosmetic paraphrase, and rationale expansion that leaves weak choices intact are rejected.
- Clinically related replacement scenarios are permitted within the same category/topic and preserved identifiers/module/type. Both writer and independent comparison must agree on replacement and justify it; existing draft protections remain first.
- All gates must pass before saving a pending draft. At most two attempts; budget and deadline checks still apply to every AI call. No automatic approval, application, or publication.
- Dashboard distinguishes legacy key-only checks from new quality-gated results and displays rejection evidence, including when later work hits a budget error.
- Validation: 83 focused tests pass, including exact Q-0024 regression wording, poor-quality rejection despite key agreement, cosmetic-change rejection, difficulty, replacement constraints, scoring, retries/drafts, budget, editor, and navigation. AI/database responses are mocked; no paid audit was run to validate v2.
- Pre-deployment read-only baseline: 1,133 questions, 490 active, 121 drafts, 10 audit records. Full-row question fingerprint `d8971cf2a48c65fa403cacdaa4872b92`; draft fingerprint `3b738057f2dd106427d609949571d264`.
- Remaining limitation: semantic plausibility and improvement still rely on AI judgment plus tutor review; automated tests do not prove future generated corrections meet clinical/educational standards.

## Criteria v3 historical-regression improvements
- Reviewed saved failures for Q-0943, Q-0059, Q-1008, Q-0371, Q-0366, Q-1125, and Q-0863, plus proposed drafts Q-0394/Q-0396. Valid RACE actions, assessment/escalation, improving trends, leadership alternatives, and newborn warming must not be rejected solely for being lower priority; unrelated presbyopia, IV-push potassium, and an unverifiable mislabeled syringe remain rejectable.
- Screening and blind review now distinguish appropriate lower-priority interventions, plausible misconceptions, clinically implausible options, and ambiguity. Each distractor needs learner appeal and stem-based distinction; four independent cueing dimensions and actual difficulty are assessed. A correct key does not imply item quality.
- Writer planning captures the assessed objective and distractor rationale privately. A blind reviewer evaluates the revised item without key/rationales/original; a separate comparison checks objective/category preservation, clinical and rationale accuracy, NCLEX relevance, and evidence that each named weakness was materially resolved. Retries use specific findings and preserve accepted content. Only verified drafts can be saved.
- Regression fixtures cover the historical examples, including Q-0024's weak choices and hard label; Q-0394/Q-0396 examples test that valid lower-priority actions remain plausible while bundled-answer cueing and unsafe actions are flagged. Choices remain rationale-free; scoring, two-attempt/cost limits, open-draft checks, and nonpublication safeguards remain in place.
- Validation: 89 focused audit, editor, wiring, and navigation tests pass; syntax and diff checks pass. Criteria v3 was merged through PR #234 (`aa64e5d`), deployed as Edge Function `question-audit` v7, and verified from the portal with a cache-busted request.
- No audit request, paid AI call, migration, live question/draft update, approval, or publication was performed during this work. No post-deployment database query was run; deployment uploaded function code only.
