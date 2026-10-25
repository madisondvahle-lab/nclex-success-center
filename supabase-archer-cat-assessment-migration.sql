-- Additive Archer CAT reporting fields. Run after the assessment history and
-- assessment report upload migrations. Existing assessment rows are unchanged.

ALTER TABLE public.external_assessments
  ADD COLUMN IF NOT EXISTS archer_cat_data jsonb
  CHECK (archer_cat_data IS NULL OR jsonb_typeof(archer_cat_data) = 'object');

ALTER TABLE public.external_assessments
  ADD COLUMN IF NOT EXISTS category_counts jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(category_counts) = 'object');

ALTER TABLE public.assessment_report_files
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'report';

ALTER TABLE public.assessment_report_files
  DROP CONSTRAINT IF EXISTS assessment_report_files_section_check;

ALTER TABLE public.assessment_report_files
  ADD CONSTRAINT assessment_report_files_section_check
  CHECK (section IN ('classic', 'ngn', 'report'));
