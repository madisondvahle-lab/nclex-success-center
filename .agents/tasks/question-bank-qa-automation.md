# Question-Bank QA Automation (pilot)

Status: pilot dashboard published through PRs #230 and #231. First 10-question pilot failed; no live question changes or correction drafts resulted. Failure-handling fix tracked in PR #232; updated Edge Function deployed. Successful live AI validation is blocked on API funding.
Follows `.agents/tasks/question-bank-audit.md` (protocol) and `.agents/CLINICAL-STANDARDS.md`.

## What exists
- `supabase-question-audit.sql` (APPLIED to live DB 2026-10-19): table `question_audits` (one row per audit; cached by question + content hash + criteria version) and admin-only RPC `set_question_quarantine(question_id, quarantine, reason)`. Rollback: drop function, drop table.
- `supabase/functions/shared/question-audit-core.mjs`: free deterministic checks (content hash, SATA/MCQ scoring sync, field-level validation, answer-clue signals, whitespace auto-fix, priority). Used by the function AND the dashboard; stored outside Jekyll's ignored `_shared` folder so GitHub Pages can serve it.
- `supabase/functions/question-audit/index.ts` (DEPLOYED): admin-only, one question per call. Screen (gpt-4.1-mini) -> revise (gpt-4.1) -> blind verify (gpt-4o), max 2 revision attempts, $0.25 per-question cap. Models are overridable via function secrets `AUDIT_SCREEN_MODEL`, `AUDIT_REVISE_MODEL`, `AUDIT_VERIFY_MODEL`. Uses the existing `OPENAI_API_KEY` secret. Writes only `question_audits` and `question_revision_drafts` (status `pending_review`) using the admin's own session (RLS applies).
- `question-audit-panel.js` + small hooks in `question-bank-review.html` (Review & Flags tab): batch builder, run/pause/resume, spend cap, results with filters, batch approve (approve only), quarantine/release. Correction editor now syncs scoring JSON and shows field-specific errors.
- Tests: `supabase/functions/_shared/question-audit.test.mjs`, `supabase/functions/question-audit/question-audit.test.mjs` (mocked DB/AI), `tests/question-audit-wiring.test.cjs`.

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
1. Dashboard publication follows PR #232 to `main` and GitHub Pages, not Netlify. Verify the deployed panel matches the merged source.
2. Owner will restore OpenAI API credits later. Successful authenticated AI processing and live result persistence remain unverified until funding and an admin session are available. Verify one controlled question first; do not automatically run another 10-question batch.
3. Not yet built: sampling-based QA of passed items, taxonomy standardization, defect-propagation flags, audit of duplicates.

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
