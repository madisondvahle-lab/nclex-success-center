# Question Safe Delete

## Current task
Permanent deletion of master-QBank questions failed with
`question_revision_drafts_question_id_fkey` (drafts and `question_audits` are `on delete restrict`).

## Status
DEPLOYED 2026-10-25. PR #250 merged (merge commit `04700cc`, from `5074ddc`); GitHub Pages build for
`04700cc` completed 18:10 UTC and the live page matches. Migration applied to production Supabase
(project `pmjwwktwlsqpetwfvolb`) at ~18:08 UTC from commit `5074ddc` (file SHA-256 prefix
`c3075e1e0f122cc0`), preceded by `set lock_timeout = '5s'`; applied in one pass, no errors.

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

## Production deployment record (2026-10-25)
- Preflight (read-only): fresh production schema dump identical to the tested dump; all 15 referenced
  tables/columns present; 5 FKs to `questions` as tested; no existing triggers or name conflicts;
  tables owned by `postgres`; daily physical backups present (latest 2026-10-25 08:58 UTC, 8 retained).
  Point-in-time recovery is OFF: a backup restore rewinds the whole database to that day's backup.
- Pre-deploy export (outside the repo, owner-only permissions):
  `~/nclex-backups/safe-delete-preflight-20261025/` - questions (1,133), revision drafts (131),
  audits (17), with `SHA256SUMS` and `README.txt`; counts, ids, and per-row content verified against
  production.
- Post-apply verification: 7 functions, 2 enabled triggers (`before/row`, `after/statement`);
  `authenticated` can execute only `question_deletion_blockers` and `delete_questions_permanently`;
  `anon` cannot; archive has RLS, admin-only SELECT, 0 rows. Questions/drafts/audits/student counts
  unchanged. Read-only eligibility: 147 protected by history, 349 blocked only because active,
  637 deletable.
- Live test: disposable inactive question Q-1135 ("SAFE-DELETE TEST", one saved correction draft, no
  other links) created and deleted by the owner through the live Delete forever button.
  - Q-1135 and its draft are gone from `questions` / `question_revision_drafts`.
  - `question_deletion_archive` has exactly 1 row: full question snapshot (stem, rationale, inactive)
    plus the draft; `deleted_by` is an app admin.
  - Fingerprints of all other questions, drafts, audits, flags, practice-set entries, and all nine
    student/assessment tables are identical before and after.
  - Access (tested in a rolled-back transaction): student sees 0 archive rows and cannot run the
    blocker check, delete, or insert into the archive; anon cannot read; admin can read 1 row but
    cannot update or delete it.
- Rollback: `supabase-question-safe-delete-rollback.sql` removes the triggers/functions and keeps the
  archive. Deleted questions are not restored automatically (manual re-insert from `question_snapshot`).

## Operating notes
- Make a question inactive before deleting; protected questions offer Make inactive instead.
- Test only with newly created disposable questions; use the read-only blocker check for existing ones.

## Follow-up (separate PR, not started)
Retire workflow. It must also fix historical practice reviews so students still see question text,
answers, and rationales for questions they encountered that are now inactive or retired.
