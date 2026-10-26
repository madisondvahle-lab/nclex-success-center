import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const name = 'consult-cpr-' + randomUUID().slice(0, 8);
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
const sql = input => docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1'], input);
test('CPR file migration is additive/idempotent, enforces profile ownership, and preserves private RLS and merge/delete behavior', async () => {
  let started = false;
  try {
    docker(['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
    started = true;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres']).status === 0) { ready = true; break; }
      await delay(200);
    }
    assert.ok(ready);
    sql(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('test.uid',true),'')::uuid
      $$;
      CREATE FUNCTION public.is_app_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT auth.uid()='00000000-0000-0000-0000-000000000099'::uuid
      $$;
      CREATE TABLE public.students(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000099');
      SET test.uid='00000000-0000-0000-0000-000000000099';
    `);
    sql(read('supabase-consult-intake-migration.sql'));
    sql(read('supabase-student-onboarding-migration.sql'));
    sql(`
      INSERT INTO consult_intakes(id,full_name,created_by) VALUES
        ('00000000-0000-0000-0000-000000000001','Synthetic A','00000000-0000-0000-0000-000000000099'),
        ('00000000-0000-0000-0000-000000000002','Synthetic B','00000000-0000-0000-0000-000000000099');
      INSERT INTO nclex_attempts(id,consult_intake_id,attempt_number,question_count,notes) VALUES
        ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001',1,85,'Existing private notes'),
        ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002',1,150,'Other attempt');
      INSERT INTO consult_intake_files(id,consult_intake_id,category,storage_path,file_name,mime_type,uploaded_by) VALUES
        ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000001','CPR report','consults/a/old.pdf','old.pdf','application/pdf','00000000-0000-0000-0000-000000000099');
      CREATE TABLE before_attempts AS SELECT * FROM nclex_attempts;
      CREATE TABLE before_files AS SELECT * FROM consult_intake_files;
      CREATE TABLE before_policies AS SELECT * FROM pg_policies WHERE schemaname='public';
    `);
    sql(read('supabase-consult-cpr-files.sql'));
    sql(read('supabase-consult-cpr-files.sql'));
    sql(`
      BEGIN;
      SET CONSTRAINTS ALL IMMEDIATE;
      DO $$ BEGIN
        ASSERT NOT EXISTS (SELECT * FROM before_attempts EXCEPT SELECT * FROM nclex_attempts);
        ASSERT (SELECT count(*) FROM before_attempts)=(SELECT count(*) FROM nclex_attempts);
        ASSERT (SELECT row_to_json(b)::jsonb FROM before_files b)=(SELECT to_jsonb(f)-'attempt_id' FROM consult_intake_files f);
        ASSERT NOT EXISTS (SELECT * FROM before_policies EXCEPT SELECT * FROM pg_policies WHERE schemaname='public');
        ASSERT NOT EXISTS (SELECT * FROM pg_policies WHERE schemaname='public' EXCEPT SELECT * FROM before_policies);
        ASSERT (SELECT attempt_id IS NULL FROM consult_intake_files);
        BEGIN
          UPDATE consult_intake_files SET attempt_id='00000000-0000-0000-0000-000000000012';
          RAISE EXCEPTION 'Cross-intake attempt accepted';
        EXCEPTION WHEN foreign_key_violation THEN NULL; END;
        BEGIN
          UPDATE consult_intake_files SET attempt_id='00000000-0000-0000-0000-000000000088';
          RAISE EXCEPTION 'Missing attempt accepted';
        EXCEPTION WHEN foreign_key_violation THEN NULL; END;
      END $$;
      UPDATE consult_intake_files SET attempt_id='00000000-0000-0000-0000-000000000011';
      -- Existing profile merge moves attempts before file metadata.
      SET CONSTRAINTS consult_intake_files_attempt_intake_fk DEFERRED;
      UPDATE nclex_attempts SET consult_intake_id='00000000-0000-0000-0000-000000000002',attempt_number=2
        WHERE id='00000000-0000-0000-0000-000000000011';
      UPDATE consult_intake_files SET consult_intake_id='00000000-0000-0000-0000-000000000002'
        WHERE consult_intake_id='00000000-0000-0000-0000-000000000001';
      SET CONSTRAINTS consult_intake_files_attempt_intake_fk IMMEDIATE;
      DO $$ BEGIN
        ASSERT (SELECT consult_intake_id='00000000-0000-0000-0000-000000000002' FROM consult_intake_files);
      END $$;
      DELETE FROM nclex_attempts WHERE id='00000000-0000-0000-0000-000000000011';
      DO $$ BEGIN
        ASSERT (SELECT attempt_id IS NULL AND storage_path='consults/a/old.pdf' FROM consult_intake_files);
      END $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT SELECT,INSERT,UPDATE,DELETE ON consult_intake_files,nclex_attempts TO authenticated;
      SET ROLE authenticated;
      SET test.uid='00000000-0000-0000-0000-000000000077';
      DO $$ BEGIN
        ASSERT (SELECT count(*) FROM consult_intake_files)=0;
        ASSERT (SELECT count(*) FROM nclex_attempts)=0;
        BEGIN
          INSERT INTO nclex_attempts(consult_intake_id,attempt_number) VALUES ('00000000-0000-0000-0000-000000000002',3);
          RAISE EXCEPTION 'Nonadmin insert allowed';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        BEGIN
          INSERT INTO consult_intake_files(consult_intake_id,category,storage_path,file_name,mime_type)
          VALUES ('00000000-0000-0000-0000-000000000002','CPR report','forbidden','forbidden.pdf','application/pdf');
          RAISE EXCEPTION 'Nonadmin file metadata insert allowed';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      END $$;
      SET test.uid='00000000-0000-0000-0000-000000000099';
      DO $$ BEGIN
        ASSERT (SELECT count(*) FROM consult_intake_files)=1;
        ASSERT (SELECT count(*) FROM nclex_attempts)=1;
      END $$;
      RESET ROLE;
      DO $$ BEGIN
        ASSERT NOT has_table_privilege('anon','consult_intake_files','SELECT');
        ASSERT NOT has_table_privilege('anon','nclex_attempts','SELECT');
      END $$;
      COMMIT;
    `);
  } finally { if (started) docker(['rm', '-f', name]); }
});
