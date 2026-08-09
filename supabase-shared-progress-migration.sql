-- NCLEX Success Center — shared progress workspace
-- Run once in Supabase SQL Editor. This supports student report uploads,
-- tutor review, category snapshots, and shared focus areas.

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

CREATE TABLE IF NOT EXISTS student_assessment_uploads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'other',
  assessment_type text NOT NULL DEFAULT 'other',
  taken_on date,
  overall_score numeric CHECK (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100)),
  report_path text NOT NULL UNIQUE,
  report_filename text NOT NULL,
  report_mime_type text NOT NULL DEFAULT 'application/octet-stream',
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_assessment_insights (
  assessment_id uuid PRIMARY KEY REFERENCES student_assessment_uploads(id) ON DELETE CASCADE,
  shared_summary text NOT NULL DEFAULT '',
  shared_with_student boolean NOT NULL DEFAULT true,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_assessment_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES student_assessment_uploads(id) ON DELETE CASCADE,
  category text NOT NULL,
  score numeric CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, category)
);

CREATE TABLE IF NOT EXISTS student_focus_areas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  focus_area text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','maintenance')),
  current_score numeric CHECK (current_score IS NULL OR (current_score >= 0 AND current_score <= 100)),
  previous_score numeric CHECK (previous_score IS NULL OR (previous_score >= 0 AND previous_score <= 100)),
  trend text NOT NULL DEFAULT 'steady' CHECK (trend IN ('improving','steady','needs_attention')),
  next_step text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, focus_area)
);

ALTER TABLE student_assessment_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_assessment_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_assessment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_focus_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage shared assessment uploads" ON student_assessment_uploads;
DROP POLICY IF EXISTS "students read own shared assessment uploads" ON student_assessment_uploads;
DROP POLICY IF EXISTS "students upload own shared assessment uploads" ON student_assessment_uploads;
CREATE POLICY "admins manage shared assessment uploads" ON student_assessment_uploads FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY "students read own shared assessment uploads" ON student_assessment_uploads FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM students WHERE students.id = student_assessment_uploads.student_id AND students.auth_user_id = auth.uid()));
CREATE POLICY "students upload own shared assessment uploads" ON student_assessment_uploads FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM students WHERE students.id = student_assessment_uploads.student_id AND students.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admins manage shared assessment insights" ON student_assessment_insights;
DROP POLICY IF EXISTS "students read own shared assessment insights" ON student_assessment_insights;
CREATE POLICY "admins manage shared assessment insights" ON student_assessment_insights FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY "students read own shared assessment insights" ON student_assessment_insights FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM student_assessment_uploads WHERE student_assessment_uploads.id = student_assessment_insights.assessment_id AND EXISTS (SELECT 1 FROM students WHERE students.id = student_assessment_uploads.student_id AND students.auth_user_id = auth.uid())));

DROP POLICY IF EXISTS "admins manage shared assessment categories" ON student_assessment_categories;
DROP POLICY IF EXISTS "students read own shared assessment categories" ON student_assessment_categories;
CREATE POLICY "admins manage shared assessment categories" ON student_assessment_categories FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY "students read own shared assessment categories" ON student_assessment_categories FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM student_assessment_uploads WHERE student_assessment_uploads.id = student_assessment_categories.assessment_id AND EXISTS (SELECT 1 FROM students WHERE students.id = student_assessment_uploads.student_id AND students.auth_user_id = auth.uid())));

DROP POLICY IF EXISTS "admins manage shared focus areas" ON student_focus_areas;
DROP POLICY IF EXISTS "students read own shared focus areas" ON student_focus_areas;
CREATE POLICY "admins manage shared focus areas" ON student_focus_areas FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY "students read own shared focus areas" ON student_focus_areas FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM students WHERE students.id = student_focus_areas.student_id AND students.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "admins manage private assessment report files" ON storage.objects;
DROP POLICY IF EXISTS "students upload own shared reports" ON storage.objects;
DROP POLICY IF EXISTS "students read own shared reports" ON storage.objects;
CREATE POLICY "admins manage private assessment report files" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'assessment-reports' AND public.is_app_admin()) WITH CHECK (bucket_id = 'assessment-reports' AND public.is_app_admin());
CREATE POLICY "students upload own shared reports" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'assessment-reports' AND EXISTS (SELECT 1 FROM students WHERE students.auth_user_id = auth.uid() AND students.id::text = (storage.foldername(name))[1]));
CREATE POLICY "students read own shared reports" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'assessment-reports' AND EXISTS (SELECT 1 FROM students WHERE students.auth_user_id = auth.uid() AND students.id::text = (storage.foldername(name))[1]));

REVOKE ALL ON student_assessment_uploads, student_assessment_insights, student_assessment_categories, student_focus_areas FROM anon;