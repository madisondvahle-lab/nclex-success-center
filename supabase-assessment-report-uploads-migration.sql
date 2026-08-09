-- NCLEX Success Center — private assessment-report uploads
-- Run once after supabase-assessment-history-migration.sql.
-- Stores uploaded source reports privately for app admins only.

CREATE TABLE IF NOT EXISTS assessment_report_files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES external_assessments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  byte_size bigint NOT NULL CHECK (byte_size >= 0 AND byte_size <= 10485760),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_report_files_assessment_idx
  ON assessment_report_files (assessment_id, created_at DESC);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assessment-reports',
  'assessment-reports',
  false,
  10485760,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','text/csv']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE assessment_report_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage assessment report metadata" ON assessment_report_files;
CREATE POLICY "admins manage assessment report metadata"
  ON assessment_report_files FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());

DROP POLICY IF EXISTS "admins manage private assessment report files" ON storage.objects;
CREATE POLICY "admins manage private assessment report files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'assessment-reports' AND is_app_admin())
  WITH CHECK (bucket_id = 'assessment-reports' AND is_app_admin());

REVOKE ALL ON assessment_report_files FROM anon;