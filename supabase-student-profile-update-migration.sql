-- Restrict student profile updates to admins and a self-service RPC.
-- Run in Supabase SQL Editor before deploying the student dashboard change.
-- Requires supabase-secure-access-migration.sql for public.is_app_admin().

BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS course_name text,
  ADD COLUMN IF NOT EXISTS exam_date date;

DROP POLICY IF EXISTS "allow_anon_update_students" ON public.students;
DROP POLICY IF EXISTS "admins only update students" ON public.students;
-- Restrictive policies are ANDed with permissive policies, so the existing
-- admin policy remains required and no broader student policy can grant UPDATE.
CREATE POLICY "admins only update students"
  ON public.students
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

REVOKE UPDATE ON TABLE public.students FROM anon, PUBLIC;
GRANT UPDATE ON TABLE public.students TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_student_profile(
  p_course_name text,
  p_exam_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  IF p_course_name IS NULL AND p_exam_date IS NULL THEN
    RAISE EXCEPTION 'At least one profile field must be provided.';
  END IF;

  UPDATE public.students AS student_profile
  SET
    course_name = COALESCE(p_course_name, student_profile.course_name),
    exam_date = COALESCE(p_exam_date, student_profile.exam_date)
  WHERE student_profile.auth_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No student profile is linked to this account.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_student_profile(text, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_student_profile(text, date) TO authenticated;

COMMIT;
