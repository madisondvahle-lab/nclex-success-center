-- Gives every master-bank question a short permanent number (Q-0001, Q-0002, ...).
-- Run once in the Supabase SQL Editor. Safe to re-run. New questions are numbered automatically.

create sequence if not exists questions_number_seq;
alter table questions add column if not exists question_no bigint;

with ordered as (
  select id, row_number() over (order by created_at, id) as n
  from questions where question_no is null
)
update questions q set question_no = (select coalesce(max(question_no),0) from questions) + o.n
from ordered o where q.id = o.id;

select setval('questions_number_seq', (select coalesce(max(question_no),0) from questions) + 1, false);
alter table questions alter column question_no set default nextval('questions_number_seq');
create unique index if not exists idx_questions_question_no on questions(question_no);
