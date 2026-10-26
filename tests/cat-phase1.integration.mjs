// Real PostgREST/JWT/database/atomic-RPC integration; local Auth stand-in verifies signed synthetic JWTs.
import assert from 'node:assert/strict';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const suffix = `cat-phase1-${process.pid}-${randomUUID().slice(0, 8)}`;
const dbName = `${suffix}-db`, apiName = `${suffix}-api`;
const secret = 'synthetic-cat-phase1-jwt-secret-not-a-real-secret';
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const token = (sub, role = 'authenticated') => {
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub, role, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
};
const serviceToken = token(uid(99), 'service_role'), studentToken = token(uid(11)), adminToken = token(uid(99));
function docker(args, input) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, timeout: 120000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
const sql = source => docker(['exec', '-i', dbName, 'psql', '-h', '127.0.0.1', '-X', '-q', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], source);
function verify(header) {
  const [a, b, signature] = String(header || '').replace(/^Bearer /, '').split('.');
  if (!a || !b || !signature) return null;
  const expected = createHmac('sha256', secret).update(`${a}.${b}`).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  const claims = JSON.parse(Buffer.from(b, 'base64url'));
  return claims.exp > Date.now() / 1000 ? claims : null;
}
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
async function freePort() { const server = createServer(); const port = await listen(server); await new Promise(r => server.close(r)); return port; }
const summary = values => {
  const sorted = values.slice().sort((a, b) => a - b);
  return { n: sorted.length, medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
    p95Ms: +sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2) };
};

