# Module 3 Recovery Handoff

## Task
Recover Module 3 Pharmacology from verified repository history, preserve clinical content exactly during technical recovery, and adapt it to the current secure Success Center architecture before enabling student assignment.

## Current checkpoint
- Source commit reviewed: `2d70267535c431a622cdde415dfb0c273d35b6a5`.
- Historical `module3-guide.html` blob SHA: `22362b0f45ff41e3ceeac273e7fc1fb9b1f9f65a`.
- Branch `restore/m3-verbatim` restores that exact blob at `module3-guide.html`.
- No clinical wording, questions, answers, rationales, or IDs were changed in the recovery commit.
- Added `supabase-module-results-migration.sql` to create an authenticated, RLS-protected `module_results` table reusable by M3-M6.
- Added `module3-secure.html` as an authenticated launcher. It verifies the Supabase session, resolves the authenticated student, verifies `student_module_access` for `m3`, and only then loads the recovered M3 page.
- The launcher now bridges the legacy practice-result action to authenticated `module_results` saving and changes legacy neighboring-module/hub links to the current `student-dashboard.html` route when loaded through the supported path.
- The secure launcher is still a checkpoint, not the final implementation.
- Do NOT merge this PR yet. The recovered source file itself still contains legacy hard-coded student/result/email code, even though the supported launcher overrides that behavior at runtime. That code must be removed from the live source before merge.

## Clinical-content authorization
- [x] Clinical content is locked for technical recovery. Do not rewrite stems, choices, answers, rationales, medication facts, teaching points, or question IDs.
- [ ] Clinical editing is authorized.

## Legacy behavior identified inside recovered M3
- Source-level result code is hard-coded to a prior student name/email.
- The historical completion action opens a `mailto:` result email.
- Historical navigation points to legacy hub/module paths.
- Checklist progress uses browser `localStorage`.

## Completed technical adaptation
1. Authenticated M3 launcher created.
2. M3 assignment/access verification added before supported launch.
3. Reusable RLS-protected `module_results` migration created.
4. Supported M3 result action now saves to the authenticated student's `module_results` record through the launcher bridge.
5. Supported launcher replaces legacy Hub/M2/M4 links with the current study-plan route at runtime.
6. Clinical/question content remains untouched.

## Required next work
1. Remove the source-level hard-coded prior-student name/email/result-email code from `module3-guide.html` without altering clinical/question content.
2. Replace source-level legacy navigation so the page is safe even if opened outside the wrapper.
3. Decide whether checklist progress remains local-only or is intentionally migrated later; do not silently broaden scope.
4. Validate the student-facing flow through `module3-secure.html`.
5. Only after the source is technically safe, update the M3 module catalog to the secure launcher and re-enable M3 assignment.
6. Update `.agents/STATUS.md` when M3 becomes safely assignable.

## Acceptance criteria
- Student M3 never links to `question-bank.html` or another admin/internal tool.
- Current Supabase Auth/RLS protections are not weakened.
- Direct supported student launch path checks authenticated identity and M3 assignment.
- Historical clinical content is not silently rewritten during recovery.
- No student name/email is hard-coded in the live M3 source or result workflow.
- Existing M3 access rows may be preserved.
- New M3 assignment stays disabled until the student-facing implementation is ready.

## Manual steps pending
1. Run `supabase-module3-safe-placeholder-migration.sql` once in Supabase SQL Editor to clear legacy `question-bank.html` M3 guide/quiz URLs while preserving access rows.
2. Before live result saving is enabled, run `supabase-module-results-migration.sql` once in Supabase SQL Editor.

## Risks / unresolved items
- The historical page is large and includes embedded teaching content and practice questions.
- Its old client-side behavior predates current authentication, results, and dashboard architecture.
- A static HTML asset can still be requested by URL; do not rely on the wrapper alone to sanitize source-level legacy identifiers/behavior.
- Do not solve incompatibilities by restoring obsolete PIN/public access patterns.
