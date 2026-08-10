-- Module 3 safety cleanup
-- Removes the accidental internal Question Bank Manager URLs from the student-facing module catalog.
-- Existing student_module_access rows are intentionally preserved.
-- Run once in the Supabase SQL Editor after this PR is merged.

update public.modules
set
  guide_url = null,
  quiz_url = null
where module_key = 'm3'
  and (
    guide_url = 'question-bank.html'
    or quiz_url = 'question-bank.html'
  );
