# Module 3 Recovery Handoff

## Task
Recover Module 3 Pharmacology from verified repository history, preserve clinical content exactly during technical recovery, and adapt it to the current secure Success Center architecture before enabling student assignment.

## Current checkpoint
- Source commit reviewed: `2d70267535c431a622cdde415dfb0c273d35b6a5`.
- Historical `module3-guide.html` blob SHA: `22362b0f45ff41e3ceeac273e7fc1fb9b1f9f65a`.
- Branch `restore/m3-verbatim` restores that exact blob at `module3-guide.html`.
- No clinical wording, questions, answers, rationales, or IDs were changed in the recovery commit.
- Added `supabase-module-results-migration.sql` to create an authenticated, RLS-protected `module_results` table that can be reused by M3-M6.
- Added `module3-secure.html` as a small authenticated launcher. It verifies the current Supabase session, resolves the authenticated student, verifies `student_module_access` for `m3`, and only then loads the recovered M3 page.
- The secure launcher is a checkpoint, not the final implementation.
- Do NOT merge this PR yet. The recovered page still contains legacy hard-coded student/result/email behavior that must be removed or replaced.

## Clinical-content authorization
- [x] Clinical content is locked for technical recovery. Do not rewrite stems, choices, answers, rationales, medication facts, teaching points, or question IDs.
- [ ] Clinical editing is authorized.

## Legacy behavior identified inside recovered M3
- Result saving is hard-coded to Alyssa Dababneh and a personal email address.
- The completion action opens a `mailto:` result email.
- Navigation points to legacy hub/module paths such as `alyssa-hub.html` and historical neighboring module pages.
- Checklist progress uses browser `localStorage`.

## Required next work
1. Preserve all educational and question content verbatim.
2. Replace the legacy hard-coded result/email behavior with authenticated student result saving through `module_results`.
3. Replace legacy hub navigation with `student-dashboard.html` and current Success Center navigation.
4. Decide whether checklist progress remains local-only or is intentionally migrated later; do not silently broaden scope.
5. Keep the internal Question Bank Manager separate from the student module.
6. Validate the student-facing flow through `module3-secure.html`.
7. Only after the page is technically safe, update the M3 module catalog to the secure launcher and re-enable M3 assignment.
8. Update `.agents/STATUS.md` when M3 becomes safely assignable.

## Acceptance criteria
- Student M3 never links to `question-bank.html` or another admin/internal tool.
- Current Supabase Auth/RLS protections are not weakened.
- Direct student launch path checks authenticated identity and M3 assignment.
- Historical clinical content is not silently rewritten during recovery.
- No student name/email is hard-coded in the live M3 result workflow.
- Existing M3 access rows may be preserved.
- New M3 assignment stays disabled until the student-facing implementation is ready.

## Manual steps pending
1. Run `supabase-module3-safe-placeholder-migration.sql` once in Supabase SQL Editor to clear legacy `question-bank.html` M3 guide/quiz URLs while preserving access rows.
2. Before live result saving is enabled, run `supabase-module-results-migration.sql` once in Supabase SQL Editor.

## Risks / unresolved items
- The historical page is large and includes embedded teaching content and practice questions.
- Its old client-side behavior predates current authentication, results, and dashboard architecture.
- A static HTML asset can still be requested by URL; the supported student entry point should therefore be the authenticated launcher, and the historical file should not be catalog-linked directly.
- Do not solve incompatibilities by restoring obsolete PIN/public access patterns.
