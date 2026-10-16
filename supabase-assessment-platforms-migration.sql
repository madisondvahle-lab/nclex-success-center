-- Keep CAT platform keys lowercase and allow every platform offered by the CAT form.
ALTER TABLE public.student_assessment_uploads
  DROP CONSTRAINT IF EXISTS student_assessment_uploads_platform_check;

ALTER TABLE public.student_assessment_uploads
  ADD CONSTRAINT student_assessment_uploads_platform_check
  CHECK (lower(platform) IN ('kaplan', 'archer', 'bootcamp', 'uworld', 'ati', 'ncsbn', 'cpr', 'other'));
