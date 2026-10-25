# Question Safe Delete

## Current task
Permanent deletion of master-QBank questions failed with
`question_revision_drafts_question_id_fkey` (drafts and `question_audits` are `on delete restrict`).

## Status
Branch `agents/question-safe-delete`; PR open. Migration NOT applied to Supabase. Not deployed.

## Design
- `supabase-question-safe-delete.sql`: `question_deletion_blockers` (admin), `delete_questions_permanently`
  (admin, all-or-nothing), a `before delete` trigger on `questions` that covers every delete path, and
  admin-read-only `question_deletion_archive` (full question row, drafts, audits, admin flags, import tracking).
- Blocks deletion when the question UUID appears anywhere in a row of: student practice results,
  in-house/CAT responses (`item_id` containing the UUID, e.g. `qbank:<uuid>`, or equal to `source_key`),
  assessment attempts, `student_resources` (weekly assignment `question_ids`), `student_assignment_revisions`,
  quiz/module/diagnostic results, exam reports; plus `question_set_items` (prevents its cascade) and
  student-submitted flags. Fails closed if any protected table is missing.
- Unused questions: archive, then remove drafts/audits and the question. Import tracking and admin-only
  flags keep the existing `set null` behavior (their rows are archived first).
- Only inactive questions can be permanently deleted ("still active (visible to students); make it inactive first").
- Race protection (all in the database, for every delete path):
  - question rows are locked (`for update`, 2 s timeout) so they cannot be published mid-delete;
  - per row (`before delete`): active status, practice sets, student flags (before FK actions run);
  - per statement (`after delete`, transition table): full student-record scan with no lock, then
    `lock table ... in share mode nowait` on the 11 student/assessment tables and a re-scan of only rows
    written by transactions still running or started after the first scan (`xmin` vs snapshot xmin).
  - Students are held only during that re-check (9 ms at 10x, 7 ms at 100x production volume); reads are
    never blocked. NOWAIT keeps the delete out of the lock queue (no student queues behind it, no
    deadlock); after ~2 s of retries it gives up: "students are saving work right now" (55P03).
  - Refused outside read committed (an older snapshot could miss new saves).
- Residual: a browser practice session or CAT request that loaded the question while it was still
  active can save results after it was made inactive and deleted. Student rows stay intact and the
  archive keeps the question content; only the review text for that item is missing (same as Make
  inactive today). Possible future mitigation: a cooling-off period after inactivation.
- `question-bank-review.html`: Delete checks blockers, names the exact reason, deletes only eligible
  questions, and offers Make inactive for published protected questions.
- Rollback: `supabase-question-safe-delete-rollback.sql` (keeps the archive; does not restore deletions).

## Validation (2026-10-25)
- `tests/question-safe-delete-local.sh`: synthetic checks 1-9 + 2b, rollback, re-apply, then
  `tests/question-safe-delete-concurrency.sh` (A-G: in-flight practice save, CAT checkpoint `qbank:` id,
  CAT answer, busy back-off, reads not blocked, isolation guard, pgbench load with 0 failed student
  transactions).
- Production-schema copy timings (admin delete time; students are not held for this):
  10x volume: 1 question 0.2-0.4 s, 100 questions 0.5-0.9 s; 100x: 1 question 2.0 s, 100 questions 4.0 s.
  Admin requests time out at 8 s, so at much larger volumes select fewer questions per delete.
- Production schema dump (structure only) restored locally: migration applied twice cleanly; smoke test passed.
- `node --test tests/*.test.cjs tests/*.test.mjs`: 279/279 (baseline 270/270).
- Read-only live preview: 147 of 1,133 questions protected (65 practice history, 75 practice sets,
  19 student flags); 106 unused questions with drafts become deletable.

## Remaining
Owner approval -> apply migration in Supabase SQL editor -> read-only verification (functions, grants,
both triggers) -> merge PR -> hard-refresh page -> create a NEW disposable inactive test question and
delete it -> check an existing protected question with the read-only blocker check only.
Never delete existing question-bank content to test.

## Follow-up (separate PR)
Retire workflow. It must also fix historical practice reviews so students still see question text,
answers, and rationales for questions they encountered that are now inactive or retired.