await test('Phase 1 authenticated disposable integration and stage benchmark', async t => {
  let network = false, database = false, api = false, gateway;
  const children = [];
  const logs = new Map();
  const scratch = mkdtempSync(join(tmpdir(), 'cat-phase1-'));
  try {
    docker(['network', 'create', suffix]); network = true;
    docker(['run', '-d', '--rm', '--name', dbName, '--network', suffix,
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']); database = true;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (spawnSync('docker', ['exec', dbName, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) { ready = true; break; }
      await delay(100);
    }
    assert.ok(ready, 'disposable database TCP readiness');
    sql(readFileSync(new URL('./cat-phase1-schema.sql', import.meta.url), 'utf8'));
    const migration = readFileSync(join(root, '.agents/private/supabase-diagnostic-item-keys-migration.sql'), 'utf8');
    // Use production table definition/grants and atomic RPC, but no clinical seed data.
    sql(migration.slice(migration.indexOf('CREATE TABLE'), migration.indexOf('INSERT INTO public.in_house_diagnostic_item_keys')));
    const rpc = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.commit_in_house_diagnostic_answer'), migration.lastIndexOf('COMMIT;'));
    // The deployed RPC has the independent ambiguity correction; qualify the fixture's conflicting column.
    sql(rpc.replace('AND checkpoint_revision = p_expected_revision', 'AND in_house_assessment_attempts.checkpoint_revision = p_expected_revision'));
    sql(`INSERT INTO in_house_diagnostic_item_keys
      (bank_scope,item_id,item_source,selectable,item_type,difficulty,blueprint,category,nclex_category,core_tags,correct_response,rationale)
      SELECT 'diagnostic','synthetic-'||i,'local-synthetic',true,CASE WHEN i%2=0 THEN 'mcq' ELSE 'sata' END,2,
      'Safe & Effective Care Environment','Management of Care','Management of Care',
      '["delegation","consent_rights","infection_prevention","insulin_glucose","high_alert_medications","blood_administration","airway_breathing","circulation_shock","fluids_electrolytes","postoperative_risk","maternal_newborn","pediatrics","psych_safety"]',
      CASE WHEN i%2=0 THEN '[0]'::jsonb ELSE '[0,1]'::jsonb END, '{"correct":"Synthetic rationale"}'
      FROM generate_series(1,200) i;`);
    docker(['run', '-d', '--rm', '--name', apiName, '--network', suffix, '-p', '127.0.0.1::3000',
      '-e', `PGRST_DB_URI=postgres://authenticator@${dbName}:5432/postgres`,
      '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', `PGRST_JWT_SECRET=${secret}`,
      'public.ecr.aws/supabase/postgrest:v16.4']); api = true;
    const port = docker(['port', apiName, '3000/tcp']).match(/127\.0\.0\.1:(\d+)/)[1];
    const restOrigin = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(restOrigin, { headers: { Authorization: `Bearer ${serviceToken}` } })).ok) break; }
      catch (error) { if (!(error instanceof TypeError)) throw error; }
      await delay(100);
    }
    let hopDelay = 0;
    gateway = createServer(async (req, res) => {
      try {
        if (hopDelay) await delay(hopDelay);
        if (req.url === '/auth/v1/user') {
          const claims = verify(req.headers.authorization);
          res.writeHead(claims ? 200 : 401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(claims ? { id: claims.sub, aud: 'authenticated', role: claims.role } : { message: 'Invalid token' }));
          return;
        }
        if (!req.url.startsWith('/rest/v1/')) { res.writeHead(404); res.end(); return; }
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const response = await fetch(restOrigin + req.url.slice('/rest/v1'.length), {
          method: req.method, headers: { Authorization: req.headers.authorization || '', Accept: req.headers.accept || 'application/json', 'Content-Type': 'application/json',
            Prefer: req.headers.prefer || '' }, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
        });
        res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json' });
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (error) { res.writeHead(500); res.end(JSON.stringify({ message: String(error) })); }
    });
    const gatewayPort = await listen(gateway);
    async function startServer(sourcePath) {
      const port = await freePort();
      const child = spawn('deno', ['run', '--allow-net', '--allow-env', '--allow-read', '--no-check',
        join(root, 'tests/fixtures/cat-phase1-server.ts')], {
        env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${gatewayPort}`,
          SUPABASE_ANON_KEY: token(uid(0), 'anon'), SUPABASE_SERVICE_ROLE_KEY: serviceToken,
          CAT_TEST_SOURCE: sourcePath, CAT_TEST_PORT: String(port), NGN_CAT_NEW_ATTEMPTS_ENABLED: 'false', CAT_STAGE_TIMING: 'false' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      children.push(child);
      let output = '';
      child.stderr.on('data', d => { output = (output + d).slice(-4000); });
      child.stdout.on('data', () => {});
      const endpoint = `http://127.0.0.1:${port}`;
      logs.set(endpoint, () => output);
      for (let i = 0; i < 200; i++) {
        if (child.exitCode !== null) throw new Error(output);
        try { await fetch(endpoint, { method: 'OPTIONS' }); return endpoint; }
        catch (error) { if (!(error instanceof TypeError)) throw error; }
        await delay(100);
      }
      throw new Error(`Deno server not ready: ${output}`);
    }
    const baseline = spawnSync('git', ['show', '6f66c0d:supabase/functions/diagnostic-assessment/index.ts'], { cwd: root, encoding: 'utf8' });
    assert.equal(baseline.status, 0);
    const baselinePath = join(scratch, 'baseline.ts');
    writeFileSync(baselinePath, baseline.stdout);
    const baselineUrl = await startServer(baselinePath);
    const candidateUrl = await startServer(join(root, 'supabase/functions/diagnostic-assessment/index.ts'));
    async function call(endpoint, body, jwt = studentToken) {
      const started = performance.now();
      const response = await fetch(endpoint, { method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Origin: 'https://portal.studywithmadison.com' },
        body: JSON.stringify(body) });
      if (response.status === 500) console.error('LOCAL_SYNTHETIC_SERVER_ERROR', logs.get(endpoint)());
      return { status: response.status, data: await response.json(), ms: performance.now() - started,
        timing: response.headers.get('Server-Timing') };
    }
    await t.test('admin-only inventory and direct table denial use real JWT authorization', async () => {
      assert.equal((await call(candidateUrl, { action: 'traditional-inventory' }, 'invalid')).status, 401);
      const student = await call(candidateUrl, { action: 'traditional-inventory' });
      assert.equal(student.status, 403);
      assert.ok(!JSON.stringify(student.data).includes('Synthetic rationale'));
      const admin = await call(candidateUrl, { action: 'traditional-inventory' }, adminToken);
      assert.equal(admin.status, 200, JSON.stringify(admin));
      assert.equal(admin.data.summary.selectableEntries, 200);
      const direct = await fetch(`${restOrigin}/in_house_diagnostic_item_keys`, { headers: { Authorization: `Bearer ${adminToken}` } });
      assert.equal(direct.status, 403);
    });
    await t.test('ownership, stable save/resume, atomic concurrent save and replay rejection', async () => {
      const start = await call(candidateUrl, { action: 'start', mode: 'practice', sessionKey: randomUUID(), profile: { qCount: 4 } });
      assert.equal(start.status, 200, JSON.stringify(start));
      const id = start.data.attempt.id, current = start.data.currentItemId;
      const answer = current.split('-')[1] % 2 === 0 ? 0 : [0, 1];
      const body = { action: 'answer', attemptId: id, expectedRevision: 0, itemId: current, answer };
      assert.equal((await call(candidateUrl, body, token(uid(12)))).status, 404);
      const result = await Promise.all([call(candidateUrl, body), call(candidateUrl, body)]);
      assert.deepEqual(result.map(r => r.status).sort(), [200, 409]);
      const resumed = await call(candidateUrl, { action: 'resume', assessmentKey: 'diagnostic-practice' });
      assert.equal(resumed.data.attempt.total_questions, 1);
      assert.equal(resumed.data.currentItemId, result.find(r => r.status === 200).data.nextItemId);
      assert.equal((await call(candidateUrl, body)).status, 409);
      sql(`UPDATE in_house_assessment_attempts SET status='abandoned' WHERE id='${id}';`);
    });
    await t.test('prior history is student-scoped, avoids case parents, and stays private on resume', async () => {
      const prior = randomUUID(), other = randomUUID();
      sql(`INSERT INTO in_house_diagnostic_item_keys
        (bank_scope,item_id,item_source,selectable,item_type,difficulty,parent_item_id,core_tags,correct_response,rationale)
        VALUES ('diagnostic','synthetic-199:child','local-synthetic',false,'mcq',2,'synthetic-199','[]','[0]','{}');
        INSERT INTO in_house_assessment_attempts (id,student_id,status) VALUES
        ('${prior}','${uid(1)}','completed'),('${other}','${uid(2)}','completed');
        INSERT INTO in_house_assessment_item_responses(attempt_id,item_id)
        SELECT '${prior}', 'synthetic-'||i FROM generate_series(1,198) i;
        INSERT INTO in_house_assessment_item_responses(attempt_id,item_id) VALUES
        ('${prior}','synthetic-199:child'),('${other}','synthetic-200');`);
      const start = await call(candidateUrl, { action: 'start', mode: 'practice', sessionKey: randomUUID(), profile: { qCount: 4 } });
      assert.equal(start.status, 200, JSON.stringify(start));
      assert.equal(start.data.currentItemId, 'synthetic-200', 'only unseen parent for this student');
      assert.ok(!JSON.stringify(start.data).includes('selectionHistory'));
      const resume = await call(candidateUrl, { action: 'resume', assessmentKey: 'diagnostic-practice' });
      assert.equal(resume.data.currentItemId, 'synthetic-200');
      assert.ok(!JSON.stringify(resume.data).includes('selectionHistory'));
      sql(`DELETE FROM in_house_assessment_item_responses;
        UPDATE in_house_assessment_attempts SET status='abandoned' WHERE status='in_progress';`);
    });
    const reports = [];
    for (const latency of [0, 30]) {
      hopDelay = latency;
      for (const [name, endpoint] of [['baseline', baselineUrl], ['candidate', candidateUrl]]) {
        const start = await call(endpoint, { action: 'start', mode: 'practice', sessionKey: randomUUID(), profile: { qCount: 40 } });
        assert.equal(start.status, 200, JSON.stringify(start));
        let current = start.data.currentItemId, revision = 0;
        const samples = [], stages = {};
        for (let i = 0; i < 30; i++) {
          const answer = current.split('-')[1] % 2 === 0 ? 0 : [0, 1];
          const result = await call(endpoint, { action: 'answer', attemptId: start.data.attempt.id,
            expectedRevision: revision, itemId: current, answer });
          assert.equal(result.status, 200, JSON.stringify(result));
          assert.equal(result.data.responses.length, i + 1);
          assert.equal(result.data.responses.at(-1).is_correct, true);
          assert.ok(result.timing);
          for (const m of result.timing.matchAll(/([\w-]+);dur=([\d.]+)/g)) (stages[m[1]] ||= []).push(+m[2]);
          samples.push(result.ms); revision = result.data.checkpointRevision; current = result.data.nextItemId;
        }
        reports.push({ name, injectedPerHopMs: latency, ...summary(samples),
          stages: Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, summary(v)])) });
        sql(`UPDATE in_house_assessment_attempts SET status='abandoned' WHERE id='${start.data.attempt.id}';`);
      }
    }
    console.log('CAT_PHASE1_LOCAL_BENCHMARK ' + JSON.stringify(reports));
  } finally {
    for (const child of children) {
      if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); }
    }
    if (gateway) await new Promise(resolve => gateway.close(resolve));
    if (api) docker(['stop', apiName]);
    if (database) docker(['stop', dbName]);
    if (network) docker(['network', 'rm', suffix]);
    rmSync(scratch, { recursive: true });
  }
});
