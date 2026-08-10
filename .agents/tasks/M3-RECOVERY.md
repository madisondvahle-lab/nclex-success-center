# Module 3 Recovery Handoff

## Task
Recover Module 3 Pharmacology from verified repository history, preserve clinical content exactly during technical recovery, and adapt it to the current secure Success Center architecture before enabling student assignment.

## Current checkpoint
- Source commit reviewed: `2d70267535c431a622cdde415dfb0c273d35b6a5`.
- Historical `module3-guide.html` blob SHA: `22362b0f45ff41e3ceeac273e7fc1fb9b1f9f65a`.
- Branch `restore/m3-verbatim` restores that exact historical blob at `module3-guide.html`.
- No clinical wording, questions, answers, rationales, or IDs were changed in the recovery commit.
- Draft PR #19 exists for this recovery/rebuild and is intentionally not ready to merge.
- Legacy behavior identified: M3 hard-codes Alyssa's name/email when saving/emailing quiz results and links back to legacy student hubs/module guide routes.
- `supabase-module-results-migration.sql` has been added on this branch as the reusable authenticated/RLS-protected results path for M3+ modules.
- Do NOT merge the restored historical page directly to main yet. It still needs its legacy client behavior adapted.

## Clinical-content authorization
- [x] Clinical content is locked for technical recovery. Do not rewrite stems, choices, answers, rationales, medication facts, teaching points, or question IDs.
- [ ] Clinical editing is authorized.

## Required next work
1. Remove/replace legacy student-specific result code without changing clinical content.
2. Require a valid Supabase Auth session and confirm the authenticated user maps to a `students` row before allowing student result submission.
3. Save completed practice results to `module_results` with `module_key='m3'` rather than hard-coded names/emails or anonymous writes.
4. Replace legacy navigation (`alyssa-hub.html`, obsolete module guide links) with the current `student-dashboard.html` flow.
5. Keep the internal Question Bank Manager separate from the student module.
6. Validate the student-facing page and only then restore M3 to the module catalog/assignment UI.
7. Update `.agents/STATUS.md` when M3 becomes safely assignable.

## Acceptance criteria
- Student M3 never links to `question-bank.html` or another admin/internal tool.
- Current Supabase Auth/RLS protections are not weakened.
- No individual student's name/email is hard-coded in M3.
- Historical clinical content is not silently rewritten during recovery.
- Results are attributable to the authenticated student's `student_id`.
- Existing M3 access rows may be preserved.
- New M3 assignment stays disabled until the student-facing implementation is ready.

## Manual steps pending
1. Run `supabase-module3-safe-placeholder-migration.sql` once in Supabase SQL Editor to clear legacy `question-bank.html` M3 guide/quiz URLs while preserving access rows.
2. Before re-enabling M3 assignment, run `supabase-module-results-migration.sql` once to create the authenticated/RLS-protected `module_results` table.

## Risks / unresolved items
- The historical page is large and includes embedded teaching content and practice questions.
- Its old client-side behavior is not compatible with current authentication/results/dashboard architecture as-is.
- Do not solve those incompatibilities by restoring obsolete PIN/public access patterns.
- The current M1/M2 standalone practice pages are not themselves a sufficient security pattern for M3 recovery; use the current Supabase Auth/RLS student identity model.
