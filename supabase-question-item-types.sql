-- Lets the master question bank store SATA, bowtie, matrix, cloze, highlight and case-study items.
-- Run once in the Supabase SQL Editor. Safe to re-run. Existing questions are unchanged.

alter table questions add column if not exists item_type text not null default 'mcq';
alter table questions add column if not exists item_data jsonb;

-- Non-multiple-choice items keep their full structure in item_data, so the four
-- option columns and single answer key become optional for them.
alter table questions alter column option_a drop not null;
alter table questions alter column option_b drop not null;
alter table questions alter column option_c drop not null;
alter table questions alter column option_d drop not null;
alter table questions alter column correct_answer drop not null;

create index if not exists idx_questions_item_type on questions(item_type);
