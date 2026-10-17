-- Restore the student-facing Module 3 guide after removing the internal
-- Question Bank Manager URL. Its practice questions are inside the guide.
UPDATE public.modules
SET
  guide_url = 'module3-guide.html',
  quiz_url = NULL,
  updated_at = now()
WHERE module_key = 'm3'
  AND (
    guide_url IS DISTINCT FROM 'module3-guide.html'
    OR quiz_url IS NOT NULL
  )
RETURNING module_key, name, guide_url, quiz_url, is_available;

-- Core 5 uses the existing active Mental Health bank rather than a generic
-- diagnostic-practice route.
UPDATE public.modules
SET
  quiz_url = 'supplemental-practice.html?mixed=20&area=Mental%20Health',
  updated_at = now()
WHERE module_key = 'core-psych-judgment'
  AND quiz_url IS DISTINCT FROM 'supplemental-practice.html?mixed=20&area=Mental%20Health'
RETURNING module_key, name, guide_url, quiz_url, is_available;
