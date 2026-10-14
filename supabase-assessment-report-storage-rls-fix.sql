-- Restore student access to their own private CAT/readiness report files.
-- Qualify storage.objects.name because students also has a name column.
-- Run once in the Supabase SQL Editor.

DROP POLICY IF EXISTS "admins manage private assessment report files" ON storage.objects;
DROP POLICY IF EXISTS "admins manage private assessment reports" ON storage.objects;
DROP POLICY IF EXISTS "authorized users view private assessment reports" ON storage.objects;
DROP POLICY IF EXISTS "students read own assessment reports" ON storage.objects;
DROP POLICY IF EXISTS "students read own shared reports" ON storage.objects;
DROP POLICY IF EXISTS "students upload own assessment reports" ON storage.objects;
DROP POLICY IF EXISTS "students upload own shared reports" ON storage.objects;
DROP POLICY IF EXISTS "students upload private assessment reports" ON storage.objects;

CREATE POLICY "admins manage private assessment report files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'assessment-reports' AND public.is_app_admin())
  WITH CHECK (bucket_id = 'assessment-reports' AND public.is_app_admin());

CREATE POLICY "students upload own assessment reports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assessment-reports'
    AND EXISTS (
      SELECT 1
      FROM public.students
      WHERE students.auth_user_id = auth.uid()
        AND students.id::text = (storage.foldername(storage.objects.name))[1]
    )
  );

CREATE POLICY "students read own assessment reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'assessment-reports'
    AND (
      public.is_app_admin()
      OR EXISTS (
        SELECT 1
        FROM public.students
        WHERE students.auth_user_id = auth.uid()
          AND students.id::text = (storage.foldername(storage.objects.name))[1]
      )
    )
  );
