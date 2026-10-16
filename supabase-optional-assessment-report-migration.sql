-- CAT/readiness records may be entered without attaching a report file.
ALTER TABLE public.student_assessment_uploads
  ALTER COLUMN report_path DROP NOT NULL;
