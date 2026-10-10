-- Lets students save the category scores for the CAT/readiness reports they log themselves.
-- Safe to run once in the Supabase SQL Editor.
drop policy if exists "students add categories to own assessments" on student_assessment_categories;
create policy "students add categories to own assessments" on student_assessment_categories
  for insert to authenticated with check (
    exists (
      select 1 from student_assessment_uploads uploads join students on students.id = uploads.student_id
      where uploads.id = student_assessment_categories.assessment_id and students.auth_user_id = auth.uid()
    )
  );
