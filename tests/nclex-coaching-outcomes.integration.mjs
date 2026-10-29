import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const name = 'coaching-outcomes-' + randomUUID().slice(0, 8);
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
const embeddedModule = process.env.COACHING_TEST_PGLITE_MODULE;
let embedded;
const sql = input => embedded ? embedded.exec(input) :
  docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1'], input);
test('outcomes migration preserves existing records and enforces admin-only records, evidence retention, audit and attempt integrity', async () => {
  let started = false;
  try {
    if (embeddedModule) {
      const { PGlite } = await import(pathToFileURL(embeddedModule).href);
      embedded = new PGlite();
    } else {
      docker(['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
      started = true;
      for (let i = 0; ; i++) {
        if (spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres']).status === 0) break;
        assert.ok(i < 100, 'Disposable PostgreSQL did not start'); await delay(200);
      }
    }
    await sql(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('test.uid',true),'')::uuid
      $$;
      CREATE FUNCTION public.is_app_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT auth.uid()='00000000-0000-0000-0000-000000000099'::uuid
      $$;
      CREATE TABLE public.students(id uuid PRIMARY KEY);
      INSERT INTO students VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
      INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000099'),('00000000-0000-0000-0000-000000000077');
      SET test.uid='00000000-0000-0000-0000-000000000099';
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
    `);
    await sql(read('supabase-consult-intake-migration.sql'));
    await sql(read('supabase-student-onboarding-migration.sql'));
    await sql(`
      CREATE TABLE consultations(id uuid PRIMARY KEY,student_id uuid,consult_intake_id uuid,consult_type text,status text);
      INSERT INTO consult_intakes(id,full_name,student_id,created_by) VALUES
        ('00000000-0000-0000-0000-000000000011','Synthetic existing student','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000099');
      INSERT INTO nclex_attempts(id,consult_intake_id,attempt_number,test_date,result,notes) VALUES
        ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000011',1,current_date-10,'fail','Original private CPR notes');
      INSERT INTO nclex_cpr_results(attempt_id,domain,rating) VALUES
        ('00000000-0000-0000-0000-000000000021','Domain','near_passing');
      CREATE TABLE before_attempts AS SELECT to_jsonb(a) AS row FROM nclex_attempts a;
      CREATE TABLE before_cpr AS SELECT * FROM nclex_cpr_results;
      CREATE TABLE before_students AS SELECT * FROM students;
      CREATE TABLE before_policies AS SELECT * FROM pg_policies WHERE schemaname='public';
      GRANT SELECT,INSERT,UPDATE,DELETE ON nclex_attempts,consult_intakes,consultations TO authenticated;
    `);
    await sql(read('supabase-nclex-coaching-outcomes.sql'));
    await sql(`
      DO $$ BEGIN
        ASSERT NOT EXISTS(SELECT row FROM before_attempts EXCEPT SELECT to_jsonb(a)-ARRAY['student_id','exam_type','candidate_type','exam_taken'] FROM nclex_attempts a);
        ASSERT NOT EXISTS(SELECT * FROM before_cpr EXCEPT SELECT * FROM nclex_cpr_results);
        ASSERT NOT EXISTS(SELECT * FROM before_students EXCEPT SELECT * FROM students);
        ASSERT NOT EXISTS(SELECT * FROM before_policies EXCEPT SELECT * FROM pg_policies WHERE schemaname='public');
        ASSERT (SELECT count(*) FROM nclex_coaching_audit)=0;
        ASSERT NOT (SELECT public FROM storage.buckets WHERE id='nclex-outcome-evidence');
      END $$;
      SET ROLE authenticated;
      SET test.uid='00000000-0000-0000-0000-000000000099';
      INSERT INTO nclex_coaching_students(student_id,history_reviewed) VALUES('00000000-0000-0000-0000-000000000001',true);
      UPDATE nclex_coaching_students SET notes='Admin-only notes' WHERE student_id='00000000-0000-0000-0000-000000000001';
      INSERT INTO nclex_coaching_purchases(id,student_id,package_name,purchased_on,payment_status,payment_reference,payment_verified_on)
      VALUES('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000001','NCLEX coaching',current_date-30,'verified','Receipt checked',current_date-29);
      INSERT INTO nclex_coaching_sessions(id,purchase_id,completed_on,completion_reference)
      VALUES('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000031',current_date-20,'Attendance reviewed');
      SELECT save_coaching_nclex_attempt('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021',
        (SELECT updated_at FROM nclex_attempts WHERE id='00000000-0000-0000-0000-000000000021'),1,current_date-10,'fail','RN','first_time',true);
      INSERT INTO nclex_coaching_evidence(id,attempt_id,method,observed_result,exam_date,exam_type,supports_attempt,checked_on,source_reference)
      VALUES('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000021','student_report','fail',current_date-10,'RN',true,current_date,'Student statement');
      INSERT INTO storage.objects(bucket_id,name) VALUES('nclex-outcome-evidence','00000000-0000-0000-0000-000000000021/synthetic-file');
      INSERT INTO nclex_coaching_evidence(id,attempt_id,method,checked_on,source_reference,storage_path,file_name,mime_type,byte_size,sha256)
      VALUES('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000021','official',current_date,'Official record',
        '00000000-0000-0000-0000-000000000021/synthetic-file','Synthetic.pdf','application/pdf',100,repeat('a',64));
      DO $$ BEGIN
        ASSERT (SELECT count(*) FROM nclex_coaching_audit)>=7;
        ASSERT (SELECT count(*) FROM nclex_coaching_audit WHERE changed_by IS NULL)=0;
        BEGIN
          INSERT INTO nclex_coaching_evidence(attempt_id,method,checked_on,source_reference,storage_path)
          VALUES('00000000-0000-0000-0000-000000000021','official',current_date,'Invalid partial metadata','00000000-0000-0000-0000-000000000021/invalid');
          RAISE EXCEPTION 'Partial file metadata accepted';
        EXCEPTION WHEN check_violation THEN NULL; END;
        BEGIN
          UPDATE nclex_coaching_evidence SET method='official' WHERE id='00000000-0000-0000-0000-000000000051';
          RAISE EXCEPTION 'Evidence rewritten';
        EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Evidence is immutable%'; END;
        BEGIN
          UPDATE nclex_coaching_students SET report_id=gen_random_uuid();
          RAISE EXCEPTION 'Report identity changed';
        EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Student and report identities%'; END;
        BEGIN
          DELETE FROM nclex_attempts WHERE id='00000000-0000-0000-0000-000000000021';
          RAISE EXCEPTION 'Tracked attempt deleted';
        EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Coaching outcome attempts must be retained%'; END;
        BEGIN
          DELETE FROM nclex_coaching_audit;
          RAISE EXCEPTION 'Audit deleted';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        BEGIN
          INSERT INTO nclex_coaching_audit(table_name,record_id,operation) VALUES('forged',gen_random_uuid(),'UPDATE');
          RAISE EXCEPTION 'Audit forged';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        BEGIN
          PERFORM save_coaching_nclex_attempt('00000000-0000-0000-0000-000000000001',NULL,NULL,1,current_date-9,'pass','RN','first_time',true);
          RAISE EXCEPTION 'Duplicate attempt accepted';
        EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'An attempt with this number%'; END;
        BEGIN
          PERFORM save_coaching_nclex_attempt('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021',now()-interval '1 day',1,current_date-10,'pass','RN','first_time',true);
          RAISE EXCEPTION 'Stale attempt accepted';
        EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Attempt changed in another editor%'; END;
        ASSERT (SELECT count(*) FROM storage.objects)=1;
      END $$;
      DELETE FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000021/synthetic-file';
      UPDATE storage.objects SET name='overwritten';
      DO $$ BEGIN ASSERT (SELECT count(*) FROM storage.objects WHERE name LIKE '%synthetic-file')=1; END $$;
      INSERT INTO storage.objects(bucket_id,name) VALUES('nclex-outcome-evidence','orphan');
      DELETE FROM storage.objects WHERE name='orphan';
      DO $$ BEGIN ASSERT (SELECT count(*) FROM storage.objects WHERE name='orphan')=0; END $$;
      UPDATE nclex_coaching_evidence SET revoked_at=now(),revocation_reason='Corrected record available'
        WHERE id='00000000-0000-0000-0000-000000000052';
      DELETE FROM storage.objects WHERE name='00000000-0000-0000-0000-000000000021/synthetic-file';
      DO $$ BEGIN ASSERT (SELECT count(*) FROM storage.objects)=1; END $$;
      -- Existing editors still work and their changes are audited.
      UPDATE nclex_attempts SET result='unknown' WHERE id='00000000-0000-0000-0000-000000000021';
      DO $$ BEGIN ASSERT EXISTS(SELECT 1 FROM nclex_coaching_audit WHERE table_name='nclex_attempts' AND before_data->>'result'='fail' AND after_data->>'result'='unknown'); END $$;
      -- Historical student without an intake: no intake/student duplication.
      INSERT INTO nclex_coaching_students(student_id) VALUES('00000000-0000-0000-0000-000000000002');
      SELECT save_coaching_nclex_attempt('00000000-0000-0000-0000-000000000002',NULL,NULL,1,NULL,NULL,'PN','first_time',false);
      DO $$ BEGIN
        ASSERT (SELECT count(*) FROM consult_intakes)=1;
        ASSERT EXISTS(SELECT 1 FROM nclex_attempts WHERE student_id='00000000-0000-0000-0000-000000000002' AND consult_intake_id IS NULL);
      END $$;
      -- A later CPR intake must not create another copy of a direct-linked attempt.
      INSERT INTO consult_intakes(id,full_name,student_id) VALUES
        ('00000000-0000-0000-0000-000000000012','Synthetic later intake','00000000-0000-0000-0000-000000000002');
      DO $$ BEGIN
        BEGIN
          INSERT INTO nclex_attempts(consult_intake_id,attempt_number) VALUES('00000000-0000-0000-0000-000000000012',1);
          RAISE EXCEPTION 'Duplicate through existing CPR editor accepted';
        EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'This student already has this attempt%'; END;
        BEGIN
          INSERT INTO nclex_coaching_evidence(attempt_id,method,observed_result,exam_date,exam_type,supports_attempt,
            identity_checked,checked_on,source_reference,licensing_board,license_type)
          VALUES('00000000-0000-0000-0000-000000000021','license','fail',current_date-10,'RN',true,true,current_date,'Nursys','State','RN');
          RAISE EXCEPTION 'License finding accepted as failure proof';
        EXCEPTION WHEN check_violation THEN NULL; END;
        BEGIN
          INSERT INTO nclex_coaching_sessions(purchase_id,completed_on,completion_reference)
          VALUES('00000000-0000-0000-0000-000000000031',current_date+1,'Impossible completion');
          RAISE EXCEPTION 'Future completion accepted';
        EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Completion must be on/after purchase%'; END;
        BEGIN
          UPDATE nclex_coaching_purchases SET purchased_on=current_date-5 WHERE id='00000000-0000-0000-0000-000000000031';
          RAISE EXCEPTION 'Purchase moved after completed session';
        EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM LIKE 'Purchase date cannot be after%'; END;
      END $$;
      SET test.uid='00000000-0000-0000-0000-000000000077';
      DO $$ DECLARE t text; n int; BEGIN
        FOREACH t IN ARRAY ARRAY['nclex_coaching_students','nclex_coaching_purchases','nclex_coaching_sessions','nclex_coaching_evidence','nclex_coaching_audit'] LOOP
          EXECUTE format('SELECT count(*) FROM %I',t) INTO n; ASSERT n=0;
        END LOOP;
        ASSERT (SELECT count(*) FROM storage.objects)=0;
        BEGIN
          INSERT INTO nclex_coaching_students(student_id) VALUES(gen_random_uuid());
          RAISE EXCEPTION 'Nonadmin insert accepted';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        BEGIN
          INSERT INTO storage.objects(bucket_id,name) VALUES('nclex-outcome-evidence','nonadmin');
          RAISE EXCEPTION 'Nonadmin upload accepted';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        BEGIN
          PERFORM save_coaching_nclex_attempt('00000000-0000-0000-0000-000000000001',NULL,NULL,2,current_date,'pass','RN','retaker',true);
          RAISE EXCEPTION 'Nonadmin RPC accepted';
        EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Administrator access required'; END;
      END $$;
      RESET ROLE;
      DO $$ BEGIN
        ASSERT NOT has_table_privilege('anon','nclex_coaching_students','SELECT');
        ASSERT NOT has_table_privilege('anon','nclex_coaching_evidence','SELECT');
        ASSERT NOT has_table_privilege('authenticated','nclex_coaching_audit','UPDATE');
        ASSERT NOT has_function_privilege('anon','save_coaching_nclex_attempt(uuid,uuid,timestamptz,integer,date,text,text,text,boolean)','EXECUTE');
        ASSERT (SELECT count(*) FROM students)=2;
        ASSERT NOT EXISTS(SELECT * FROM before_cpr EXCEPT SELECT * FROM nclex_cpr_results);
      END $$;
    `);
  } finally {
    if (embedded) await embedded.close();
    if (started) docker(['rm', '-f', name]);
  }
});
