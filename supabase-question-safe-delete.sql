-- Safe permanent deletion for master QBank questions.
-- Run after supabase-question-bulk-import.sql and supabase-question-audit.sql.
--
-- A question may be permanently deleted only when no student history,
-- assessment or CAT record, assignment, practice-set entry, or student flag
-- refers to it. The full question row, its correction drafts, audits, admin
-- flags, and import-tracking rows are archived as JSON in
-- question_deletion_archive. Drafts and audits are then removed in the same
-- transaction; admin flags and import tracking keep their existing
-- "on delete set null" behavior.
-- Student records are never deleted or modified by this migration.

create table if not exists question_deletion_archive (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  question_no bigint,
  question_snapshot jsonb not null,
  revision_drafts jsonb not null default '[]'::jsonb,
  audits jsonb not null default '[]'::jsonb,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now()
);
alter table question_deletion_archive
  add column if not exists question_flags jsonb not null default '[]'::jsonb,
  add column if not exists import_reviews jsonb not null default '[]'::jsonb;
create index if not exists idx_question_deletion_archive_question
  on question_deletion_archive(question_id);

alter table question_deletion_archive enable row level security;
drop policy if exists "admins read question deletion archive" on question_deletion_archive;
create policy "admins read question deletion archive"
  on question_deletion_archive for select to authenticated
  using (is_app_admin());
revoke all on question_deletion_archive from anon, authenticated;
grant select on question_deletion_archive to authenticated;

