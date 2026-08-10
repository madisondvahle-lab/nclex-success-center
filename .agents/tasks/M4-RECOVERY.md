# Module 4 Recovery Handoff

## Task
Recover Module 4 Cardiovascular from verified repository history and adapt it to the current secure Success Center architecture without rewriting clinical content during technical recovery.

## Current checkpoint
- Source commit reviewed: `2d70267535c431a622cdde415dfb0c273d35b6a5`.
- Historical `module4-guide.html` blob SHA: `cfff8c587583d1b10ed5013b79f63ee280574697`.
- Branch `restore/m4-verbatim` began from that exact historical source.
- `module4-guide.html` has now been sanitized by the guarded GitHub recovery workflow.
- Prior-student name/email values, legacy `quiz_results`, `mailto:`, and historical personal/module navigation were removed from the student result/navigation path.
- The completion action now bridges to `window.parent.saveM4Result(...)`, and direct unsupported opening routes the student back to `student-dashboard.html`.
- `module4-secure.html` requires Supabase Auth, resolves the authenticated student, verifies `student_module_access` for `m4`, and saves results to that student's `module_results` record.
- The guarded sanitizer and independent validator use whitespace-tolerant clinical-bank boundaries and compare PQ/QQ content against the verified historical source.
- GitHub Actions recovery validation passed after sanitization. The sanitizer is now idempotent so later branch updates do not falsely fail merely because the legacy code is already gone.
- Do NOT merge/activate M4 yet. The database dependency and authenticated end-to-end result insertion still need verification.

## Clinical-content authorization
- [x] Clinical content is locked for technical recovery.
- [ ] Clinical editing is authorized.

Do not rewrite stems, answer choices, keyed answers, rationales, medication facts, case-study data, teaching points, or question IDs while performing architecture recovery.

## Completed technical recovery
1. Exact historical M4 source recovered on a branch.
2. Authenticated M4 launcher added.
3. M4 assignment/access verification added before supported launch.
4. Result bridge targets the shared authenticated/RLS-protected `module_results` table.
5. Legacy prior-student identifiers, `mailto:`, `quiz_results`, and obsolete navigation removed from the module source.
6. Sanitizer verified PQ and QQ clinical question blocks were unchanged.
7. Independent recovery validator passed in GitHub Actions.
8. Sanitizer made idempotent while remaining fail-closed on partial/mixed legacy state.

## Required next work
1. Apply and verify the shared `module_results` Supabase migration before enabling M4 result saving.
2. With an authenticated test student who has M4 enabled, launch through `module4-secure.html` and verify a completed practice result inserts into `module_results` under that student's ID.
3. Keep M4 unassignable until that secure end-to-end flow is validated.
4. Only then update the module catalog/assignment UI and `.agents/STATUS.md`.

## Acceptance criteria
- No hard-coded student name/email in the live M4 source or result workflow.
- No anonymous result writes.
- No legacy personal-hub navigation in the supported student path.
- Current Supabase Auth/RLS protections are preserved.
- PQ and QQ clinical question banks remain unchanged from the verified historical source during technical recovery.
- M4 assignment remains disabled until the secure student implementation is validated.

## Database dependency / manual step
M4 result saving depends on `supabase-module-results-migration.sql`. Never assume it has been applied to production. A human with Supabase SQL access must run and verify that migration before M4 can be activated.
