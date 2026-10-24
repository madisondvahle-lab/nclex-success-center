const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const test = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const html = readFileSync(join(root, 'madison-admin.html'), 'utf8');
const functionSource = stripTypeScriptTypes(
  readFileSync(join(root, 'supabase/functions/create-student-login/index.ts'), 'utf8')
    .replace(/^import .*;\n/, '')
);

async function request(payload = { student_id: 'student', activate: true }, options = {}) {
  const student = {
    id: 'student', name: 'Test Student', email: 'student@example.test',
    auth_user_id: null, archived_at: null, portal_invite_sent_at: null,
    ...options.student
  };
  const calls = { updates: [], creates: [], deletes: [], emails: [], queries: [] };
  let handler;
  function query(table) {
    const entry = { table, patch: null, filters: [] };
    calls.queries.push(entry);
    const q = {
      select() { return q; },
      update(patch) { entry.patch = patch; calls.updates.push(entry); return q; },
      eq(key, value) { entry.filters.push([key, value]); return q; },
      is(key, value) { entry.filters.push([key, value]); return q; },
      async maybeSingle() {
        if (table === 'app_admins') return { data: options.notAdmin ? null : { user_id: 'admin' } };
        if (!entry.patch) return { data: options.missingStudent ? null : student };
        if (entry.patch.portal_invite_sent_at && options.recordFailure) return { error: { message: 'record failed' } };
        if (options.linkFailure && entry.patch.auth_user_id) return { data: null, error: null };
        return { data: { id: student.id } };
      }
    };
    return q;
  }
  const admin = {
    from: query,
    auth: { admin: {
      async createUser(input) {
        calls.creates.push(input);
        return options.createFailure ? { error: { message: 'Email already registered' } } : { data: { user: { id: 'new-auth' } } };
      },
      async deleteUser(id) {
        calls.deletes.push(id);
        return { error: options.cleanupFailure ? { message: 'cleanup failed' } : null };
      }
    } }
  };
  const env = {
    SUPABASE_URL: 'https://supabase.example.test', SUPABASE_ANON_KEY: 'public',
    SUPABASE_SERVICE_ROLE_KEY: 'private-test-key', RESEND_API_KEY: options.noEmailConfig ? '' : 'email-test-key'
  };
  vm.runInNewContext(functionSource, {
    createClient: (_url, key) => key === 'public' ? {
      auth: { getUser: async () => ({ data: { user: options.unauthorized ? null : { id: 'admin' } } }) }
    } : admin,
    Deno: { env: { get: name => env[name] }, serve: callback => { handler = callback; } },
    Response, Request, crypto,
    console: { error() {} },
    fetch: async (_url, input) => {
      calls.emails.push(JSON.parse(input.body));
      if (options.emailThrows) throw new Error('Network error');
      return { ok: !options.emailRejected, status: options.emailRejected ? 503 : 200 };
    }
  });
  const response = await handler(new Request('https://function.example.test', {
    method: 'POST', headers: options.noAuthorization ? {} : { Authorization: 'Bearer test-admin' },
    body: JSON.stringify(payload)
  }));
  return { status: response.status, body: await response.json(), calls };
}

test('combined activation creates one login, atomically links and activates, and records accepted invitation', async () => {
  const { status, body, calls } = await request();
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.activated, true);
  assert.equal(body.emailed, true);
  assert.ok(Date.parse(body.portal_invite_sent_at));
  assert.equal(body.temporary_password, undefined);
  assert.equal(calls.creates.length, 1);
  assert.ok(calls.creates[0].password.length >= 40);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.updates[0].patch)), {
    auth_user_id: 'new-auth', status: 'active', portal_stage: 'active'
  });
  assert.ok(calls.updates[0].filters.some(([k, v]) => k === 'auth_user_id' && v === null));
  assert.ok(calls.updates[0].filters.some(([k, v]) => k === 'archived_at' && v === null));
  assert.equal(calls.emails.length, 1);
  assert.deepEqual(calls.emails[0].to, ['student@example.test']);
});

test('existing login is reused without creating a user, changing password, or sending another invitation', async () => {
  const { body, calls } = await request(undefined, {
    student: { auth_user_id: 'existing', portal_invite_sent_at: '2026-10-01T00:00:00Z' }, noEmailConfig: true
  });
  assert.equal(body.reused_login, true);
  assert.equal(body.portal_invite_sent_at, '2026-10-01T00:00:00Z');
  assert.equal(body.emailed, false);
  assert.equal(calls.creates.length, 0);
  assert.equal(calls.emails.length, 0);
  assert.deepEqual(Object.keys(calls.updates[0].patch).sort(), ['portal_stage', 'status']);
  assert.ok(calls.updates[0].filters.some(([k, v]) => k === 'auth_user_id' && v === 'existing'));
});

