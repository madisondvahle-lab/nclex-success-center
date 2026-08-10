# Module 4 Recovery Handoff

## Task
Recover Module 4 Cardiovascular from verified repository history and adapt it to the current secure Success Center architecture without rewriting clinical content during technical recovery.

## Current checkpoint
- Source commit reviewed: `2d70267535c431a622cdde415dfb0c273d35b6a5`.
- Historical `module4-guide.html` blob SHA: `cfff8c587583d1b10ed5013b79f63ee280574697`.
- Branch `restore/m4-verbatim` restores that exact historical blob at `module4-guide.html`.
- Historical M4 uses the same legacy result/email pattern identified in M3: prior-student name/email values, writes to legacy `quiz_results`, opens a `mailto:`, and points navigation at historical hub/module files.
- Added `.agents/tools/sanitize_m4_legacy.py`, a fail-closed source sanitizer that removes only legacy technical wiring and verifies the embedded PQ/QQ banks are byte-for-byte unchanged before writing.
- Added `module4-secure.html`, which requires Supabase Auth, resolves the authenticated student, verifies `student_module_access` for `m4`, and saves results to the authenticated student's `module_results` record.
- Main now contains `.github/workflows/recovery-sanitizers.yml`, restricted to same-repository M4/M5 recovery branches. This branch update intentionally triggers that guarded sanitizer/validator path.
- Do NOT merge this restored module to main until sanitizer/validator completion is confirmed and the database dependency is satisfied.

## Clinical-content authorization
- [x] Clinical content is locked for technical recovery.
- [ ] Clinical editing is authorized.

Do not rewrite stems, answer choices, keyed answers, rationales, medication facts, case-study data, teaching points, or question IDs while performing architecture recovery.

## Completed technical preparation
1. Exact historical M4 source recovered on a draft branch.
2. Authenticated M4 launcher added.
3. M4 assignment/access verification added before supported launch.
4. Result bridge targets the shared authenticated/RLS-protected `module_results` table.
5. Fail-closed source sanitizer added to remove prior-student identifiers, `mailto:`, legacy `quiz_results`, and obsolete navigation.
6. Sanitizer explicitly verifies PQ and QQ clinical question blocks remain identical.
7. Guarded main-branch recovery workflow is available to execute and validate the sanitizer without regenerating the large clinical HTML file.

## Required next work
1. Confirm the guarded recovery workflow sanitizes `module4-guide.html` and passes `validate_m4_recovery.py`.
2. Confirm no prior-student identifiers, `mailto:`, or `quiz_results` remain in `module4-guide.html`.
3. After the shared `module_results` migration is applied, validate `module4-secure.html` with an authenticated student who has M4 enabled and verify a result inserts under that student's ID.
4. Keep M4 unassignable until the secure flow is validated.
5. Only then update the module catalog/assignment UI and `.agents/STATUS.md`.

## Acceptance criteria
- No hard-coded student name/email in the live M4 source or result workflow.
- No anonymous result writes.
- No legacy personal-hub navigation in the supported student path.
- Current Supabase Auth/RLS protections are preserved.
- PQ and QQ clinical question banks are unchanged during sanitization.
- M4 assignment remains disabled until the secure student implementation is validated.

## Database dependency
M4 result saving depends on the shared `module_results` migration introduced with M3. Never assume it has been applied to production. Do not enable M4 result saving until that migration has been run and verified.

## Runtime limitation
The local automation/container runtime cannot resolve `github.com`, so source patching is delegated only to the guarded GitHub recovery workflow and fail-closed module validator. Do not regenerate the 900+ line clinical source through the connector.
