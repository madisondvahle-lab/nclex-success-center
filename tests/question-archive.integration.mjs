import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const name = 'question-archive-' + randomUUID().slice(0, 8);
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
const sql = input => docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1'], input);
test('archive migration is additive/idempotent; activation blocked, history/RLS retained, restoration inactive', async () => {
  let started = false;
  try {
    docker(['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
    started = true;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      const logs = spawnSync('docker', ['logs', name], { encoding: 'utf8' });
      if ((logs.stdout + logs.stderr).includes('PostgreSQL init process complete') &&
          spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres']).status === 0) { ready = true; break; }
      await delay(200);
    }
    assert.ok(ready, 'Disposable PostgreSQL did not finish initialization');
    sql(`
      CREATE ROLE authenticated NOLOGIN;
      CREATE TABLE questions(id int PRIMARY KEY, active boolean NOT NULL, stem text);
      ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
      CREATE POLICY admin_only ON questions TO authenticated USING (current_setting('test.admin',true)='yes');
      GRANT SELECT,UPDATE ON questions TO authenticated;
      CREATE TABLE question_set_items(question_id int REFERENCES questions);
      CREATE TABLE student_results(question_id int REFERENCES questions, answer text);
      CREATE TABLE question_revision_drafts(question_id int REFERENCES questions,status text);
      CREATE TABLE question_audits(question_id int REFERENCES questions, note text);
      INSERT INTO questions VALUES (1,false,'Synthetic old'),(2,true,'Synthetic published');
      INSERT INTO question_set_items VALUES (1);
      INSERT INTO student_results VALUES (1,'Original answer');
      INSERT INTO question_revision_drafts VALUES (1,'pending_review');
      INSERT INTO question_audits VALUES (1,'Original finding');
      CREATE TABLE before_questions AS TABLE questions;
      CREATE TABLE before_policies AS SELECT * FROM pg_policies WHERE tablename='questions';
    `);
    const migration = readFileSync(new URL('../supabase-question-archive.sql', import.meta.url), 'utf8');
    sql(migration);
    sql(migration);
    sql(`
      DO $$ BEGIN
        IF EXISTS(SELECT id,active,stem FROM questions EXCEPT SELECT * FROM before_questions) THEN RAISE EXCEPTION 'Existing content changed'; END IF;
        IF EXISTS(SELECT * FROM questions WHERE archived_at IS NOT NULL) THEN RAISE EXCEPTION 'Migration archived records'; END IF;
        IF EXISTS(SELECT * FROM pg_policies WHERE tablename='questions' EXCEPT SELECT * FROM before_policies) THEN RAISE EXCEPTION 'Policies changed'; END IF;
      END $$;
      SET ROLE authenticated; SET test.admin='yes';
      UPDATE questions SET archived_at=now() WHERE id=1;
      DO $$ BEGIN
        BEGIN UPDATE questions SET active=true WHERE id=1;
          RAISE EXCEPTION 'Archive activated';
        EXCEPTION WHEN check_violation THEN NULL; END;
        BEGIN UPDATE questions SET archived_at=now() WHERE id=2;
          RAISE EXCEPTION 'Published archived';
        EXCEPTION WHEN check_violation THEN NULL; END;
      END $$;
      SET test.admin='no';
      UPDATE questions SET archived_at=NULL WHERE id=1;
      RESET ROLE;
      DO $$ BEGIN
        IF NOT EXISTS(SELECT FROM questions WHERE id=1 AND archived_at IS NOT NULL AND active=false) THEN RAISE EXCEPTION 'RLS bypass'; END IF;
        IF NOT EXISTS(SELECT FROM student_results WHERE answer='Original answer') OR
           NOT EXISTS(SELECT FROM question_set_items WHERE question_id=1) OR
           NOT EXISTS(SELECT FROM question_revision_drafts WHERE status='pending_review') OR
           NOT EXISTS(SELECT FROM question_audits WHERE note='Original finding') THEN RAISE EXCEPTION 'History changed'; END IF;
      END $$;
      UPDATE questions SET archived_at=NULL WHERE id=1;
      DO $$ BEGIN
        IF NOT EXISTS(SELECT FROM questions WHERE id=1 AND active=false AND archived_at IS NULL) THEN RAISE EXCEPTION 'Restore published'; END IF;
      END $$;
    `);
  } finally { if (started) docker(['rm', '-f', name]); }
});