for (const [name, options, status] of [
  ['missing authorization', { noAuthorization: true }, 401],
  ['expired session', { unauthorized: true }, 401],
  ['non-admin caller', { notAdmin: true }, 403],
  ['missing profile', { missingStudent: true }, 404],
  ['archived profile', { student: { archived_at: '2026-10-01' } }, 409],
  ['missing email', { student: { email: null } }, 400],
  ['missing email configuration', { noEmailConfig: true }, 503]
]) {
  test(`${name} stops activation before any student or account changes`, async () => {
    const r = await request(undefined, options);
    assert.equal(r.status, status);
    assert.ok(r.body.error);
    assert.equal(r.calls.creates.length, 0);
    assert.equal(r.calls.updates.length, 0);
  });
}

test('existing unlinked email account is not overwritten or reset', async () => {
  const r = await request(undefined, { createFailure: true });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /already registered/);
  assert.equal(r.calls.updates.length, 0);
  assert.equal(r.calls.emails.length, 0);
});

test('lost link race cleans up only the new account and sends no invitation', async () => {
  const r = await request(undefined, { linkFailure: true });
  assert.equal(r.status, 409);
  assert.deepEqual(r.calls.deletes, ['new-auth']);
  assert.equal(r.calls.emails.length, 0);
});

test('cleanup failures are explicit and do not claim account creation was undone', async () => {
  const r = await request(undefined, { linkFailure: true, cleanupFailure: true });
  assert.equal(r.status, 500);
  assert.match(r.body.error, /could not be linked or cleaned up/);
});

for (const options of [{ emailRejected: true }, { emailThrows: true }]) {
  test(`email ${options.emailRejected ? 'rejection' : 'network failure'} preserves login and reports unfinished invitation`, async () => {
    const r = await request(undefined, options);
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.emailed, false);
    assert.ok(r.body.invitation_error);
    assert.equal(r.body.portal_invite_sent_at, null);
    assert.equal(r.body.temporary_password, r.calls.creates[0].password);
    assert.equal(r.calls.updates.length, 1);
    assert.equal(r.calls.deletes.length, 0);
  });
}

test('accepted email with failed timestamp write is reported without falsely recording sent status', async () => {
  const r = await request(undefined, { recordFailure: true });
  assert.equal(r.body.emailed, true);
  assert.equal(r.body.portal_invite_sent_at, null);
  assert.match(r.body.invitation_error, /timestamp could not be saved/);
});

test('standalone diagnostic login keeps existing stage and lifecycle unchanged', async () => {
  const r = await request({ student_id: 'student', password: 'test-password', send_email: true });
  assert.equal(r.body.ok, true);
  assert.deepEqual(Object.keys(r.calls.updates[0].patch), ['auth_user_id']);
  assert.equal(r.body.activated, false);
});

test('standalone creation still refuses an already-linked account', async () => {
  const r = await request({ student_id: 'student', password: 'test-password' }, { student: { auth_user_id: 'existing' } });
  assert.equal(r.status, 409);
  assert.equal(r.calls.updates.length, 0);
});

function ui(options = {}) {
  const elements = new Map();
  const calls = { invoked: [], refreshed: 0, reads: 0 };
  const source = html.slice(html.indexOf('const activatingStudents='), html.indexOf('async function loadCatCheckin('));
  const context = {
    $: id => {
      if (!elements.has(id)) elements.set(id, { textContent: '' });
      return elements.get(id);
    },
    window: { confirm: () => options.confirm !== false },
    showInviteDetails(_email, _password, id) { context.$(id).firstChild = { textContent: '' }; },
    loadProspectData: async () => { calls.refreshed++; },
    loadRoster: async () => { calls.refreshed++; },
    loadDashboardData: async () => { calls.refreshed++; },
    db: {
      from(table) {
        assert.equal(table, 'students');
        return { select: () => ({ eq: () => ({ single: async () => {
          calls.reads++;
          return calls.reads === 1
            ? { data: { id: 'student', email: 'student@example.test', name: 'Test', auth_user_id: options.existing ? 'auth' : null } }
            : { data: { id: 'student', status: 'active', portal_stage: options.incomplete ? 'assessment' : 'active', auth_user_id: 'auth' } };
        } }) }) };
      },
      functions: { invoke: async (name, input) => {
        calls.invoked.push({ name, input });
        if(options.waitForInvocation)await options.waitForInvocation;
        if (options.error) return { error: { message: options.error } };
        return { data: { ok: true, emailed: true, reused_login: options.existing, ...options.response } };
      } }
    }
  };
  vm.runInNewContext(source, context);
  return { context, elements, calls };
}

