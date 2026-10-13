-- Additive support for reviewed QBank imports and expanded question metadata.
-- Run after supabase-question-bank-review.sql and supabase-question-item-types.sql.
-- Existing question IDs, content, assignments, and attempt history are unchanged.

alter table questions
  add column if not exists clinical_judgment_skill text,
  add column if not exists option_rationales jsonb not null default '{}'::jsonb,
  add column if not exists reference_list jsonb not null default '[]'::jsonb;

alter table questions
  drop constraint if exists questions_option_rationales_object_check,
  add constraint questions_option_rationales_object_check
    check (jsonb_typeof(option_rationales) = 'object'),
  drop constraint if exists questions_reference_list_array_check,
  add constraint questions_reference_list_array_check
    check (jsonb_typeof(reference_list) = 'array');

create index if not exists idx_questions_clinical_judgment_skill
  on questions(clinical_judgment_skill)
  where clinical_judgment_skill is not null;

create index if not exists idx_questions_active_category_difficulty
  on questions(active, nclex_category, difficulty);

alter table question_import_reviews
  drop constraint if exists question_import_reviews_status_check,
  add constraint question_import_reviews_status_check
    check (status in ('pending', 'ignored', 'draft', 'approved', 'published'));

create table if not exists question_revision_drafts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete restrict,
  base_content jsonb not null check (jsonb_typeof(base_content) = 'object'),
  proposed_content jsonb not null check (jsonb_typeof(proposed_content) = 'object'),
  change_summary text not null check (length(btrim(change_summary)) > 0),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'applied')),
  proposed_by uuid not null references auth.users(id) on delete restrict,
  proposed_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz
);

create unique index if not exists idx_question_revision_one_open
  on question_revision_drafts(question_id)
  where status in ('pending_review', 'approved');
create index if not exists idx_question_revision_status_date
  on question_revision_drafts(status, proposed_at desc);

alter table question_revision_drafts enable row level security;
drop policy if exists "admins read question revision drafts" on question_revision_drafts;
drop policy if exists "admins create question revision drafts" on question_revision_drafts;
create policy "admins read question revision drafts"
  on question_revision_drafts for select to authenticated
  using (is_app_admin());
create policy "admins create question revision drafts"
  on question_revision_drafts for insert to authenticated
  with check (is_app_admin() and proposed_by = auth.uid() and status = 'pending_review');
revoke all on question_revision_drafts from anon, authenticated;
grant select, insert on question_revision_drafts to authenticated;

create or replace function approve_question_revision(p_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_app_admin() then
    raise exception 'Only an app admin can approve a question correction.' using errcode = '42501';
  end if;

  update question_revision_drafts
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_revision_id and status = 'pending_review';

  if not found then
    raise exception 'Correction is missing or is no longer awaiting review.';
  end if;
end;
$$;

create or replace function reject_question_revision(p_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_app_admin() then
    raise exception 'Only an app admin can reject a question correction.' using errcode = '42501';
  end if;

  update question_revision_drafts
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_revision_id and status in ('pending_review', 'approved');

  if not found then
    raise exception 'Correction is missing or is no longer awaiting review.';
  end if;
end;
$$;

create or replace function apply_question_revision(p_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision question_revision_drafts%rowtype;
  v_question questions%rowtype;
  v_current_content jsonb;
begin
  if not is_app_admin() then
    raise exception 'Only an app admin can apply a question correction.' using errcode = '42501';
  end if;

  select * into v_revision
  from question_revision_drafts
  where id = p_revision_id and status = 'approved'
  for update;
  if not found then
    raise exception 'Only an approved correction can be applied.';
  end if;

  select * into v_question from questions where id = v_revision.question_id for update;
  if not found then
    raise exception 'The original question no longer exists.';
  end if;

  v_current_content := jsonb_build_object(
    'stem', v_question.stem,
    'option_a', v_question.option_a,
    'option_b', v_question.option_b,
    'option_c', v_question.option_c,
    'option_d', v_question.option_d,
    'correct_answer', v_question.correct_answer,
    'rationale', v_question.rationale,
    'module_key', v_question.module_key,
    'nclex_category', v_question.nclex_category,
    'nclex_sub', v_question.nclex_sub,
    'topic', v_question.topic,
    'difficulty', v_question.difficulty,
    'is_ngn', v_question.is_ngn,
    'item_type', v_question.item_type,
    'item_data', v_question.item_data,
    'clinical_judgment_skill', v_question.clinical_judgment_skill,
    'option_rationales', v_question.option_rationales,
    'reference_list', v_question.reference_list
  );
  if v_current_content is distinct from v_revision.base_content then
    raise exception 'The question changed after this correction was proposed. Create a fresh draft against the current version.';
  end if;

  update questions set
    stem = v_revision.proposed_content ->> 'stem',
    option_a = v_revision.proposed_content ->> 'option_a',
    option_b = v_revision.proposed_content ->> 'option_b',
    option_c = v_revision.proposed_content ->> 'option_c',
    option_d = v_revision.proposed_content ->> 'option_d',
    correct_answer = v_revision.proposed_content ->> 'correct_answer',
    rationale = v_revision.proposed_content ->> 'rationale',
    nclex_category = v_revision.proposed_content ->> 'nclex_category',
    nclex_sub = v_revision.proposed_content ->> 'nclex_sub',
    topic = v_revision.proposed_content ->> 'topic',
    difficulty = v_revision.proposed_content ->> 'difficulty',
    is_ngn = (v_revision.proposed_content ->> 'is_ngn')::boolean,
    item_type = v_revision.proposed_content ->> 'item_type',
    item_data = nullif(v_revision.proposed_content -> 'item_data', 'null'::jsonb),
    clinical_judgment_skill = v_revision.proposed_content ->> 'clinical_judgment_skill',
    option_rationales = coalesce(v_revision.proposed_content -> 'option_rationales', '{}'::jsonb),
    reference_list = coalesce(v_revision.proposed_content -> 'reference_list', '[]'::jsonb)
  where id = v_revision.question_id;

  update question_revision_drafts
  set status = 'applied', applied_by = auth.uid(), applied_at = now()
  where id = v_revision.id;
end;
$$;

revoke all on function approve_question_revision(uuid) from public, anon;
revoke all on function reject_question_revision(uuid) from public, anon;
revoke all on function apply_question_revision(uuid) from public, anon;
grant execute on function approve_question_revision(uuid) to authenticated;
grant execute on function reject_question_revision(uuid) to authenticated;
grant execute on function apply_question_revision(uuid) to authenticated;
