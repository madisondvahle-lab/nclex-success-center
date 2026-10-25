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
- `question-bank-review.html`: Delete checks blockers, names the exact reason, deletes only eligible
  questions, and offers Make inactive for published protected questions.
- Rollback: `supabase-question-safe-delete-rollback.sql` (keeps the archive; does not restore deletions).

## Validation (2026-10-25)
- `tests/question-safe-delete-local.sh`: 9 synthetic checks + rollback, local Postgres or disposable Docker.
- Production schema dump (structure only) restored locally: migration applied twice cleanly; smoke test passed.
- `node --test tests/*.test.cjs tests/*.test.mjs`: 276/276 (baseline 270/270).
- Read-only live preview: 147 of 1,133 questions protected (65 practice history, 75 practice sets,
  19 student flags); 106 unused questions with drafts become deletable.

## Remaining
Owner approval -> merge PR -> apply migration in Supabase SQL editor -> verify -> deploy page.
