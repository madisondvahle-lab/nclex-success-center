# Module 5 Recovery Handoff

## Task
Recover Module 5 Respiratory from verified repository history, preserve clinical content exactly during technical recovery, and adapt it to the current secure Success Center architecture before enabling student assignment.

## Current checkpoint
- Source commit reviewed: `2d70267535c431a622cdde415dfb0c273d35b6a5`.
- Historical `module5-guide.html` blob SHA: `d4b42b20eeeccaf6916d25a3ee99bfa0e0d29729`.
- Historical M5 is Respiratory Disorders and remains aligned with the current curriculum topic for M5.
- Historical M5 uses the same legacy result/email pattern identified in M3 and M4.

## Clinical-content authorization
- [x] Clinical content is locked for technical recovery. Do not rewrite stems, choices, answers, rationales, medication facts, teaching points, or case-study content.
- [ ] Clinical editing is authorized.

## Legacy behavior identified
- Practice-result saving is hard-coded to Alyssa Dababneh and a personal email address.
- Completion uses `mailto:` and the old `quiz_results` workflow.
- Navigation points to `alyssa-hub.html` and historical neighboring module guide pages.
- Checklist progress uses browser `localStorage`.

## Shared recovery pattern
M3-M5 should use the same current technical pattern:
1. Supabase Auth session required.
2. Resolve the authenticated student by `auth_user_id`.
3. Verify `student_module_access` for the module key.
4. Save practice results to the RLS-protected `module_results` table.
5. Navigate back to `student-dashboard.html` rather than a student-specific legacy hub.
6. Keep checklist persistence local unless a separate task explicitly migrates it.

## Acceptance criteria
- No hard-coded student name/email remains in the live result workflow.
- No `mailto:` result workflow remains in the supported student path.
- No internal/admin tool is used as the student module.
- Current Auth/RLS protections are preserved.
- Clinical content is not silently rewritten.
- M5 remains unassignable until the secure student-facing implementation is validated.

## M6 warning
Do not copy the historical M6 recovery pattern forward by module number. Historical M6 is `Fluids, Electrolytes & Acid-Base` (blob `99560fd8e4961d1b72ad6261f6facaf8a2e5499f`), while the current curriculum direction assigns M6 to Endocrine. Historical M6 is recoverable source material only and must not overwrite current M6 Endocrine.
