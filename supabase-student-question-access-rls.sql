-- Proposed migration: run only after testing on a staging or test account.
-- Intent: let authenticated students read general NCLEX questions and only
-- those course questions attached to their own enrollment or exact exam resource.
-- Keeps the pre-existing "admins manage questions" policy untouched.
-- This is not executed automatically by the pull request.

BEGIN;

CREATE POLICY "students read own active course enrollment"
ON public.student_courses
FOR SELECT TO authenticated
USING (
  active = true AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = student_courses.student_id
      AND s.auth_user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "students read authorized practice questions"
ON public.questions
FOR SELECT TO authenticated
USING (
  active = true
  AND EXISTS (
    SELECT 1 FROM public.students s WHERE s.auth_user_id = (SELECT auth.uid())
  )
  AND (
    (course_key IS NULL AND exam_key IS NULL)
    OR (
      course_key IS NOT NULL AND exam_key IS NOT NULL AND (
        EXISTS (
          SELECT 1 FROM public.student_courses sc
          JOIN public.students s ON s.id = sc.student_id
          WHERE s.auth_user_id = (SELECT auth.uid())
            AND sc.active = true
            AND sc.course_key = questions.course_key
        )
        OR EXISTS (
          SELECT 1 FROM public.student_resources sr
          JOIN public.students s ON s.id = sr.student_id
          WHERE s.auth_user_id = (SELECT auth.uid())
            AND sr.url = (
              'supplemental-practice.html?course=' ||
              questions.course_key || '&exam=' || questions.exam_key
            )
        )
      )
    )
  )
);

COMMIT;

-- Validation after applying:
-- SELECT policyname,roles,cmd,qual FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('questions','student_courses');
-- Test via signed-in non-admin accounts: own course, unassigned course, mixed.