test('activation UI calls only the combined service and verifies all readiness fields', async () => {
  const { context, calls } = ui();
  const button = {};
  await context.activateStudent('student', button);
  assert.equal(calls.invoked.length, 1);
  assert.equal(calls.invoked[0].name, 'create-student-login');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.invoked[0].input.body)), {
    student_id: 'student', activate: true, send_email: true
  });
  assert.equal(calls.reads, 2);
  assert.equal(calls.refreshed, 3);
  assert.equal(button.disabled, false);
  assert.match(context.$('activation-status').textContent, /Receipt and first sign-in are not verified/);
});

test('cancelled activation makes no changes', async () => {
  const { context, calls } = ui({ confirm: false });
  await context.activateStudent('student', {});
  assert.equal(calls.invoked.length, 0);
});

test('repeated clicks during activation do not create duplicate requests', async () => {
  let finish;
  const waitForInvocation = new Promise(resolve => { finish = resolve; });
  const { context, calls } = ui({ waitForInvocation });
  const first = context.activateStudent('student', {});
  await context.activateStudent('student', {});
  finish();
  await first;
  assert.equal(calls.invoked.length, 1);
});

test('existing-login activation UI explicitly confirms no new invitation', async () => {
  const { context } = ui({ existing: true });
  await context.activateStudent('student', {});
  assert.match(context.$('activation-status').textContent, /Existing login preserved. No new invitation sent/);
});

test('activation errors and incomplete verification are not shown as success', async () => {
  for (const options of [{ error: 'Email already registered' }, { incomplete: true }]) {
    const { context, calls } = ui(options);
    const button = {};
    await context.activateStudent('student', button);
    assert.match(context.$('activation-status').textContent, /needs attention/);
    assert.equal(calls.refreshed, 0);
    assert.equal(button.disabled, false);
  }
});

test('email failure UI retains private-copy details and explicit pending step', async () => {
  const { context } = ui({ response: { emailed: false, temporary_password: 'private-test', invitation_error: 'Invitation rejected.' } });
  await context.activateStudent('student', {});
  assert.match(context.$('activation-status').firstChild.textContent, /Invitation rejected/);
});

test('directory distinguishes lifecycle, access, login, invitation, and unverified sign-in', () => {
  const source = html.slice(html.indexOf('function studentRow('), html.indexOf('function bindLifecycleControls('));
  const context = {
    esc: String, lifecycle: () => 'Active', statusClass: () => 'active', lifecycleAvailable: true,
    activityLabel: () => '', branch: () => '', stage: () => '', prospectDate: () => 'Oct 23', archiveDate: () => ''
  };
  vm.runInNewContext(source, context);
  const missing = context.studentRow({ id: 's', name: 'Test', email: 'test@example.test', status: 'active', portal_stage: 'assessment' }, false);
  assert.match(missing, /Portal access: Assessment only/);
  assert.match(missing, /Login: Not created/);
  assert.match(missing, /Invitation: Not recorded/);
  assert.match(missing, /Student sign-in: not verified here/);
  assert.match(missing, /data-activate-student="s"/);
  const ready = context.studentRow({ id: 's', auth_user_id: 'auth', portal_stage: 'active', portal_invite_sent_at: '2026-10-23' }, false);
  assert.match(ready, /Login: Ready/);
  assert.match(ready, /Invitation: Sent Oct 23 \(provider accepted\)/);
  assert.doesNotMatch(ready, /data-create-student-login/);
  assert.doesNotMatch(context.studentRow({ id: 's' }, true), /data-activate-student/);
});

test('invitation migration is additive and does not invent historical delivery records', () => {
  const migration = readFileSync(join(root, 'supabase-student-invitation-status-migration.sql'), 'utf8');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS portal_invite_sent_at timestamptz/);
  assert.doesNotMatch(migration, /UPDATE public\.students|DEFAULT|DROP |POLICY|GRANT /);
});
