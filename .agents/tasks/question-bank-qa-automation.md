# Question-Bank QA Automation (pilot)

Status: pilot built; no audits run yet; nothing applied or published.
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
1. Commit/push the front-end (panel JS + page hooks) to `main` so the live dashboard shows the panel (GitHub Pages).
2. Run the 10-question pilot from the dashboard, review drafts and cost, evaluate reliability before enlarging batches.
3. Not yet built: sampling-based QA of passed items, taxonomy standardization, defect-propagation flags, audit of duplicates.
