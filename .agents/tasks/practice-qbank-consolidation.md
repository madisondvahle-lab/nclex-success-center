# Assigned practice sets in the Question Bank

## Current state

The NCLEX assigned-sets section now reads Safety & Priority, Medication & Procedure Safety, NGN Acute Care Judgment, and NUR 215 Foundations from the master `questions` table. `question_set_items` preserves set membership, order, and each legacy question ID, so existing practice history remains stable. The migration imports 66 MCQs and 9 SATA items, reuses exact bank matches and activates inactive matches (user-approved), and stops rather than duplicating questions with conflicting rationales.

The UI change is complete and the Supabase migration was successfully applied on 2026-10-16. Supabase returned the expected counts: 5 Safety & Priority, 5 Medication & Procedure Safety, 5 NGN Acute Care Judgment, and 60 NUR 215 Foundations (75 total).

## Required database step

The database step is complete; do not rerun the migration. It was applied in the Supabase SQL Editor after:

- `supabase-question-bank-review.sql`
- `supabase-question-item-types.sql`
- `supabase-question-numbers.sql`

The script creates the RLS-protected `question_set_items` mapping and activates exact matching bank questions so they become available in the shared student QBank. Successful counts were verified as 5, 5, 5, and 60. The page change can now be deployed.

## Validation and constraints

- Run `node --test tests/practice-question-selection.test.cjs`.
- Preserve the original question IDs, stems, choices, answers, and rationales. Clinical content changes are out of scope.
- Other embedded practice sets remain unchanged.
- The portal deploys from GitHub Pages using `main` and the repository root. The live database migration succeeded; no page deployment or merge was performed in this task.
