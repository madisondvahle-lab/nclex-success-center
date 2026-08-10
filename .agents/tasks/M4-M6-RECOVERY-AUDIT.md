# M4-M6 Recovery Source Audit

## Purpose
Record verified historical source locations and technical/privacy hazards before any recovery work touches student-facing module code.

## Source checkpoint
Historical source commit reviewed: `2d70267535c431a622cdde415dfb0c273d35b6a5`.

### M4 Cardiac
- Historical file: `module4-guide.html`
- Verified blob SHA: `cfff8c587583d1b10ed5013b79f63ee280574697`
- Curriculum topic remains aligned with current M4 Cardiac direction.
- Historical page contains substantive teaching content, 25-question practice content, quick quiz, case studies, and checklist.
- Legacy result workflow is hard-coded to Alyssa Dababneh / a personal email address and writes to the old `quiz_results` path.
- Legacy navigation points to historical module pages and `alyssa-hub.html`.
- Clinical content is LOCKED during technical recovery.

### M5 Respiratory
- Historical file: `module5-guide.html`
- Verified blob SHA: `d4b42b20eeeccaf6916d25a3ee99bfa0e0d29729`
- Curriculum topic remains aligned with current M5 Respiratory direction.
- Historical page contains substantive teaching/practice content.
- Legacy result workflow is hard-coded to Alyssa Dababneh / a personal email address and writes to the old `quiz_results` path.
- Legacy navigation must not be restored as current architecture.
- Clinical content is LOCKED during technical recovery.

### Historical M6
- Historical file: `module6-guide.html`
- Verified blob SHA: `99560fd8e4961d1b72ad6261f6facaf8a2e5499f`
- Historical topic is `Fluids, Electrolytes & Acid-Base`.
- This is NOT the current M6 curriculum direction. Current M6 is Endocrine.
- Historical M6 content may be reusable later under a newly approved module number, but must never overwrite current M6 Endocrine.
- Historical result workflow also contains Alyssa-specific legacy code.

## Shared technical pattern discovered
M3, M4, M5, and historical M6 were built with the same legacy assumptions:
1. substantive module content embedded in static HTML
2. embedded practice-question engine
3. client-side checklist/localStorage
4. hard-coded student-specific result email/save behavior
5. legacy neighboring-module/hub navigation

The reusable secure recovery pattern should therefore be:
1. preserve clinical/teaching/question content exactly unless clinical editing is explicitly authorized
2. authenticate through current Supabase Auth
3. verify `student_module_access` before supported module launch
4. save results to authenticated/RLS-protected `module_results`
5. navigate back to `student-dashboard.html`
6. never expose or restore hard-coded student names/emails
7. keep internal question-bank tooling separate from student modules

## M3 blocker that affects later recovery
The GitHub connector available in ChatGPT replaces entire files but does not provide a targeted patch operation. Do not regenerate a ~1,000+ line clinical module solely to remove a few legacy technical strings. Use a coding workspace/agent capable of safe targeted edits for source sanitization, then verify the diff contains only technical changes.

## Current implementation order
1. Finish M3 source sanitization and secure result/navigation adaptation.
2. Validate M3 and re-enable assignment only after required SQL migrations are run.
3. Apply the verified technical pattern to M4.
4. Apply the verified technical pattern to M5.
5. Build current M6 Endocrine from the current curriculum source. Do not restore historical M6 as Module 6.

## Clinical authorization
- [x] Clinical content locked for M4/M5 recovery audit.
- [x] Historical M6 content is archival/recovery-only and not authorized as current M6.
- [ ] Clinical editing authorized.
