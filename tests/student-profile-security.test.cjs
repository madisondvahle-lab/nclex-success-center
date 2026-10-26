const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => readFileSync(join(__dirname, '..', file), 'utf8');
const html = read('student-dashboard.html');
const migration = read('supabase-student-profile-update-security.sql');

function onboarding(options = {}) {
  const elements = new Map();
  const calls = { rpc: [], resources: [], seen: [], reload: 0 };
  const context = {
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        value: '', hidden: false, textContent: '', disabled: false,
        classList: { add() {} }
      });
      return elements.get(id);
    } },
    _student: { id: 'isolated-student' }, _obFile: null, OB_KEY: 'ob_seen_',
    localStorage: { setItem: (...args) => calls.seen.push(args) },
    window: { location: { reload: () => calls.reload++ } },
    db: {
      async rpc(name, params) {
        calls.rpc.push({ name, params });
        if (options.throws) throw new Error(options.throws);
        return { error: options.error ? { message: options.error } : null };
      },
      from(table) {
        assert.equal(table, 'student_resources', 'no direct student profile write');
        return { async insert(value) { calls.resources.push(value); return { error: null }; } };
      }
    }
  };
  vm.runInNewContext(html.slice(html.indexOf('    async function finishOnboarding('),
    html.indexOf("    document.getElementById('ob-next-0')")), context);
  context.document.getElementById('ob-course').value = options.course ?? 'NUR 312';
  context.document.getElementById('ob-exam-date').value = options.date ?? '2099-03-15';
  context.document.getElementById('ob-topics').value = options.topics ?? '';
  return { context, calls, element: id => context.document.getElementById(id) };
}

test('onboarding uses only the own-profile RPC, then completes setup', async () => {
  const { context, calls } = onboarding();
  await context.finishOnboarding(true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.rpc)), [{
    name: 'update_my_student_profile',
    params: { profile_patch: { course_name: 'NUR 312', exam_date: '2099-03-15' } }
  }]);
  assert.equal(calls.seen.length, 1);
  assert.equal(calls.reload, 1);
});

test('onboarding preserves optional omitted fields and exam-topic resource workflow', async () => {
  const { context, calls } = onboarding({ course: '', topics: 'Synthetic topics' });
  await context.finishOnboarding(true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.rpc[0].params)), {
    profile_patch: { exam_date: '2099-03-15' }
  });
  assert.equal(calls.resources.length, 1);
  assert.equal(calls.resources[0].resource_type, 'exam_topic');
});

for (const options of [{ error: 'Migration not installed' }, { throws: 'Network unavailable' }]) {
  test(`profile save failure (${options.error || options.throws}) leaves onboarding open for retry`, async () => {
    const { context, calls, element } = onboarding({ ...options, topics: 'Do not save yet' });
    await context.finishOnboarding(true);
    assert.equal(calls.seen.length, 0);
    assert.equal(calls.reload, 0);
    assert.equal(calls.resources.length, 0);
    assert.equal(element('ob-save-message').hidden, false);
    assert.match(element('ob-save-message').textContent, /profile could not be saved/);
    assert.equal(element('ob-finish').disabled, false);
  });
}

test('empty setup does not make a profile mutation request', async () => {
  const { context, calls } = onboarding({ course: '', date: '' });
  await context.finishOnboarding(true);
  assert.equal(calls.rpc.length, 0);
  assert.equal(calls.reload, 1);
});

test('migration removes public update and guards direct updates independently of permissive policies', () => {
  assert.match(migration, /DROP POLICY IF EXISTS allow_anon_update_students/);
  assert.match(migration, /AS RESTRICTIVE FOR UPDATE TO authenticated/);
  assert.match(migration, /USING \(public\.is_app_admin\(\)\) WITH CHECK \(public\.is_app_admin\(\)\)/);
  assert.match(migration, /WHERE auth_user_id = auth\.uid\(\) AND archived_at IS NULL/);
  assert.match(migration, /key NOT IN \('course_name', 'exam_date'\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.update_my_student_profile\(jsonb\) FROM PUBLIC, anon/);
  assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY|DELETE FROM|SET (?:status|portal_stage|student_type)\s*=/);
});

test('dashboard scripts remain valid and NCLEX calendar still calls its narrow RPC', () => {
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  assert.match(html, /db\.rpc\('update_my_nclex_target_date'/);
  assert.match(html, /id="ob-save-message" role="alert"/);
  assert.doesNotMatch(html, /from\('students'\)\.update\(/);
});
