-- Review/apply only after approval. Requires the deployed secure-access and
-- nursing-student schema. Does not modify any existing student records.
BEGIN;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_anon_update_students ON public.students;

-- Shared authenticated grants remain necessary for the existing admin UI.
-- This guard also constrains other permissive UPDATE policies.
DROP POLICY IF EXISTS "Only admins directly update students" ON public.students;
CREATE POLICY "Only admins directly update students" ON public.students
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

CREATE OR REPLACE FUNCTION public.update_my_student_profile(profile_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  saved_profile jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(profile_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Profile changes must be an object.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(profile_patch) key
    WHERE key NOT IN ('course_name', 'exam_date')
  ) THEN
    RAISE EXCEPTION 'Only course_name and exam_date can be changed here.' USING ERRCODE = '22023';
  END IF;
  IF profile_patch ? 'course_name'
     AND jsonb_typeof(profile_patch->'course_name') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'Course name must be text or null.' USING ERRCODE = '22023';
  END IF;
  IF profile_patch ? 'exam_date'
     AND jsonb_typeof(profile_patch->'exam_date') <> 'null'
     AND (jsonb_typeof(profile_patch->'exam_date') <> 'string'
          OR (profile_patch->>'exam_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN
    RAISE EXCEPTION 'Exam date must use YYYY-MM-DD or be null.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.students SET
    course_name = CASE WHEN profile_patch ? 'course_name'
      THEN nullif(btrim(profile_patch->>'course_name'), '') ELSE course_name END,
    exam_date = CASE WHEN profile_patch ? 'exam_date'
      THEN (profile_patch->>'exam_date')::date ELSE exam_date END
  WHERE auth_user_id = auth.uid() AND archived_at IS NULL
  RETURNING jsonb_build_object('course_name', course_name, 'exam_date', exam_date)
  INTO saved_profile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active student profile is linked to this account.' USING ERRCODE = '42501';
  END IF;
  RETURN saved_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_student_profile(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_student_profile(jsonb) TO authenticated;
COMMIT;
