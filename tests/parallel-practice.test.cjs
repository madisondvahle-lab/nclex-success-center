const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const root = join(__dirname, '..');
const html = readFileSync(join(root, 'nur312-exam2-parallel.html'), 'utf8');
const helper = readFileSync(join(root, 'course-practice-persistence.js'), 'utf8');

test('course persistence uses the fixed-course RPC contract, not the diagnostic Edge Function', async () => {
  const calls = [], context = { window: {} };
  vm.runInNewContext(helper, context);
  const api = context.window.NCLEX_COURSE_PRACTICE;
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: {} } } }) },
    rpc: async (name, args) => { calls.push({ name, args }); return { data: { id: 'attempt', checkpoint_revision: 0 } }; }
  };
  await api.createAttempt({ supabase, sessionKey: 'session' });
  await api.recordResponse({ supabase, attemptId: 'attempt', expectedRevision: 2, itemId: 'item', displayAnswer: 3 });
  await api.finalizeAttempt({ supabase, attemptId: 'attempt' });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.name === 'save_nur312_parallel_practice'));
  assert.equal(calls[0].args.p_action, 'start-mcq-order-v1');
  assert.equal(calls[1].args.p_action, 'answer-mcq-order-v1');
  assert.equal(calls[1].args.p_answer, 3);
  assert.equal(calls[1].args.p_expected_revision, 2);
  assert.equal(calls[2].args.p_action, 'finish');
  assert.doesNotMatch(html, /NCLEX_ASSESSMENT_PERSISTENCE|src="assessment-persistence.js"/);
});

test('course persistence reports expired sessions and database errors', async () => {
  const context = { window: {} };
  vm.runInNewContext(helper, context);
  const api = context.window.NCLEX_COURSE_PRACTICE;
  await assert.rejects(api.createAttempt({
    sessionKey: 's', supabase: { auth: { getSession: async () => ({ data: { session: null } }) } }
  }), /Sign in again/);
  await assert.rejects(api.createAttempt({
    sessionKey: 's', supabase: {
      auth: { getSession: async () => ({ data: { session: {} } }) },
      rpc: async () => ({ error: { message: 'Assignment missing' } })
    }
  }), /Assignment missing/);
});

test('generated server keys match the unchanged course bank exactly', () => {
  const bank = JSON.parse(readFileSync(join(root, 'nur312-exam2-parallel-question-bank.json'), 'utf8'));
  const sql = readFileSync(join(root, 'supabase-nur312-parallel-persistence.sql'), 'utf8');
  const keys = JSON.parse(sql.match(/\$bank\$([\s\S]*?)\$bank\$/)[1]);
  assert.equal(keys.length, 116);
  assert.deepEqual(keys, bank.map(({ id, source, a, difficulty, topic }) => ({ id, source, a, difficulty, topic })));
  assert.doesNotMatch(sql, /GRANT.*(?:create_in_house|record_in_house|finalize_in_house)/i);
});

test('parallel persistence stores mapped options and resumes from the server checkpoint', () => {
  const sql = readFileSync(join(root, 'supabase-nur312-parallel-persistence.sql'), 'utf8');
  assert.match(sql, /start-mcq-order-v1/);
  assert.match(sql, /answer-mcq-order-v1/);
  assert.match(sql, /presentationOrders/);
  assert.match(sql, /selected_answer',v_canonical_answer/);
  assert.match(sql, /'responses',v_responses/);
  assert.match(sql, /status='in_progress'/);
  assert.match(html, /sessionStorageKey="nclex:nur312-exam2-parallel:session"/);
  assert.match(html, /displayAnswer/);
  assert.match(html, /Saved answer ordering is invalid/);
  assert.match(html, /can be resumed in this browser tab/);
});

function player() {
  const elements = new Map();
  const element = () => ({
    textContent: '', className: '', innerHTML: '', disabled: false, style: {},
    classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, querySelectorAll: () => []
  });
  const context = {
    window: {}, globalThis: { crypto: { randomUUID: () => 'session' } },
    document: { getElementById: id => {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }, createElement: element }
  };
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInNewContext(script.slice(0, script.indexOf('async function init()')), context);
  vm.runInNewContext(`Q=[{id:'item',a:0,type:'Fixture',o:['A','B','C','D'],q:'Fixture',r:'Fixture'}];responses[0]={order:[0,1,2,3],selected:0};selected=0;persistence.attempt={id:'attempt'};`, context);
  return { context, elements, state: () => vm.runInNewContext('({score,answered,saving,revision:persistence.revision,response:responses[0]})', context) };
}

test('failed response saves retain the selection and allow retry without double scoring', async () => {
  const h = player();
  h.context.NCLEX_COURSE_PRACTICE = { recordResponse: async () => { throw new Error('Offline'); } };
  await h.elements.get('submit').onclick();
  assert.equal(h.state().score, 0);
  assert.equal(h.state().response.answered, undefined);
  assert.equal(h.state().response.selected, 0);
  assert.match(h.elements.get('saveStatus').textContent, /Click Check answer to retry/);
  h.context.NCLEX_COURSE_PRACTICE.recordResponse = async () => ({ checkpointRevision: 1 });
  await h.elements.get('submit').onclick();
  assert.equal(h.state().score, 1);
  assert.equal(h.state().response.answered, true);
  assert.equal(h.state().revision, 1);
});

test('in-flight saves block navigation and double submissions', async () => {
  const h = player();
  let release, count = 0;
  h.context.NCLEX_COURSE_PRACTICE = {
    recordResponse: () => { count++; return new Promise(resolve => { release = resolve; }); }
  };
  const pending = h.elements.get('submit').onclick();
  await h.elements.get('submit').onclick();
  h.elements.get('next').onclick();
  assert.equal(count, 1);
  release({ checkpointRevision: 1 });
  await pending;
  assert.equal(h.state().score, 1);
});

test('failed completion stays on the question and can be retried', async () => {
  const h = player();
  let failed = true;
  h.context.NCLEX_COURSE_PRACTICE = { finalizeAttempt: async () => { if (failed) throw new Error('Offline'); } };
  await h.context.showResults();
  assert.match(h.elements.get('saveStatus').textContent, /Click See results to retry/);
  assert.equal(h.elements.get('next').disabled, false);
  failed = false;
  await h.context.showResults();
  assert.match(h.elements.get('saveStatus').textContent, /completed result was saved/);
});

test('parallel page inline JavaScript parses', () => {
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
