# Access-control validation findings — October 12, 2026

This is a **review checklist**, not evidence of completed student-session testing.

## Verified in production metadata (read only)
- `questions`, `student_courses`, `student_resources`, and `students` have RLS enabled.
- `questions` has an administrator-only policy; ordinary students cannot read QBank rows until an appropriate SELECT policy is installed.
- `student_courses` currently has no SELECT policy for ordinary students.
- `student_resources` has an own-student SELECT policy.
- There are 261 active general questions and 88 active course-specific questions (63 in `nur321 / nur321-ob-exam1`, 25 in `nur321-ob / exam1`).
- Only one active `student_courses` registration exists, using `nur321-ob`. Do not assume every course-exam URL has an enrollment row.
- **Separate high-priority security finding:** `students` has a policy named `allow_anon_update_students` with UPDATE `USING (true)` for PUBLIC. The authenticated role has UPDATE table grants. Permissive RLS policies combine with OR, so this policy may let any authenticated user modify student rows outside their own account. Although the `anon` role does not appear to have UPDATE table privileges, the policy still applies to authenticated users.

## Action required BEFORE rollout
1. Safely remove or narrow the permissive `students` UPDATE policy. `student-dashboard.html` does legitimately update the current student's `course_name` and `exam_date` during onboarding; admin pages update other student properties. A safe fix must preserve these approved flows **without** granting unrestricted updates to sensitive `students` columns. Consider narrowly scoped RPCs or column-level permissions.
2. Apply the proposed question/enrollment RLS migration in **staging** and verify a non-admin student can read 261 active general questions, not the 88 course-specific questions without valid authorization.
3. Verify students authorized for each course/exam can load their practice through a matching `student_courses` row or an explicit assigned resource. Test `nur321` and `nur321-ob` separately.
4. Verify anonymous and unrelated authenticated users cannot see course-specific question rows or alter other students.
5. Verify admin question editing and course administration still work.
6. Review whether the legacy `jack-nur312-exam1` static practice route needs the same assignment gate.
7. Only then apply a reviewed production migration, test again, and merge the UI PR.

**Do not merge this PR or run the migration based only on source inspection.**
