-- Safe permanent deletion for master QBank questions.
-- Run after supabase-question-bulk-import.sql and supabase-question-audit.sql.
--
-- A question may be permanently deleted only when it is inactive and no
-- student history, assessment or CAT record, assignment, practice-set entry,
-- or student flag refers to it. The check and the delete are atomic: student
-- writes to the protected tables are briefly held (reads are never blocked)
-- while the question is re-checked and deleted, and the delete never queues
-- behind a student save. The full question row, its correction drafts, audits, admin
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
-- p_scope: 'direct' = the question row and tables with a foreign key to it
-- (index lookups); 'scan' = student/assessment tables that store question ids
-- inside JSON or text, including CAT ids such as qbank:<id>:<part>; 'all' = both.
-- p_changed_since limits the scan to rows written by transactions that were
-- running or started after that transaction id (see prevent_used_question_delete_batch).
-- p_source_keys supplies the source_key of each id when the question rows are
-- no longer readable (after delete); otherwise they are read from questions.
create or replace function question_usage_details(p_question_ids uuid[], p_scope text default 'all',
  p_changed_since xid default null, p_source_keys text[] default null)
returns table(question_id uuid, reason text, label text, record_count bigint, blocks_delete boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_check record;
  v_ids text := 'select distinct x[1]::uuid from regexp_matches(%s, ''[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}'', ''g'') x';
  v_recent text := '($3::xid is null or age(r.xmin) <= age($3::xid))';
  -- Each row is serialized once and tested against all requested ids in one
  -- pass; ids are extracted only from the rare rows that match.
  v_row_scan text;
  v_pattern text;
  v_key_ids uuid[];
  v_keys text[];
begin
  if p_question_ids is null or cardinality(p_question_ids) = 0 then
    return;
  end if;
  if p_scope not in ('direct', 'scan', 'all') then
    raise exception 'Unknown question usage scope %.', p_scope;
  end if;
  select '(' || string_agg(id::text, '|') || ')' into v_pattern from unnest(p_question_ids) id where id is not null;
  if p_source_keys is null then
    select array_agg(q.id), array_agg(q.source_key) into v_key_ids, v_keys
    from questions q where q.id = any(p_question_ids) and q.source_key is not null;
  else
    v_key_ids := p_question_ids;
    v_keys := p_source_keys;
  end if;
  -- "offset 0" keeps the cheap recent-rows filter ahead of the text search.
  v_row_scan := format('select m.id, count(*) from (select to_jsonb(r)::text t from %%I r where %s offset 0) r
    cross join lateral (%s) m(id) where r.t ~* $2 and m.id = any($1) group by m.id', v_recent, format(v_ids, 'r.t'));

  for v_check in
    select * from (values
      ('direct', 'active_question', 'still active (visible to students); make it inactive first', true, 'questions',
       'select q.id, 1::bigint from questions q where q.active is true and q.id = any($1)'),
      ('scan', 'student_practice_results', 'student practice result', true, 'student_supplemental_practice_results',
       format(v_row_scan, 'student_supplemental_practice_results')),
      ('scan', 'assessment_responses', 'in-house or CAT assessment answer', true, 'in_house_assessment_item_responses',
       format('select s.id, count(*) from (
           select m.id from (select r.item_id from in_house_assessment_item_responses r where %2$s offset 0) r
             cross join lateral (%1$s) m(id)
           where r.item_id ~* $2 and m.id = any($1)
           union all
           select k.id from unnest($4::uuid[], $5::text[]) k(id, key)
           join in_house_assessment_item_responses r on r.item_id = k.key
           where k.key is not null and %2$s
         ) s group by s.id', format(v_ids, 'r.item_id'), v_recent)),
      ('scan', 'assessment_attempts', 'saved, paused, or completed assessment attempt', true, 'in_house_assessment_attempts',
       format(v_row_scan, 'in_house_assessment_attempts')),
      ('scan', 'weekly_assignments', 'student assignment', true, 'student_resources',
       format(v_row_scan, 'student_resources')),
      ('scan', 'assignment_history', 'student assignment change record', true, 'student_assignment_revisions',
       format(v_row_scan, 'student_assignment_revisions')),
      ('scan', 'quiz_results', 'completed module quiz record', true, 'quiz_results',
       format(v_row_scan, 'quiz_results')),
      ('scan', 'module_results', 'completed module result', true, 'module_results',
       format(v_row_scan, 'module_results')),
      ('scan', 'diagnostic_results', 'completed diagnostic result', true, 'consult_diagnostic_results',
       format(v_row_scan, 'consult_diagnostic_results')),
      ('scan', 'exam_reports', 'student exam report', true, 'exam_reports',
       format(v_row_scan, 'exam_reports')),
      ('direct', 'practice_sets', 'assigned practice-set entry', true, 'question_set_items',
       'select r.question_id, count(*) from question_set_items r where r.question_id = any($1) group by r.question_id'),
      ('direct', 'student_flags', 'student-submitted question flag', true, 'question_flags',
       'select r.question_id, count(*) from question_flags r
        where r.student_id is not null and r.question_id = any($1) group by r.question_id'),
      ('direct', 'revision_drafts', 'saved correction draft (will be archived)', false, 'question_revision_drafts',
       'select r.question_id, count(*) from question_revision_drafts r where r.question_id = any($1) group by r.question_id'),
      ('direct', 'audits', 'quality-audit record (will be archived)', false, 'question_audits',
       'select r.question_id, count(*) from question_audits r where r.question_id = any($1) group by r.question_id')
    ) as checks(c_scope, c_reason, c_label, c_blocks, c_table, c_sql)
  loop
    -- Fail closed: a missing table means a protection check cannot run.
    if to_regclass('public.' || v_check.c_table) is null then
      raise exception 'Question deletion safety check is unavailable because table % is missing.', v_check.c_table;
    end if;
    continue when p_scope <> 'all' and p_scope <> v_check.c_scope;
    return query execute
      format('select s.id, %L::text, %L::text, s.n, %L::boolean from (%s) s(id, n)',
        v_check.c_reason, v_check.c_label, v_check.c_blocks, v_check.c_sql)
      using p_question_ids, v_pattern, p_changed_since, v_key_ids, v_keys;
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
  return query select * from question_usage_details(p_question_ids, 'all');
end;
$$;

-- One line per question that must be kept, e.g. "1 student practice result; 2 student assignment(s)".
create or replace function question_block_report(p_question_ids uuid[], p_scope text,
  p_changed_since xid default null, p_source_keys text[] default null)
returns table(question_id uuid, summary text)
language sql
stable
security definer
set search_path = public
as $$
  select u.question_id,
    string_agg(case when u.reason = 'active_question' then u.label
        else u.record_count || ' ' || u.label || case when u.record_count = 1 then '' else '(s)' end end,
      '; ' order by u.reason <> 'active_question', u.reason)
  from question_usage_details(p_question_ids, p_scope, p_changed_since, p_source_keys) u
  where u.blocks_delete
  group by u.question_id;
$$;

-- Holds new writes to every table that can record student use of a question
-- (reads are never blocked). NOWAIT keeps the delete out of the lock queue:
-- student saves never wait behind a pending delete and cannot deadlock with
-- it. If any save is in progress the delete backs off and retries for about
-- two seconds, then gives up without deleting anything.
create or replace function lock_question_usage_tables()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tables text[] := array['student_supplemental_practice_results', 'in_house_assessment_item_responses',
    'in_house_assessment_attempts', 'student_resources', 'student_assignment_revisions', 'quiz_results',
    'module_results', 'consult_diagnostic_results', 'exam_reports', 'question_set_items', 'question_flags'];
  v_table text;
  v_attempt integer := 0;
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'Question deletion safety check is unavailable because table % is missing.', v_table;
    end if;
  end loop;
  loop
    begin
      execute 'lock table ' || (select string_agg(format('public.%I', t), ', ') from unnest(v_tables) t)
        || ' in share mode nowait';
      return;
    exception when lock_not_available then
      v_attempt := v_attempt + 1;
      if v_attempt >= 20 then
        raise exception 'Nothing was deleted because students are saving work right now. Please try again in a minute.'
          using errcode = '55P03';
      end if;
      perform pg_sleep(0.1);
    end;
  end loop;
end;
$$;

-- Enforced for every delete path, including direct table deletes.
-- Per row (the row is already locked): active status, practice sets, and
-- student flags, checked before foreign-key actions could cascade or unlink them.
create or replace function prevent_used_question_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_summary text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Questions can only be permanently deleted in a read committed transaction.';
  end if;
  select r.summary into v_summary from question_block_report(array[old.id], 'direct') r;
  if v_summary is not null then
    raise exception 'Question % cannot be permanently deleted: %.',
      coalesce('#' || old.question_no::text, old.id::text), v_summary
      using errcode = '23503',
            hint = 'Use Make inactive to hide it from students. Questions with student or assessment history must be kept.';
  end if;
  return old;
end;
$$;

-- Once per delete statement, for all deleted ids together:
--   1. full scan of student and assessment records without holding any lock;
--   2. briefly hold student writes, then re-scan only rows written by
--      transactions that were still running or started after step 1 began.
-- Rows not re-scanned were committed before step 1 and were already seen, so
-- no concurrent save can be missed, while students are held only for step 2.
create or replace function prevent_used_question_delete_batch()
returns trigger
language plpgsql
security definer
set search_path = public
set lock_timeout = '2s'
as $$
declare
  v_ids uuid[];
  v_keys text[];
  v_since xid;
  v_blocked text;
begin
  select array_agg(o.id), array_agg(o.source_key) into v_ids, v_keys from old_questions o;
  if v_ids is null then
    return null;
  end if;
  v_since := xid(pg_snapshot_xmin(pg_current_snapshot()));
  for v_pass in 1..2 loop
    if v_pass = 2 then
      perform lock_question_usage_tables();
    end if;
    select string_agg(coalesce('#' || o.question_no::text, o.id::text) || ': ' || r.summary, E'\n' order by o.question_no, o.id)
    into v_blocked
    from question_block_report(v_ids, 'scan', case when v_pass = 2 then v_since end, v_keys) r
    join old_questions o on o.id = r.question_id;
    if v_blocked is not null then
      raise exception E'No questions were deleted. These questions cannot be permanently deleted:\n%', v_blocked
        using errcode = '23503',
              hint = 'Use Make inactive to hide questions from students. Questions with student or assessment history must be kept.';
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists questions_prevent_used_delete on questions;
create trigger questions_prevent_used_delete
  before delete on questions
  for each row execute function prevent_used_question_delete();
drop trigger if exists questions_prevent_used_delete_batch on questions;
create trigger questions_prevent_used_delete_batch
  after delete on questions
  referencing old table as old_questions
  for each statement execute function prevent_used_question_delete_batch();

create or replace function delete_questions_permanently(p_question_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '2s'
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

  -- Holds the question rows so they cannot be published or edited mid-delete.
  perform 1 from questions where id = any(v_ids) order by id for update;

  -- Cheap checks first; the full report (with student records) is built only for a refusal.
  -- On success the student-record checks run once, in questions_prevent_used_delete_batch.
  if exists (select 1 from question_block_report(v_ids, 'direct')) then
    select string_agg(coalesce('#' || q.question_no::text, q.id::text) || ': ' || r.summary, E'\n' order by q.question_no, q.id)
    into v_blocked
    from question_block_report(v_ids, 'all') r
    join questions q on q.id = r.question_id;
    raise exception E'No questions were deleted. These questions cannot be permanently deleted:\n%', v_blocked
      using errcode = '23503',
            hint = 'Use Make inactive to hide questions from students. Questions with student or assessment history must be kept.';
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

revoke all on function question_usage_details(uuid[], text, xid, text[]) from public, anon, authenticated;
revoke all on function question_block_report(uuid[], text, xid, text[]) from public, anon, authenticated;
revoke all on function prevent_used_question_delete() from public, anon, authenticated;
revoke all on function prevent_used_question_delete_batch() from public, anon, authenticated;
revoke all on function lock_question_usage_tables() from public, anon, authenticated;
revoke all on function question_deletion_blockers(uuid[]) from public, anon;
revoke all on function delete_questions_permanently(uuid[]) from public, anon;
grant execute on function question_deletion_blockers(uuid[]) to authenticated;
grant execute on function delete_questions_permanently(uuid[]) to authenticated;
