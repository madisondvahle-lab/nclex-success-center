-- Keep student course materials private and align Storage access with the
-- existing student-id folder layout used by student uploads.
-- Run once in the Supabase SQL Editor after supabase-secure-access-migration.sql.

UPDATE storage.buckets
SET public = false
WHERE id = 'student-materials';

DROP POLICY IF EXISTS "Students can read their own materials" ON storage.objects;
DROP POLICY IF EXISTS "Students can upload their own materials" ON storage.objects;
DROP POLICY IF EXISTS "Students can delete their own materials" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage student materials" ON storage.objects;

CREATE POLICY "Students can read their own materials"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-materials'
    AND EXISTS (
      SELECT 1
      FROM public.students
      WHERE students.auth_user_id = auth.uid()
        AND students.id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "Students can upload their own materials"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'student-materials'
    AND EXISTS (
      SELECT 1
      FROM public.students
      WHERE students.auth_user_id = auth.uid()
        AND students.id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "Students can delete their own materials"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'student-materials'
    AND EXISTS (
      SELECT 1
      FROM public.students
      WHERE students.auth_user_id = auth.uid()
        AND students.id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "Admins manage student materials"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'student-materials'
    AND public.is_app_admin()
  )
  WITH CHECK (
    bucket_id = 'student-materials'
    AND public.is_app_admin()
  );