-- Lists every record that refers to each question. Rows with blocks_delete
-- must be preserved; other rows are handled by delete_questions_permanently.
create or replace function question_usage_details(p_question_ids uuid[])
returns table(question_id uuid, reason text, label text, record_count bigint, blocks_delete boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_check record;
begin
  if p_question_ids is null or cardinality(p_question_ids) = 0 then
    return;
  end if;

  for v_check in
    select * from (values
      ('student_practice_results', 'student practice result', true, 'student_supplemental_practice_results',
       'select q.id, count(*) from questions q join student_supplemental_practice_results r
          on to_jsonb(r)::text like ''%'' || q.id::text || ''%''
        where q.id = any($1) group by q.id'),
      ('assessment_responses', 'in-house or CAT assessment answer', true, 'in_house_assessment_item_responses',
       'select q.id, count(*) from questions q join in_house_assessment_item_responses r
          on r.item_id like ''%'' || q.id::text || ''%'' or (q.source_key is not null and r.item_id = q.source_key)
        where q.id = any($1) group by q.id'),
      ('assessment_attempts', 'saved, paused, or completed assessment attempt', true, 'in_house_assessment_attempts',
       'select q.id, count(*) from questions q join in_house_assessment_attempts r
          on to_jsonb(r)::text like ''%'' || q.id::text || ''%''
        where q.id = any($1) group by q.id'),
      ('weekly_assignments', 'student assignment', true, 'student_resources',
       'select q.id, count(*) from questions q join student_resources r
          on to_jsonb(r)::text like ''%'' || q.id::text || ''%''
        where q.id = any($1) group by q.id'),
      ('assignment_history', 'student assignment change record', true, 'student_assignment_revisions',
       'select q.id, count(*) from questions q join student_assignment_revisions r
          on to_jsonb(r)::text like ''%'' || q.id::text || ''%''
        where q.id = any($1) group by q.id'),
      ('quiz_results', 'completed module quiz record', true, 'quiz_results',
       'select q.id, count(*) from questions q join quiz_results r
          on to_jsonb(r)::text like ''%'' || q.id::text || ''%''
        where q.id = any($1) group by q.id'),
      ('module_results', 'completed module result', true, 'module_results',
       'select q.id, count(*) from questions q join module_results r
          on to_jsonb(r)::text like ''%'' || q.id::text || ''%''
        where q.id = any($1) group by q.id'),
      ('diagnostic_results', 'completed diagnostic result', true, 'consult_diagnostic_results',
       'select q.id, count(*) from questions q join consult_diagnostic_results r
          on to_jsonb(r)::text like ''%'' || q.id::text || ''%''
        where q.id = any($1) group by q.id'),
      ('exam_reports', 'student exam report', true, 'exam_reports',
       'select q.id, count(*) from questions q join exam_reports r
          on to_jsonb(r)::text like ''%'' || q.id::text || ''%''
        where q.id = any($1) group by q.id'),
      ('practice_sets', 'assigned practice-set entry', true, 'question_set_items',
       'select q.id, count(*) from questions q join question_set_items r on r.question_id = q.id
        where q.id = any($1) group by q.id'),
      ('student_flags', 'student-submitted question flag', true, 'question_flags',
       'select q.id, count(*) from questions q join question_flags r on r.question_id = q.id
        where r.student_id is not null and q.id = any($1) group by q.id'),
      ('revision_drafts', 'saved correction draft (will be archived)', false, 'question_revision_drafts',
       'select q.id, count(*) from questions q join question_revision_drafts r on r.question_id = q.id
        where q.id = any($1) group by q.id'),
      ('audits', 'quality-audit record (will be archived)', false, 'question_audits',
       'select q.id, count(*) from questions q join question_audits r on r.question_id = q.id
        where q.id = any($1) group by q.id')
    ) as checks(c_reason, c_label, c_blocks, c_table, c_sql)
  loop
    -- Fail closed: a missing table means a protection check cannot run.
    if to_regclass('public.' || v_check.c_table) is null then
      raise exception 'Question deletion safety check is unavailable because table % is missing.', v_check.c_table;
    end if;
    return query execute
      format('select s.id, %L::text, %L::text, s.n, %L::boolean from (%s) s(id, n)',
        v_check.c_reason, v_check.c_label, v_check.c_blocks, v_check.c_sql)
      using p_question_ids;
  end loop;
end;
$$;

create or replace function question_deletion_blockers(p_question_ids uuid[])
returns table(question_id uuid, reason text, label text, record_count bigint, blocks_delete boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_app_admin() then
    raise exception 'Only an app admin can review question deletion.' using errcode = '42501';
  end if;
  return query select * from question_usage_details(p_question_ids);
end;
$$;

create or replace function question_usage_summary(p_question_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select string_agg(record_count || ' ' || label || case when record_count = 1 then '' else '(s)' end, '; ' order by reason)
  from question_usage_details(array[p_question_id])
  where blocks_delete;
$$;

-- Enforced for every delete path, including direct table deletes.
create or replace function prevent_used_question_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_summary text;
begin
  v_summary := question_usage_summary(old.id);
  if v_summary is not null then
    raise exception 'Question % cannot be permanently deleted because it is linked to: %.',
      coalesce('#' || old.question_no::text, old.id::text), v_summary
      using errcode = '23503',
            hint = 'Use Make inactive to hide it from students while preserving their history.';
  end if;
  return old;
end;
$$;

drop trigger if exists questions_prevent_used_delete on questions;
create trigger questions_prevent_used_delete
  before delete on questions
  for each row execute function prevent_used_question_delete();

create or replace function delete_questions_permanently(p_question_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_blocked text;
  v_deleted integer;
begin
  if not is_app_admin() then
    raise exception 'Only an app admin can permanently delete questions.' using errcode = '42501';
  end if;

  select array_agg(distinct id) into v_ids from unnest(p_question_ids) id where id is not null;
  if v_ids is null then
    raise exception 'Select at least one question to delete.';
  end if;

  perform 1 from questions where id = any(v_ids) order by id for update;

  select string_agg(coalesce('#' || q.question_no::text, q.id::text) || ': ' || question_usage_summary(q.id), E'\n' order by q.question_no, q.id)
  into v_blocked
  from questions q
  where q.id = any(v_ids) and question_usage_summary(q.id) is not null;
  if v_blocked is not null then
    raise exception E'No questions were deleted. These questions must be kept because they are linked to student or assessment records:\n%', v_blocked
      using errcode = '23503',
            hint = 'Use Make inactive for these questions instead.';
  end if;

  insert into question_deletion_archive(question_id, question_no, question_snapshot, revision_drafts, audits,
    question_flags, import_reviews, deleted_by)
  select q.id, q.question_no, to_jsonb(q),
    coalesce((select jsonb_agg(to_jsonb(d) order by d.proposed_at) from question_revision_drafts d where d.question_id = q.id), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(a) order by a.audited_at) from question_audits a where a.question_id = q.id), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from question_flags f where f.question_id = q.id), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(r)) from question_import_reviews r where r.imported_question_id = q.id), '[]'::jsonb),
    auth.uid()
  from questions q
  where q.id = any(v_ids);

  delete from question_audits where question_id = any(v_ids);
  delete from question_revision_drafts where question_id = any(v_ids);
  delete from questions where id = any(v_ids);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function question_usage_details(uuid[]) from public, anon, authenticated;
revoke all on function question_usage_summary(uuid) from public, anon, authenticated;
revoke all on function prevent_used_question_delete() from public, anon, authenticated;
revoke all on function question_deletion_blockers(uuid[]) from public, anon;
revoke all on function delete_questions_permanently(uuid[]) from public, anon;
grant execute on function question_deletion_blockers(uuid[]) to authenticated;
grant execute on function delete_questions_permanently(uuid[]) to authenticated;
