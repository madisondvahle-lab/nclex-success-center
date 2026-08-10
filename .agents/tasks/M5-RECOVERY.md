# Module 5 Recovery Handoff

## Task
Recover Module 5 Respiratory from verified repository history, preserve clinical content exactly during technical recovery, and adapt it to the current secure Success Center architecture before enabling student assignment.

## Current checkpoint
- Source commit reviewed: `2d70267535c431a622cdde415dfb0c273d35b6a5`.
- Historical `module5-guide.html` blob SHA: `d4b42b20eeeccaf6916d25a3ee99bfa0e0d29729`.
- Historical M5 remains aligned with the current Respiratory topic.
- Historical M5 uses the same legacy result/email pattern identified in M3 and M4.
- Added `.agents/tools/sanitize_m5_legacy.py`, a fail-closed source sanitizer that removes only legacy technical wiring and verifies the embedded PQ/QQ banks are byte-for-byte unchanged before writing.
- Added `module5-secure.html`, which requires Supabase Auth, resolves the authenticated student, verifies `student_module_access` for `m5`, and saves results to the authenticated student's `module_results` record.
- Do NOT merge this restored module to main yet. The sanitizer still needs to be executed against `module5-guide.html` and the resulting diff validated.

## Clinical-content authorization
- [x] Clinical content is locked for technical recovery. Do not rewrite stems, choices, answers, rationales, medication facts, teaching points, or case-study content.
- [ ] Clinical editing is authorized.

## Completed technical preparation
1. Exact historical M5 source recovered on a draft branch.
2. Authenticated M5 launcher added.
3. M5 assignment/access verification added before supported launch.
4. Result bridge targets the shared authenticated/RLS-protected `module_results` table.
5. Fail-closed source sanitizer added to remove prior-student identifiers, `mailto:`, legacy `quiz_results`, and obsolete navigation.
6. Sanitizer explicitly verifies PQ and QQ clinical question blocks remain identical.

## Required next work
1. In a patch-capable checkout of `restore/m5-verbatim`, run `python3 .agents/tools/sanitize_m5_legacy.py`.
2. Run `git diff --check` and inspect the `module5-guide.html` diff. Only navigation/result plumbing should change.
3. Confirm no prior-student identifiers, `mailto:`, or `quiz_results` remain in `module5-guide.html`.
4. Validate `module5-secure.html` with an authenticated student who has M5 enabled and verify a result inserts into `module_results` under that student's ID.
5. Keep M5 unassignable until the secure flow is validated.
6. Only then update the module catalog/assignment UI and `.agents/STATUS.md`.

## Acceptance criteria
- No hard-coded student name/email remains in the live M5 source or result workflow.
- No anonymous result writes or `mailto:` result workflow remain.
- No internal/admin tool is used as the student module.
- Current Auth/RLS protections are preserved.
- PQ and QQ clinical question banks are unchanged during sanitization.
- M5 remains unassignable until the secure student-facing implementation is validated.

## Database dependency
M5 result saving depends on the shared `module_results` migration introduced on the M3 recovery branch. Never assume it has been applied to production. Do not enable M5 result saving until that migration has been run and verified.

## M6 warning
Do not copy the historical M6 recovery pattern forward by module number. Historical M6 is `Fluids, Electrolytes & Acid-Base` (blob `99560fd8e4961d1b72ad6261f6facaf8a2e5499f`), while the current curriculum direction assigns M6 to Endocrine. Historical M6 is recoverable source material only and must not overwrite current M6 Endocrine.

## Runtime limitation observed
The automation/container runtime cannot resolve `github.com` for local git clone, and the GitHub connector only performs whole-file replacements. Therefore the sanitizer is prepared but has not been executed from this runtime. Do not regenerate the 900+ line clinical source to work around that limitation.
