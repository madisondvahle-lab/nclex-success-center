# Module 6 Endocrine Build Handoff

## Task
Build the current Module 6 Endocrine student module against the current secure NCLEX Success Center architecture. This is a NEW current-curriculum implementation, not a restoration of historical `module6-guide.html`.

## Curriculum authority
- Current M6 topic: **Endocrine**.
- Historical repository M6 topic: **Fluids, Electrolytes & Acid-Base**.
- Historical M6 must not be restored, renamed, or copied wholesale into current M6.
- Historical Fluids/Electrolytes content may be preserved for later reassignment to a future module number only after explicit curriculum approval.

## Verified repository finding
No Endocrine implementation commit or PR was found in the Success Center repository. Existing GitHub references to current M6 Endocrine are documentation/status references only. Treat current M6 as a build task, not a recovery task.

## Before building
1. Read `/AGENTS.md`.
2. Read `.agents/STATUS.md`.
3. Read `.agents/PROJECT.md`.
4. Read `.agents/CLINICAL-STANDARDS.md`.
5. Review the secure M3 recovery pattern for authentication, student access verification, result storage, and dashboard navigation.

## Architecture requirements
- Require current Supabase Auth session.
- Resolve the authenticated student using `students.auth_user_id`.
- Verify `student_module_access` for `module_key = 'm6'` before opening student content.
- Save scored practice results through the RLS-protected `module_results` pattern once its migration is live.
- Navigate to `student-dashboard.html`, not a student-specific legacy hub.
- Do not point students to `question-bank.html` or any internal/admin tool.
- Do not weaken RLS or restore public/PIN-only access patterns.

## Clinical-content rule
The coding agent must not invent or silently expand Endocrine clinical content from memory. Use only clinical content specifically supplied/approved for the current M6 build. Clinical editing is not implied by a technical implementation task.

## Current content direction already established outside the historical repo
The current curriculum work identifies M6 as Endocrine and includes a core Endocrine module plus an extension/deep-dive direction around understanding hormones and why endocrine patients crash. The repository does not yet contain the authoritative current Endocrine source content, so a coding agent must request/use the approved source material rather than substituting historical M6.

## Acceptance criteria
- M6 is Endocrine everywhere in the current student-facing implementation.
- No historical Fluids/Electrolytes M6 content is accidentally restored under M6.
- Student access is authenticated and assignment-gated.
- No hard-coded student identity/email is present.
- No legacy `mailto:` result workflow is used.
- Clinical content matches the specifically approved current Endocrine source.
- M6 remains unassignable until the student-facing implementation and result flow are validated.

## Known dependency
Authoritative current M6 Endocrine guide/question content must be supplied or located from the newer curriculum work before a coding agent can safely build the clinical module. Do not fill that gap by guessing.