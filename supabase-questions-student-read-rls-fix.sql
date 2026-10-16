-- Restore the student question-bank read access expected by supplemental-practice.html.
-- Students can read active questions only; the existing admin policy continues
-- to govern access to inactive questions and all question-bank management.
alter table public.questions enable row level security;

drop policy if exists "authenticated students read active questions" on public.questions;
create policy "authenticated students read active questions"
  on public.questions
  for select
  to authenticated
  using (active is true);
