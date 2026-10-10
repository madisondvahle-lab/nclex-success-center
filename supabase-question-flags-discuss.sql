-- Lets students flag a question to DISCUSS with the tutor (separate from reporting a problem).
-- Run once in the Supabase SQL Editor, after supabase-question-flags.sql. Safe to re-run.
alter table question_flags add column if not exists kind text not null default 'report';
alter table question_flags drop constraint if exists question_flags_kind_check;
alter table question_flags add constraint question_flags_kind_check check (kind in ('report','discuss'));
