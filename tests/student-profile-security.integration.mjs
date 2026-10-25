// Real authenticated HTTP requests to a disposable, loopback-only PostgREST.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = readFileSync(new URL('./student-profile-security-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase-student-profile-update-security.sql', import.meta.url), 'utf8');
const suffix = `profile-security-${process.pid}-${randomUUID().slice(0, 8)}`;
const dbName = `${suffix}-db`, apiName = `${suffix}-api`;
const jwtSecret = 'disposable-profile-test-hmac-secret-not-production';
const studentId = '00000000-0000-0000-0000-000000000001';
const otherId = '00000000-0000-0000-0000-000000000002';
const studentUser = '00000000-0000-0000-0000-000000000011';
const otherUser = '00000000-0000-0000-0000-000000000012';
const adminUser = '00000000-0000-0000-0000-000000000099';

function docker(args, input) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', input, timeout: 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Docker ${args[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function sql(source) {
  return docker(['exec', '-i', dbName, 'psql', '-h', '127.0.0.1', '-X', '-q', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], source);
}
function token(sub, role = 'authenticated') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${payload}.${createHmac('sha256', jwtSecret).update(payload).digest('base64url')}`;
}

await test('student profile security over real disposable PostgREST', async t => {
  let networkCreated = false, dbCreated = false, apiCreated = false;
  try {
    docker(['network', 'create', suffix]);
    networkCreated = true;
    docker(['run', '-d', '--rm', '--name', dbName, '--network', suffix,
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
    dbCreated = true;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      const result = spawnSync('docker', ['exec', dbName, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { timeout: 10000 });
      if (result.status === 0) { ready = true; break; }
      await delay(200);
    }
    assert.ok(ready, 'disposable Postgres readiness');
    sql(`SET app.profile_security_test = 'local-only';\n${fixture}`);
    docker(['run', '-d', '--rm', '--name', apiName, '--network', suffix, '-p', '127.0.0.1::3000',
      '-e', `PGRST_DB_URI=postgres://authenticator:local-only-profile-test@${dbName}:5432/postgres`,
      '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', `PGRST_JWT_SECRET=${jwtSecret}`,
      'public.ecr.aws/supabase/postgrest:v16.4']);
    apiCreated = true;
    const port = docker(['port', apiName, '3000/tcp']).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
    assert.ok(port, 'API binds to loopback only');
    const base = `http://127.0.0.1:${port}`;
    async function api(path, method = 'GET', body, jwt = token(studentUser)) {
      const response = await fetch(base + path, {
        method, signal: AbortSignal.timeout(10000),
        headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          'Content-Type': 'application/json', Prefer: 'return=representation' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const text = await response.text();
      return { status: response.status, ok: response.ok, data: text ? JSON.parse(text) : null };
    }
    let apiReady = false;
    for (let i = 0; i < 100; i++) {
      try {
        const response = await api(`/students?id=eq.${studentId}`, 'GET', undefined, token(adminUser));
        if (response.ok) { apiReady = true; break; }
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
      await delay(200);
    }
    assert.ok(apiReady, 'disposable PostgREST readiness');
    const read = async id => {
      const result = await api(`/students?id=eq.${id}`, 'GET', undefined, token(adminUser));
      assert.equal(result.status, 200);
      assert.equal(result.data.length, 1);
      return result.data[0];
    };
    const patch = (body, jwt = token(studentUser), id = studentId) =>
      api(`/students?id=eq.${id}`, 'PATCH', body, jwt);
    const profile = (body, jwt = token(studentUser)) =>
      api('/rpc/update_my_student_profile', 'POST', { profile_patch: body }, jwt);

    await t.test('fixture reproduces live unauthorized profile transition before fix', async () => {
      const response = await patch({ portal_stage: 'active', status: 'completed' });
      assert.equal(response.status, 200);
      assert.equal((await read(studentId)).portal_stage, 'active');
      assert.equal((await read(studentId)).status, 'completed');
      await patch({ portal_stage: 'assessment', status: 'active' }, token(adminUser));
    });
    sql(migration);
    sql(migration);
    sql("NOTIFY pgrst, 'reload schema';");
    // Wait for the real API schema cache to recognize the newly created RPC.
    for (let i = 0; i < 100; i++) {
      const response = await profile({});
      if (response.status === 200) break;
      assert.equal(response.status, 404, JSON.stringify(response.data));
      await delay(200);
    }
    const baseline = await read(studentId);
    const adminFields = {
      id: '00000000-0000-0000-0000-000000000003', auth_user_id: null,
      portal_stage: 'active', student_type: 'nclex', status: 'completed',
      archived_at: '2099-01-01T00:00:00Z', created_at: '2099-01-01T00:00:00Z',
      portal_invite_sent_at: '2099-01-01T00:00:00Z',
      name: 'Tampered name', email: 'tampered@example.test', pin: 'tampered',
      nclex_target_date: '2099-12-01'
    };
    for (const [column, value] of Object.entries(adminFields)) {
      await t.test(`direct authenticated PATCH cannot change ${column}`, async () => {
        const response = await patch({ [column]: value });
        assert.ok([200, 403].includes(response.status), JSON.stringify(response));
        if (response.ok) assert.deepEqual(response.data, []);
        assert.deepEqual(await read(studentId), baseline);
      });
      await t.test(`RPC rejects injected ${column}`, async () => {
        const response = await profile({ course_name: 'Allowed-looking value', [column]: value });
        assert.equal(response.status, 400);
        assert.deepEqual(await read(studentId), baseline);
      });
    }
    await t.test('direct PATCH also denies self-service columns and mixed patches', async () => {
      for (const body of [{ course_name: 'Direct bypass' }, { exam_date: '2099-09-01' },
        { course_name: 'Mixed bypass', status: 'completed' }]) {
        const response = await patch(body);
        assert.ok(response.status === 403 || (response.status === 200 && response.data.length === 0));
        assert.deepEqual(await read(studentId), baseline);
      }
    });
    await t.test('malicious POST upsert cannot mutate profile identity or lifecycle', async () => {
      const response = await fetch(`${base}/students?on_conflict=id`, {
        method: 'POST', headers: { Authorization: `Bearer ${token(studentUser)}`,
          'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ ...baseline, status: 'completed', portal_stage: 'active' }),
        signal: AbortSignal.timeout(10000)
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await read(studentId), baseline);
    });
    await t.test('student cannot modify another student, even using self-service fields', async () => {
      const before = await read(otherId);
      const direct = await patch({ course_name: 'Cross-student bypass' }, token(studentUser), otherId);
      assert.ok(direct.status === 403 || (direct.status === 200 && direct.data.length === 0));
      const injected = await api('/rpc/update_my_student_profile', 'POST', {
        profile_patch: { course_name: 'Cross-student bypass' }, student_id: otherId
      });
      assert.equal(injected.status, 404);
      assert.deepEqual(await read(otherId), before);
    });
    await t.test('RPC saves only legitimate self-service fields and persists over fresh requests', async () => {
      const response = await profile({ course_name: '  Updated course  ', exam_date: '2099-03-15' });
      assert.equal(response.status, 200);
      assert.deepEqual(response.data, { course_name: 'Updated course', exam_date: '2099-03-15' });
      assert.deepEqual(await read(studentId), { ...baseline, ...response.data });
      const ownRead = await api(`/students?id=eq.${studentId}`);
      assert.equal(ownRead.data[0].course_name, 'Updated course');
      const beforeOther = await read(otherId);
      const other = await profile({ course_name: 'Other student own edit' }, token(otherUser));
      assert.equal(other.status, 200);
      assert.equal((await read(studentId)).course_name, 'Updated course');
      assert.deepEqual(await read(otherId), { ...beforeOther, course_name: 'Other student own edit' });
    });
    await t.test('partial patches preserve omitted values and null explicitly clears them', async () => {
      assert.equal((await profile({ course_name: 'Partial' })).status, 200);
      assert.equal((await read(studentId)).exam_date, '2099-03-15');
      assert.equal((await profile({ course_name: null, exam_date: null })).status, 200);
      const row = await read(studentId);
      assert.equal(row.course_name, null);
      assert.equal(row.exam_date, null);
    });
    await t.test('malformed profile patches cannot cause partial writes', async () => {
      const before = await read(studentId);
      for (const body of [null, [], 'not-object', { course_name: 3 }, { course_name: {} },
        { exam_date: 2099 }, { exam_date: '03/15/2099' }, { exam_date: '2099-02-30', course_name: 'Must not save' }]) {
        const response = await profile(body);
        assert.equal(response.status, 400, JSON.stringify({ body, response }));
        assert.deepEqual(await read(studentId), before);
      }
    });
    await t.test('anonymous and unlinked identities cannot save profiles', async () => {
      const before = await read(studentId);
      assert.equal((await profile({ course_name: 'Anonymous' }, null)).status, 401);
      assert.equal((await profile({ course_name: 'Unlinked' }, token(randomUUID()))).status, 403);
      assert.equal((await patch({ status: 'completed' }, null)).status, 401);
      assert.deepEqual(await read(studentId), before);
    });
    await t.test('forged privileged JWTs do not bypass authenticated API checks', async () => {
      const parts = token(adminUser, 'service_role').split('.');
      parts[2] = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
      const forged = parts.join('.');
      const before = await read(studentId);
      assert.equal((await patch({ status: 'completed' }, forged)).status, 401);
      assert.equal((await profile({ course_name: 'Forged identity' }, forged)).status, 401);
      assert.deepEqual(await read(studentId), before);
    });
    await t.test('admin lifecycle updates and service-role workflows remain functional', async () => {
      const admin = await patch({ status: 'paused', portal_stage: 'inactive', student_type: 'nclex' }, token(adminUser));
      assert.equal(admin.status, 200);
      assert.equal(admin.data[0].status, 'paused');
      const service = await patch({ status: 'active', portal_stage: 'assessment', student_type: 'nursing_student' },
        token(adminUser, 'service_role'));
      assert.equal(service.status, 200);
      assert.equal(service.data[0].status, 'active');
    });
    await t.test('existing NCLEX date RPC remains identity-scoped and usable', async () => {
      const otherBefore = await read(otherId);
      const response = await api('/rpc/update_my_nclex_target_date', 'POST', { new_target_date: '2099-11-11' });
      assert.equal(response.status, 200);
      assert.equal((await read(studentId)).nclex_target_date, '2099-11-11');
      assert.deepEqual(await read(otherId), otherBefore);
    });
    await t.test('archived profile cannot use onboarding RPC', async () => {
      await patch({ archived_at: '2099-01-01T00:00:00Z' }, token(adminUser));
      assert.equal((await profile({ course_name: 'Archived bypass' })).status, 403);
      await patch({ archived_at: null }, token(adminUser));
    });
    await t.test('another permissive policy cannot bypass the restrictive update guard', async () => {
      sql('CREATE POLICY test_permissive_update ON public.students FOR UPDATE TO authenticated USING (true) WITH CHECK (true);');
      const before = await read(studentId);
      const response = await patch({ status: 'completed' });
      assert.ok(response.status === 403 || (response.status === 200 && response.data.length === 0));
      assert.deepEqual(await read(studentId), before);
      assert.equal((await profile({ course_name: 'Still safe' })).status, 200);
    });
    await t.test('students cannot add themselves to administrator membership', async () => {
      const response = await api('/app_admins', 'POST', { user_id: studentUser });
      assert.equal(response.status, 403);
    });
    const courseMigration = new URL('../supabase-nursing-course-modules.sql', import.meta.url);
    if (existsSync(courseMigration)) {
      await t.test('coexists with the separately reviewed course-assignment migration', async () => {
        sql(`CREATE TABLE public.modules (module_key text PRIMARY KEY, guide_url text);
CREATE TABLE public.student_resources (
  student_id uuid REFERENCES students(id), class_code text, resource_type text, url text
);
CREATE TABLE public.student_module_access (
  student_id uuid REFERENCES students(id), module_key text, enabled boolean DEFAULT false,
  PRIMARY KEY (student_id,module_key)
);
ALTER TABLE public.student_module_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY manage_access ON public.student_module_access FOR ALL TO authenticated
  USING (is_app_admin()) WITH CHECK (is_app_admin());
GRANT SELECT,INSERT,UPDATE ON public.student_module_access TO authenticated;
INSERT INTO public.modules VALUES ('m4','module4-guide.html'),('m5','module5-guide.html');
INSERT INTO public.student_module_access VALUES ('${studentId}','m5',true);`);
        sql(readFileSync(courseMigration, 'utf8'));
        sql(migration);
        sql("NOTIFY pgrst, 'reload schema';");
        async function course(classCode, modules, jwt = token(adminUser)) {
          return api('/rpc/save_nursing_class_modules', 'POST', {
            p_student: studentId, p_class: classCode, p_modules: modules
          }, jwt);
        }
        for (let i = 0; i < 100; i++) {
          const result = await course('NUR 312', ['m4', 'm5']);
          if (result.status !== 404) { assert.equal(result.status, 204, JSON.stringify(result)); break; }
          await delay(200);
        }
        assert.equal((await course('NUR 416', ['m4'])).status, 204);
        assert.equal((await course('NUR 312', [])).status, 204);
        let grants = await api(`/student_module_access?student_id=eq.${studentId}`, 'GET', undefined, token(adminUser));
        assert.equal(grants.status, 200);
        assert.equal(grants.data.find(row => row.module_key === 'm4').enabled, true);
        assert.equal((await course('NUR 416', [])).status, 204);
        grants = await api(`/student_module_access?student_id=eq.${studentId}`, 'GET', undefined, token(adminUser));
        assert.equal(grants.data.find(row => row.module_key === 'm4').enabled, false);
        assert.equal(grants.data.find(row => row.module_key === 'm5').enabled, true);
        const denied = await course('NUR 312', ['m4'], token(studentUser));
        assert.equal(denied.status, 400);
        assert.match(denied.data.message, /Admin access required/);
        const links = await api(`/student_class_module_assignments?student_id=eq.${studentId}`);
        assert.equal(links.status, 200);
        assert.deepEqual(links.data, []);
        assert.equal((await profile({ course_name: 'Compatible self-service' })).status, 200);
        assert.equal((await read(studentId)).portal_stage, 'assessment');
      });
    }
  } finally {
    if (apiCreated) docker(['rm', '-f', apiName]);
    if (dbCreated) docker(['rm', '-f', dbName]);
    if (networkCreated) docker(['network', 'rm', suffix]);
  }
});
