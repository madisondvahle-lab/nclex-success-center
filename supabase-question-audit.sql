-- Automated question-bank quality audit tracking.
-- Run after supabase-question-bulk-import.sql. Safe to re-run.
-- Additive only: creates question_audits and two admin-only functions.
-- Existing questions, drafts, student history, and policies are not modified.
-- Rollback: drop function set_question_quarantine(uuid, boolean, text); drop table question_audits;

create table if not exists question_audits (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete restrict,
  content_hash text,
  criteria_version text not null,
  audit_status text not null
    check (audit_status in ('pass', 'auto_fix', 'revised', 'quarantine', 'released', 'error')),
  screening_class text check (screening_class in ('PASS', 'MINOR', 'MAJOR', 'RETIRE')),
  clinical_risk text check (clinical_risk in ('low', 'medium', 'high')),
  priority smallint,
  priority_reason text,
  findings jsonb not null default '{}'::jsonb check (jsonb_typeof(findings) = 'object'),
  verification jsonb check (verification is null or jsonb_typeof(verification) = 'object'),
  revision_id uuid references question_revision_drafts(id) on delete set null,
  attempts smallint not null default 0,
  models jsonb not null default '{}'::jsonb,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  est_cost_usd numeric(10, 4) not null default 0,
  quarantined_prev_active boolean,
  quarantined_at timestamptz,
  released_at timestamptz,
  note text,
  audited_by uuid references auth.users(id) on delete set null,
  audited_at timestamptz not null default now()
);

-- One cached result per unchanged question content and criteria version.
create unique index if not exists idx_question_audits_cache
  on question_audits(question_id, content_hash, criteria_version)
  where content_hash is not null and audit_status <> 'error';
create index if not exists idx_question_audits_question_date
  on question_audits(question_id, audited_at desc);
create index if not exists idx_question_audits_status
  on question_audits(audit_status, audited_at desc);

alter table question_audits enable row level security;
drop policy if exists "admins manage question audits" on question_audits;
create policy "admins manage question audits" on question_audits
  for all to authenticated using (is_app_admin()) with check (is_app_admin());
revoke all on question_audits from anon, authenticated;
grant select, insert, update on question_audits to authenticated;

-- Reversible removal of a question from new student assessments.
-- Only flips questions.active; student attempts and assignments are untouched.
create or replace function set_question_quarantine(
  p_question_id uuid,
  p_quarantine boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean;
  v_open question_audits%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not is_app_admin() then
    raise exception 'Only an app admin can change quarantine status.' using errcode = '42501';
  end if;

  select active into v_active from questions where id = p_question_id for update;
  if not found then
    raise exception 'Question not found.';
  end if;

  select * into v_open from question_audits
  where question_id = p_question_id and audit_status = 'quarantine' and released_at is null
  order by audited_at desc limit 1 for update;

  if p_quarantine then
    if found and v_open.quarantined_at is not null then
      raise exception 'This question is already removed from student assessments.';
    end if;
    if found then
      update question_audits
      set quarantined_prev_active = v_active, quarantined_at = now(), note = coalesce(v_reason, note)
      where id = v_open.id;
    else
      insert into question_audits (question_id, criteria_version, audit_status, quarantined_prev_active, quarantined_at, note, audited_by)
      values (p_question_id, 'manual', 'quarantine', v_active, now(), v_reason, auth.uid());
    end if;
    update questions set active = false where id = p_question_id;
  else
    if not found then
      raise exception 'This question is not quarantined.';
    end if;
    update question_audits
    set audit_status = 'released', released_at = now(), note = coalesce(v_reason, note)
    where question_id = p_question_id and audit_status = 'quarantine' and released_at is null;
    if v_open.quarantined_at is not null and coalesce(v_open.quarantined_prev_active, false) then
      update questions set active = true where id = p_question_id;
    end if;
  end if;
end;
$$;

revoke all on function set_question_quarantine(uuid, boolean, text) from public, anon;
grant execute on function set_question_quarantine(uuid, boolean, text) to authenticated;
