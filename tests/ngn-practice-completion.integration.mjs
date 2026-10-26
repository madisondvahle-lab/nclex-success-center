import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const name = 'ngn-practice-test-' + randomUUID().slice(0, 8);
function docker(args, input) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, timeout: 120000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
const sql = source => docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1'], source);
test('completion migration on disposable PostgreSQL preserves ownership, weekly/CAT behavior and existing records', async () => {
  let created = false;
  try {
    docker(['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
    created = true;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres']).status === 0) { ready = true; break; }
      await delay(200);
    }
    assert.ok(ready);
    sql(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('test.uid',true),'')::uuid
      $$;
      CREATE TABLE students(id uuid PRIMARY KEY, auth_user_id uuid);
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT SELECT ON students TO authenticated;
      CREATE FUNCTION is_app_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT auth.uid()='00000000-0000-0000-0000-000000000099'::uuid
      $$;
      CREATE TABLE student_resources(
        id uuid PRIMARY KEY, student_id uuid REFERENCES students(id), resource_type text,
        assignment_kind text, assignment_week date, assignment_details jsonb, completed_at timestamptz
      );
      CREATE TABLE questions(id uuid PRIMARY KEY, stem text);
      INSERT INTO questions VALUES ('00000000-0000-0000-0000-000000000080','Existing question must not change');
      INSERT INTO students VALUES
        ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011'),
        ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012');
      INSERT INTO student_resources(id,student_id,resource_type,assignment_kind,assignment_week,assignment_details) VALUES
        ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000001','practice_set','practice',NULL,'{"practice_type":"ngn-authored","platform":"Portal Question Bank"}'),
        ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000002','practice_set','practice',NULL,'{"practice_type":"ngn-authored","platform":"Portal Question Bank"}'),
        ('00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000001','practice_set','practice','2026-10-26','{}'),
        ('00000000-0000-0000-0000-000000000024','00000000-0000-0000-0000-000000000001','practice_set','cat','2026-10-26','{}'),
        ('00000000-0000-0000-0000-000000000025','00000000-0000-0000-0000-000000000001','document',NULL,NULL,'{}'),
        ('00000000-0000-0000-0000-000000000026','00000000-0000-0000-0000-000000000001','practice_set','cat',NULL,'{"practice_type":"ngn-authored","platform":"Portal Question Bank"}');
    `);
    sql(readFileSync(new URL('../supabase-supplemental-practice-migration.sql', import.meta.url), 'utf8'));
    const migration = readFileSync(new URL('../supabase-ngn-practice-completion.sql', import.meta.url), 'utf8');
    sql(migration);
    sql(migration);
    sql(`
      DO $$ BEGIN
        ASSERT (SELECT count(*) FROM student_resources WHERE completed_at IS NOT NULL)=0, 'Migration must not edit records';
        ASSERT (SELECT stem FROM questions)='Existing question must not change';
        ASSERT (SELECT count(*) FROM students)=2;
      END $$;
      SET ROLE authenticated;
      SET test.uid='00000000-0000-0000-0000-000000000011';
      DO $$ DECLARE stamp timestamptz; BEGIN
        stamp:=set_weekly_assignment_complete('00000000-0000-0000-0000-000000000021',true);
        ASSERT stamp IS NOT NULL;
        ASSERT stamp=set_weekly_assignment_complete('00000000-0000-0000-0000-000000000021',true),'Idempotent completion';
        ASSERT set_weekly_assignment_complete('00000000-0000-0000-0000-000000000021',false) IS NULL;
        PERFORM set_weekly_assignment_complete('00000000-0000-0000-0000-000000000023',true);
        PERFORM set_weekly_assignment_complete('00000000-0000-0000-0000-000000000024',true);
        BEGIN
          PERFORM set_weekly_assignment_complete('00000000-0000-0000-0000-000000000022',true);
          RAISE EXCEPTION 'Foreign assignment incorrectly accepted';
        EXCEPTION WHEN raise_exception THEN
          IF SQLERRM NOT LIKE '%access denied%' THEN RAISE; END IF;
        END;
        BEGIN
          PERFORM set_weekly_assignment_complete('00000000-0000-0000-0000-000000000025',true);
          RAISE EXCEPTION 'Document incorrectly accepted';
        EXCEPTION WHEN raise_exception THEN
          IF SQLERRM NOT LIKE '%access denied%' THEN RAISE; END IF;
        END;
        BEGIN
          PERFORM set_weekly_assignment_complete('00000000-0000-0000-0000-000000000026',true);
          RAISE EXCEPTION 'Undated CAT incorrectly accepted';
        EXCEPTION WHEN raise_exception THEN
          IF SQLERRM NOT LIKE '%access denied%' THEN RAISE; END IF;
        END;
        BEGIN
          PERFORM set_weekly_assignment_complete('00000000-0000-0000-0000-000000000021',NULL);
          RAISE EXCEPTION 'Null completion incorrectly accepted';
        EXCEPTION WHEN raise_exception THEN
          IF SQLERRM NOT LIKE '%Completion state required%' THEN RAISE; END IF;
        END;
      END $$;
      SET test.uid='00000000-0000-0000-0000-000000000099';
      SELECT set_weekly_assignment_complete('00000000-0000-0000-0000-000000000022',true);
      RESET ROLE;
      DO $$ BEGIN
        ASSERT NOT has_function_privilege('anon','set_weekly_assignment_complete(uuid,boolean)','execute');
        ASSERT has_function_privilege('authenticated','set_weekly_assignment_complete(uuid,boolean)','execute');
        ASSERT (SELECT count(*) FROM student_resources WHERE completed_at IS NOT NULL)=3;
        ASSERT NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='authenticated');
      END $$;
    `);
    sql(`
      GRANT SELECT, INSERT ON student_supplemental_practice_results TO authenticated;
      SET ROLE authenticated;
      SET test.uid='00000000-0000-0000-0000-000000000011';
      INSERT INTO student_supplemental_practice_results(student_id,practice_key,practice_title,score,total_questions,answer_details)
        VALUES ('00000000-0000-0000-0000-000000000001','ngn-authored-synthetic','Synthetic case',2,6,
        '[{"question_id":"child-1","selected_answer":[0],"credit":{"earned":1,"max":2},"interaction":{"type":"sata","tabs":[{"id":"notes","label":"Notes"}]}}]');
      DO $$ BEGIN
        ASSERT (SELECT answer_details->0->'selected_answer' FROM student_supplemental_practice_results)='[0]'::jsonb;
        ASSERT (SELECT answer_details->0->'credit'->>'earned' FROM student_supplemental_practice_results)='1';
        BEGIN
          INSERT INTO student_supplemental_practice_results(student_id,practice_key,practice_title,score,total_questions)
            VALUES ('00000000-0000-0000-0000-000000000002','other','Other student',0,6);
          RAISE EXCEPTION 'Foreign result incorrectly accepted';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
      END $$;
      SET test.uid='00000000-0000-0000-0000-000000000012';
      DO $$ BEGIN ASSERT (SELECT count(*) FROM student_supplemental_practice_results)=0; END $$;
      RESET ROLE;
    `);
  } finally {
    if (created) docker(['stop', name]);
  }
});
