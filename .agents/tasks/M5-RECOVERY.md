# Module 5 Recovery Handoff

## Task
Recover Module 5 Respiratory from verified repository history, preserve clinical content exactly during technical recovery, and adapt it to the current secure Success Center architecture before enabling student assignment.

## Current checkpoint
- Source commit reviewed: `2d70267535c431a622cdde415dfb0c273d35b6a5`.
- Historical `module5-guide.html` blob SHA: `d4b42b20eeeccaf6916d25a3ee99bfa0e0d29729`.
- Historical M5 remains aligned with the current Respiratory topic.
- `module5-guide.html` has now been sanitized on the recovery branch using the guarded technical recovery path.
- Prior-student name/email values, legacy `quiz_results`, `mailto:`, and historical personal/module navigation were removed from the student result/navigation path.
- The completion action now bridges to `window.parent.saveM5Result(...)`, and direct unsupported opening routes the student back to `student-dashboard.html`.
- `module5-secure.html` requires Supabase Auth, resolves the authenticated student, verifies `student_module_access` for `m5`, and saves results to that student's `module_results` record.
- Sanitizer/validator clinical-bank boundary logic is whitespace-tolerant and compares PQ/QQ content against the verified historical source.
- The sanitizer is idempotent after successful cleanup while remaining fail-closed on partial/mixed legacy state.
- Do NOT merge/activate M5 yet. The shared database dependency and authenticated end-to-end result insertion still need verification.

## Clinical-content authorization
- [x] Clinical content is locked for technical recovery. Do not rewrite stems, choices, answers, rationales, medication facts, teaching points, or case-study content.
- [ ] Clinical editing is authorized.

## Completed technical recovery
1. Exact historical M5 source recovered on a branch.
2. Authenticated M5 launcher added.
3. M5 assignment/access verification added before supported launch.
4. Result bridge targets the shared authenticated/RLS-protected `module_results` table.
5. Legacy prior-student identifiers, `mailto:`, `quiz_results`, and obsolete navigation removed from the module source.
6. Sanitizer preserves the embedded PQ and QQ clinical question blocks.
7. Sanitizer and validator were updated to handle the historical blank-line formatting safely.
8. Sanitizer made idempotent while remaining fail-closed on partial/mixed legacy state.

## Required next work
1. Apply and verify the shared `module_results` Supabase migration before enabling M5 result saving.
2. With an authenticated test student who has M5 enabled, launch through `module5-secure.html` and verify a completed practice result inserts into `module_results` under that student's ID.
3. Keep M5 unassignable until that secure end-to-end flow is validated.
4. Only then update the module catalog/assignment UI and `.agents/STATUS.md`.

## Acceptance criteria
- No hard-coded student name/email remains in the live M5 source or result workflow.
- No anonymous result writes or `mailto:` result workflow remain.
- No internal/admin tool is used as the student module.
- Current Auth/RLS protections are preserved.
- PQ and QQ clinical question banks remain unchanged from the verified historical source during technical recovery.
- M5 remains unassignable until the secure student-facing implementation is validated.

## Database dependency / manual step
M5 result saving depends on `supabase-module-results-migration.sql`. Never assume it has been applied to production. A human with Supabase SQL access must run and verify that migration before M5 can be activated.

## M6 warning
Do not copy the historical M6 recovery pattern forward by module number. Historical M6 is `Fluids, Electrolytes & Acid-Base` (blob `99560fd8e4961d1b72ad6261f6facaf8a2e5499f`), while the current curriculum direction assigns M6 to Endocrine. Historical M6 is recoverable source material only and must not overwrite current M6 Endocrine.
