# Module 3 Recovery Handoff

## Task
Recover Module 3 Pharmacology from verified repository history, preserve clinical content exactly during technical recovery, and adapt it to the current secure Success Center architecture before enabling student assignment.

## Current checkpoint
- Source commit reviewed: `2d70267535c431a622cdde415dfb0c273d35b6a5`.
- Historical `module3-guide.html` blob SHA: `22362b0f45ff41e3ceeac273e7fc1fb9b1f9f65a`.
- Branch `restore/m3-verbatim` recovered that verified source and then applied only technical sanitization through `.agents/tools/sanitize_m3_legacy.py`.
- `module3-secure.html` verifies the current Supabase session, resolves the authenticated student, verifies `student_module_access` for `m3`, and only then loads the recovered M3 page.
- The supported M3 result action saves to the authenticated student's RLS-protected `module_results` record.
- Source-level legacy student-specific name/email, `mailto:` result delivery, old `quiz_results` writes, and legacy hub/neighbor navigation have been removed from `module3-guide.html`.
- Direct source opening now fails back to `student-dashboard.html` for result saving rather than using a legacy/public workflow.
- Top and bottom module navigation now route to the current student dashboard.
- The embedded PQ and QQ clinical banks remain locked; technical recovery does not authorize clinical edits.
- Keep PR #19 draft until the manual Supabase prerequisites and live authenticated flow validation are complete.

## Clinical-content authorization
- [x] Clinical content is locked for technical recovery. Do not rewrite stems, choices, answers, rationales, medication facts, teaching points, or question IDs.
- [ ] Clinical editing is authorized.

## Completed technical adaptation
1. Historical M3 source recovered from the verified commit.
2. Authenticated M3 launcher created.
3. M3 assignment/access verification added before supported launch.
4. Reusable RLS-protected `module_results` migration created.
5. Supported M3 result action saves to the authenticated student's `module_results` record.
6. Source-level hard-coded prior-student identifiers/result-email code removed.
7. Source-level legacy hub/M2/M4 navigation replaced with `student-dashboard.html`.
8. Fail-closed sanitizer and independent recovery validator added.
9. GitHub branch workflow added to execute the sanitizer/validation path without regenerating the large clinical HTML file.
10. Clinical/question content remains locked and must not be altered during remaining activation work.

## Required next work
1. Run the two manual Supabase prerequisites listed below.
2. After those migrations succeed, validate the supported student flow through `module3-secure.html` with an authenticated student who has M3 enabled.
3. Confirm a completed practice result writes to `module_results` under that authenticated student's `student_id`.
4. Only then update the M3 module catalog to the secure launcher and restore new M3 assignment controls.
5. Update `.agents/STATUS.md` when M3 becomes safely assignable.

## Acceptance criteria
- Student M3 never links to `question-bank.html` or another admin/internal tool.
- Current Supabase Auth/RLS protections are not weakened.
- Supported student launch path checks authenticated identity and M3 assignment.
- Historical clinical content is not silently rewritten during recovery.
- No student name/email is hard-coded in the live M3 source or result workflow.
- No `mailto:` or old `quiz_results` result path remains.
- Existing M3 access rows may be preserved.
- New M3 assignment stays disabled until the student-facing implementation is validated.

## Manual steps pending — activation blocker
These require Supabase SQL Editor access and must not be guessed or simulated from GitHub:

1. Run `supabase-module3-safe-placeholder-migration.sql` once to clear the legacy `question-bank.html` M3 guide/quiz URLs while preserving existing access rows.
2. Run `supabase-module-results-migration.sql` once before live M3 result saving is enabled.
3. Verify both migrations complete successfully before changing catalog URLs or re-enabling new M3 assignment.

## Scope intentionally deferred
- Checklist progress remains browser `localStorage` for this recovery. Migrating checklist state is a separate feature and is not required to safely restore M3.
- Do not restore obsolete PIN/public access patterns.
