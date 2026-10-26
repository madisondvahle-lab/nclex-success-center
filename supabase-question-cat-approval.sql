-- Explicit, admin-only clinical approval for traditional MCQ/SATA CAT use.
-- Run after the question-bank review, bulk-import, question-flags,
-- question-revision, and question-audit schemas are installed.
-- This stores approval metadata only; question content remains in questions.

create table if not exists public.question_cat_approvals (
  question_id uuid primary key references public.questions(id) on delete cascade,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  reviewed_difficulty text not null check (reviewed_difficulty in ('easy', 'medium', 'hard')),
  reviewed_cognitive_demand text not null
    check (reviewed_cognitive_demand in ('application', 'analysis', 'clinical_judgment'))
);

alter table public.question_cat_approvals enable row level security;
drop policy if exists "admins read CAT question approvals" on public.question_cat_approvals;
create policy "admins read CAT question approvals" on public.question_cat_approvals
  for select to authenticated using (public.is_app_admin());
revoke all on public.question_cat_approvals from public, anon, authenticated;
grant select on public.question_cat_approvals to authenticated, service_role;

create or replace function public.set_question_cat_approval(
  p_question_id uuid,
  p_approved boolean,
  p_confirmed_clinical_review boolean default false,
  p_cognitive_demand text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_question public.questions%rowtype;
  v_type text;
  v_options jsonb;
  v_correct jsonb;
  v_option_count integer;
  v_key_count integer;
  v_latest_audit text;
  v_approved_at timestamptz;
begin
  if not public.is_app_admin() then
    raise exception 'Only an app admin can approve CAT questions.' using errcode = '42501';
  end if;
  if p_approved is null then
    raise exception 'Choose whether to approve or remove CAT approval.';
  end if;
  if p_question_id is null then
    raise exception 'Choose a question to review.';
  end if;

  select * into v_question
  from public.questions
  where id = p_question_id
  for update;
  if not found then raise exception 'Question not found.'; end if;

  if not p_approved then
    if exists (
      select 1 from public.in_house_assessment_attempts a
      where a.status = 'in_progress'
        and a.checkpoint->>'currentItemId' = 'qbank:' || p_question_id::text
    ) then
      raise exception 'This question is currently open in a student assessment and cannot be removed from CAT yet.';
    end if;
    delete from public.question_cat_approvals where question_id = p_question_id;
    return jsonb_build_object('approved', false, 'question_id', p_question_id);
  end if;

  if p_confirmed_clinical_review is not true then
    raise exception 'Confirm that you reviewed the complete question, answer key, rationale, difficulty, and clinical suitability.';
  end if;
  if p_cognitive_demand is null or p_cognitive_demand not in ('application', 'analysis', 'clinical_judgment') then
    raise exception 'Select the reviewed cognitive demand (application or higher).';
  end if;
  if v_question.active is distinct from true then
    raise exception 'Publish the question to students before considering it for CAT.';
  end if;
  if v_question.item_data ? 'schemaVersion' then
    raise exception 'NGN questions are not admitted to the traditional CAT.';
  end if;
  v_type := coalesce(v_question.item_type, 'mcq');
  if v_type not in ('mcq', 'sata') then
    raise exception 'Only traditional MCQ and SATA questions can be approved for CAT.';
  end if;
  if nullif(btrim(v_question.stem), '') is null or nullif(btrim(v_question.rationale), '') is null then
    raise exception 'A complete question stem and rationale are required.';
  end if;
  if lower(btrim(coalesce(v_question.difficulty, ''))) not in ('easy', 'medium', 'hard') then
    raise exception 'Set and review a valid difficulty (easy, medium, or hard) first.';
  end if;
  if lower(btrim(coalesce(v_question.nclex_category, ''))) not in (
    'management of care', 'safety & infection prevention', 'safety and infection prevention',
    'safety & infection control', 'safety and infection control',
    'health promotion & maintenance', 'health promotion and maintenance',
    'psychosocial integrity', 'basic care & comfort', 'basic care and comfort',
    'pharmacological & parenteral therapies', 'pharmacological and parenteral therapies',
    'reduction of risk potential', 'physiological adaptation'
  ) then
    raise exception 'Set a recognized NCLEX Client Needs category before CAT approval.';
  end if;

  if v_type = 'mcq' then
    if nullif(btrim(v_question.option_a), '') is null
      or nullif(btrim(v_question.option_b), '') is null
      or nullif(btrim(v_question.option_c), '') is null
      or nullif(btrim(v_question.option_d), '') is null
      or lower(btrim(coalesce(v_question.correct_answer, ''))) not in ('a', 'b', 'c', 'd') then
      raise exception 'MCQ CAT approval requires four options and one valid answer key.';
    end if;
  else
    v_options := v_question.item_data->'options';
    v_correct := v_question.item_data->'correct';
    if jsonb_typeof(v_options) is distinct from 'array' or jsonb_typeof(v_correct) is distinct from 'array' then
      raise exception 'SATA CAT approval requires stored options and keyed answer indexes.';
    end if;
    v_option_count := jsonb_array_length(v_options);
    v_key_count := jsonb_array_length(v_correct);
    if v_option_count < 2 or v_option_count > 12 or v_key_count < 1 then
      raise exception 'SATA CAT approval requires 2-12 options and at least one keyed answer.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_options) as options(option_value)
      where jsonb_typeof(option_value) <> 'string' or nullif(btrim(option_value #>> '{}'), '') is null
    ) then
      raise exception 'SATA CAT options must all contain text.';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(v_correct) as answers(answer_index)
      where answer_index !~ '^(0|[1-9][0-9]*)$'
        or answer_index::integer >= v_option_count
    ) or (
      select count(distinct answer_index)
      from jsonb_array_elements_text(v_correct) as answers(answer_index)
    ) <> v_key_count then
      raise exception 'SATA CAT answer indexes must be unique and match the visible options.';
    end if;
  end if;

  if v_question.source_key like 'qbank-bulk-%' and not exists (
    select 1 from public.question_import_reviews r
    where r.source_key = v_question.source_key
      and r.imported_question_id = v_question.id
      and r.status = 'published'
  ) then
    raise exception 'Bulk-imported questions must finish their existing review and publication workflow first.';
  end if;
  if exists (
    select 1 from public.question_flags f
    where f.status = 'open'
      and (f.question_id = v_question.id or
        (v_question.question_no is not null and f.question_no = v_question.question_no))
  ) then
    raise exception 'Resolve all open question flags before CAT approval.';
  end if;
  if exists (
    select 1 from public.question_revision_drafts d
    where d.question_id = v_question.id and d.status in ('pending_review', 'approved')
  ) then
    raise exception 'Resolve or apply all open correction drafts before CAT approval.';
  end if;
  select a.audit_status into v_latest_audit
  from public.question_audits a
  where a.question_id = v_question.id
  order by a.audited_at desc, a.id desc
  limit 1;
  if v_latest_audit in ('quarantine', 'error') then
    raise exception 'Resolve the latest quarantined or failed quality audit before CAT approval.';
  end if;

  insert into public.question_cat_approvals (
    question_id, approved_by, approved_at, reviewed_difficulty, reviewed_cognitive_demand
  ) values (
    p_question_id, auth.uid(), clock_timestamp(), lower(v_question.difficulty), p_cognitive_demand
  )
  on conflict (question_id) do update set
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    reviewed_difficulty = excluded.reviewed_difficulty,
    reviewed_cognitive_demand = excluded.reviewed_cognitive_demand
  returning approved_at into v_approved_at;

  return jsonb_build_object(
    'approved', true,
    'question_id', p_question_id,
    'approved_at', v_approved_at,
    'reviewed_difficulty', lower(v_question.difficulty),
    'reviewed_cognitive_demand', p_cognitive_demand
  );
end;
$$;

revoke all on function public.set_question_cat_approval(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.set_question_cat_approval(uuid, boolean, boolean, text) to authenticated;

create or replace function public.get_cat_approved_questions()
returns table (
  id uuid,
  stem text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_answer text,
  rationale text,
  topic text,
  difficulty text,
  nclex_category text,
  active boolean,
  source_key text,
  item_type text,
  item_data jsonb,
  clinical_judgment_skill text,
  reviewed_cognitive_demand text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select q.id, q.stem, q.option_a, q.option_b, q.option_c, q.option_d,
    q.correct_answer, q.rationale, q.topic, q.difficulty, q.nclex_category,
    q.active, q.source_key, coalesce(q.item_type, 'mcq'), q.item_data,
    q.clinical_judgment_skill, a.reviewed_cognitive_demand
  from public.questions q
  join public.question_cat_approvals a on a.question_id = q.id
  where q.active is true
    and lower(btrim(coalesce(q.difficulty, ''))) = a.reviewed_difficulty
    and not (coalesce(q.item_data, '{}'::jsonb) ? 'schemaVersion')
    and coalesce(q.item_type, 'mcq') in ('mcq', 'sata')
    and not exists (
      select 1 from public.question_flags f
      where f.status = 'open'
        and (f.question_id = q.id or (q.question_no is not null and f.question_no = q.question_no))
    )
    and not exists (
      select 1 from public.question_revision_drafts d
      where d.question_id = q.id and d.status in ('pending_review', 'approved')
    )
    and not exists (
      select 1 from public.question_audits latest
      where latest.id = (
        select a2.id from public.question_audits a2
        where a2.question_id = q.id
        order by a2.audited_at desc, a2.id desc
        limit 1
      )
      and latest.audit_status in ('quarantine', 'error')
    )
    and (
      q.source_key is null or q.source_key not like 'qbank-bulk-%' or exists (
        select 1 from public.question_import_reviews r
        where r.source_key = q.source_key
          and r.imported_question_id = q.id
          and r.status = 'published'
      )
    )
  order by q.id;
$$;
revoke all on function public.get_cat_approved_questions() from public, anon, authenticated;
grant execute on function public.get_cat_approved_questions() to service_role;

create or replace function public.protect_current_cat_question()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.question_cat_approvals a
    where a.question_id = old.id
  ) and (
    old.active is distinct from new.active
    or old.stem is distinct from new.stem
    or old.option_a is distinct from new.option_a
    or old.option_b is distinct from new.option_b
    or old.option_c is distinct from new.option_c
    or old.option_d is distinct from new.option_d
    or old.correct_answer is distinct from new.correct_answer
    or old.rationale is distinct from new.rationale
    or old.topic is distinct from new.topic
    or old.difficulty is distinct from new.difficulty
    or old.nclex_category is distinct from new.nclex_category
    or old.item_type is distinct from new.item_type
    or old.item_data is distinct from new.item_data
    or old.source_key is distinct from new.source_key
    or old.clinical_judgment_skill is distinct from new.clinical_judgment_skill
  ) then
    if exists (
      select 1 from public.in_house_assessment_attempts attempt
      where attempt.status = 'in_progress'
        and attempt.checkpoint->>'currentItemId' = 'qbank:' || old.id::text
    ) then
      raise exception 'This CAT question is currently open in a student assessment. Retry after the student submits or exits.';
    end if;
    delete from public.question_cat_approvals where question_id = old.id;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_current_cat_question() from public, anon, authenticated;

drop trigger if exists protect_current_cat_question on public.questions;
create trigger protect_current_cat_question
before update of active, stem, option_a, option_b, option_c, option_d, correct_answer,
  rationale, topic, difficulty, nclex_category, item_type, item_data, source_key,
  clinical_judgment_skill
on public.questions
for each row execute function public.protect_current_cat_question();

create index if not exists idx_question_cat_approvals_demand
  on public.question_cat_approvals(reviewed_cognitive_demand, reviewed_difficulty);
create index if not exists idx_question_flags_cat_eligibility
  on public.question_flags(question_id, status);
create index if not exists idx_question_revision_cat_eligibility
  on public.question_revision_drafts(question_id, status);
