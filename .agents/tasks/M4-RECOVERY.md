# Module 4 Recovery Handoff

## Task
Recover Module 4 Cardiovascular from verified repository history and adapt it to the current secure Success Center architecture without rewriting clinical content during technical recovery.

## Current checkpoint
- Source commit reviewed: `2d70267535c431a622cdde415dfb0c273d35b6a5`.
- Historical `module4-guide.html` blob SHA: `cfff8c587583d1b10ed5013b79f63ee280574697`.
- Branch `restore/m4-verbatim` restores that exact historical blob at `module4-guide.html`.
- Historical M4 uses the same legacy result/email pattern identified in M3: Alyssa-specific name/email values, writes to legacy `quiz_results`, opens a `mailto:`, and points navigation at historical hub/module files.
- Do NOT merge this restored file directly to main yet.

## Clinical-content authorization
- [x] Clinical content is locked for technical recovery.
- [ ] Clinical editing is authorized.

Do not rewrite stems, answer choices, keyed answers, rationales, medication facts, case-study data, teaching points, or question IDs while performing architecture recovery.

## Shared recovery pattern
Use the same secure architecture being established for M3:
1. Authenticated Supabase session required.
2. Resolve current student through `students.auth_user_id`.
3. Verify `student_module_access` for `m4` before launch.
4. Save practice results through authenticated/RLS-protected `module_results`, not legacy `quiz_results` or hard-coded student data.
5. Route navigation back to `student-dashboard.html` rather than historical personal hubs.
6. Keep internal/admin question-bank tooling separate from student modules.

## Acceptance criteria
- No hard-coded student name/email in the live M4 result workflow.
- No anonymous result writes.
- No legacy personal-hub navigation in the supported student path.
- Current Supabase Auth/RLS protections are preserved.
- Clinical content is not silently rewritten during technical recovery.
- M4 assignment remains disabled until the secure student implementation is validated.

## Important implementation note
The GitHub connector available during this recovery can replace whole files but cannot safely apply a tiny partial patch to a 900+ line clinical HTML file. Do not regenerate the entire historical source merely to change a few technical lines. Prefer an auditable patch-capable coding workflow (Codex/Copilot/local git) for source-level sanitization, or preserve the module in draft recovery state until that is available.
