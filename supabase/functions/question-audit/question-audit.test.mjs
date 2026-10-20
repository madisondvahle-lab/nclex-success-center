import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('npm:@supabase/')) {
    return { url: 'data:text/javascript,' + encodeURIComponent('export const createClient = (...args) => globalThis.__createClient(...args);'), shortCircuit: true };
  }
  return next(specifier, context);
}`));

const env = { SUPABASE_URL: 'http://db', SUPABASE_ANON_KEY: 'k', OPENAI_API_KEY: 'test-key' };
let handler;
globalThis.Deno = { env: { get: key => env[key] }, serve: fn => { handler = fn; } };

const tables = {};
let isAdmin = true;
const matches = (row, filters) => filters.every(f => (f.op === 'eq' ? row[f.col] === f.val : f.op === 'neq' ? row[f.col] !== f.val : f.vals.includes(row[f.col])));
globalThis.__createClient = () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } }, error: null }) },
  rpc: async () => ({ data: isAdmin, error: null }),
  from: table => {
    const state = { filters: [], op: 'select', row: null };
    const builder = {
      select: () => builder,
      insert: row => { state.op = 'insert'; state.row = row; return builder; },
      update: row => { state.op = 'update'; state.row = row; return builder; },
      order: () => builder,
      limit: () => builder,
      eq: (col, val) => { state.filters.push({ op: 'eq', col, val }); return builder; },
      neq: (col, val) => { state.filters.push({ op: 'neq', col, val }); return builder; },
      in: (col, vals) => { state.filters.push({ op: 'in', col, vals }); return builder; },
      maybeSingle: async () => ({ data: (tables[table] || []).find(r => matches(r, state.filters)) ?? null, error: null }),
      single: async () => {
        if (state.op === 'update') {
          const row = (tables[table] || []).find(r => matches(r, state.filters));
          if (!row) return { data: null, error: { message: 'Audit changed during retry.' } };
          Object.assign(row, state.row);
          return { data: row, error: null };
        }
        if (state.op === 'insert') {
          const row = { id: `${table}-${(tables[table] ||= []).length + 1}`, ...state.row };
          if (table === 'question_audits' && tables[table].some(r => r.question_id === row.question_id && r.content_hash === row.content_hash && r.audit_status !== 'error' && row.audit_status !== 'error')) {
            return { data: null, error: { code: '23505', message: 'duplicate' } };
          }
          tables[table].push(row);
          return { data: row, error: null };
        }
        return { data: (tables[table] || []).find(r => matches(r, state.filters)) ?? null, error: null };
      },
    };
    return builder;
  },
});

await import('./index.ts');

const QID = '11111111-1111-1111-1111-111111111111';
const question = (overrides = {}) => ({
  id: QID, stem: 'A client receiving heparin has new epistaxis and bruising. Which action should the nurse take first?',
  option_a: 'Review the most recent aPTT result', option_b: 'Apply ice to the forehead', option_c: 'Increase the infusion rate', option_d: 'Encourage fluids',
  correct_answer: 'a', rationale: 'Bleeding on heparin requires checking coagulation status before any rate decision is made, so the aPTT is reviewed first.',
  module_key: null, nclex_category: 'Pharmacological Therapies', nclex_sub: null, topic: 'Anticoagulants', difficulty: 'easy', is_ngn: false, item_type: 'mcq',
  item_data: null, clinical_judgment_skill: 'Analyze cues', option_rationales: { a: 'a', b: 'b', c: 'c', d: 'd' }, reference_list: [], ...overrides,
});
const revision = (overrides = {}) => ({
  stem: 'A client receiving a heparin infusion reports nosebleeds and new bruising. Which action should the nurse take first?',
  options: ['Review the latest aPTT and notify the provider', 'Apply a cold pack to the nose bridge', 'Reduce the client\'s activity to bed rest', 'Administer the scheduled aspirin'],
  correct: [1], rationale: 'New bleeding on heparin may signal over-anticoagulation, so the nurse checks the aPTT and reports.',
  option_rationales: ['Correct.', 'Cold alone does not address systemic anticoagulation.', 'Rest does not address the cause.', 'Aspirin adds bleeding risk.'],
  difficulty: 'medium', clinical_judgment_skill: 'Analyze cues', answer_key_changed: false, clinical_uncertainty: false, change_summary: 'Strengthened distractors.', ...overrides,
});

function scriptAi(replies) {
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const reply = replies.shift();
    assert.ok(reply, `unexpected AI call to ${body.model}`);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }], usage: { prompt_tokens: 1000, completion_tokens: 500 } }), { status: 200 });
  };
  return calls;
}
const call = payload => handler(new Request('http://fn', { method: 'POST', headers: { Authorization: 'Bearer token' }, body: JSON.stringify(payload) }));
const reset = (q = question()) => { for (const key of Object.keys(tables)) delete tables[key]; tables.questions = [q]; tables.question_revision_drafts = []; tables.question_audits = []; isAdmin = true; };

test('rejects callers who are not app admins', async () => {
  reset(); isAdmin = false; scriptAi([]);
  assert.equal((await call({ question_id: QID })).status, 403);
});

test('PASS records an audit and spends only the screening call', async () => {
  reset(); const calls = scriptAi([{ classification: 'PASS', clinical_risk: 'low', issues: [] }]);
  const body = await (await call({ question_id: QID })).json();
  assert.equal(body.status, 'pass');
  assert.equal(calls.length, 1);
  assert.equal(tables.question_revision_drafts.length, 0);
  assert.equal(tables.question_audits.length, 1);
  assert.ok(body.cost_usd > 0);
});

test('repeating an unchanged question is served from the cache with no AI spend', async () => {
  reset(); scriptAi([{ classification: 'PASS', clinical_risk: 'low', issues: [] }]);
  await call({ question_id: QID });
  const calls = scriptAi([]);
  const body = await (await call({ question_id: QID })).json();
  assert.equal(body.status, 'cached');
  assert.equal(calls.length, 0);
});

test('an existing pending or approved draft is never touched or audited', async () => {
  reset(); tables.question_revision_drafts.push({ id: 'd1', question_id: QID, status: 'approved' });
  const calls = scriptAi([]);
  const body = await (await call({ question_id: QID })).json();
  assert.equal(body.status, 'skipped');
  assert.equal(calls.length, 0);
  assert.equal(tables.question_audits.length, 0);
});

test('MAJOR revision that the blind reviewer agrees with becomes a pending draft', async () => {
  reset();
  const calls = scriptAi([
    { classification: 'MAJOR', clinical_risk: 'medium', issues: [{ category: 'distractors', detail: 'Weak distractors.' }], revise_scope: ['options'] },
    revision(),
    { answer: [1], multiple_defensible: false, clinical_accuracy_concern: false, sufficient_information: true, entry_level_appropriate: true },
  ]);
  const body = await (await call({ question_id: QID, priority: 1, priority_reason: 'Open tutoring flag' })).json();
  assert.equal(body.status, 'revised', JSON.stringify(body.audit?.note ?? body));
  assert.equal(calls.length, 3);
  const verifierPrompt = JSON.stringify(calls[2].messages);
  assert.doesNotMatch(verifierPrompt, /Keyed correct|Main rationale|Rationale for option/);
  const [draft] = tables.question_revision_drafts;
  assert.equal(draft.status, 'pending_review');
  assert.equal(draft.proposed_by, 'admin-1');
  assert.deepEqual(draft.base_content.option_a, 'Review the most recent aPTT result');
  assert.equal(draft.proposed_content.correct_answer, 'a');
  assert.deepEqual(Object.keys(draft.proposed_content.option_rationales), ['a', 'b', 'c', 'd']);
  assert.equal(draft.proposed_content.item_data, null);
  assert.equal(tables.question_audits[0].revision_id, draft.id);
  assert.equal(tables.questions[0].correct_answer, 'a', 'live question is never modified');
});

test('a disagreeing reviewer triggers one retry, then quarantine without saving a draft', async () => {
  reset();
  const disagree = { answer: [1], multiple_defensible: true, clinical_accuracy_concern: false, sufficient_information: true, entry_level_appropriate: true };
  const calls = scriptAi([
    { classification: 'MAJOR', clinical_risk: 'high', issues: [], revise_scope: [] }, revision(), disagree, revision(), disagree,
  ]);
  const body = await (await call({ question_id: QID })).json();
  assert.equal(body.status, 'quarantine');
  assert.equal(calls.length, 5);
  assert.equal(tables.question_revision_drafts.length, 0);
  assert.equal(tables.question_audits[0].attempts, 2);
  assert.equal(tables.questions[0].active, undefined, 'eligibility is not changed automatically');
});

test('invalid scoring in a revision is caught before any verification spend', async () => {
  reset();
  const calls = scriptAi([
    { classification: 'MAJOR', clinical_risk: 'low', issues: [], revise_scope: [] },
    revision({ correct: [9] }), revision({ options: ['same', 'same', 'x', 'y'] }),
  ]);
  const body = await (await call({ question_id: QID })).json();
  assert.equal(body.status, 'quarantine');
  assert.equal(calls.filter(c => c.model === 'gpt-4o').length, 0);
});

test('PASS with stray whitespace creates a whitespace-only auto-fix draft', async () => {
  reset(question({ stem: '  A client receiving heparin has new epistaxis and  bruising. Which action should the nurse take first? ' }));
  scriptAi([{ classification: 'PASS', clinical_risk: 'low', issues: [] }]);
  const body = await (await call({ question_id: QID })).json();
  assert.equal(body.status, 'auto_fix');
  assert.equal(tables.question_revision_drafts[0].proposed_content.stem, 'A client receiving heparin has new epistaxis and bruising. Which action should the nurse take first?');
});

test('AI failures are recorded as retryable errors', async () => {
  reset();
  globalThis.fetch = async () => new Response('server down', { status: 500 });
  const body = await (await call({ question_id: QID })).json();
  assert.equal(body.status, 'error');
  assert.equal(tables.question_revision_drafts.length, 0);
});

test('exhausted API credits return a recorded actionable failure, not success', async () => {
  reset();
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response(JSON.stringify({ error: { type: 'insufficient_quota', code: 'credit_balance_exhausted' } }), { status: 429 });
  };
  const response = await call({ question_id: QID });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.status, 'error');
  assert.equal(body.error_code, 'ai_quota_exhausted');
  assert.equal(body.stop_batch, true);
  assert.match(body.audit.note, /credits are exhausted/);
  assert.equal(body.cost_usd, 0);
  assert.equal(requests, 1);
  assert.equal(tables.question_audits.length, 1);
  assert.equal(tables.question_revision_drafts.length, 0);
  assert.deepEqual(tables.questions, [question()]);
});

test('repeated failed retries update the same record and preserve the failure history', async () => {
  reset();
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'credit_balance_exhausted' } }), { status: 429 });
  await call({ question_id: QID });
  const originalId = tables.question_audits[0].id;
  await call({ question_id: QID });
  assert.equal(tables.question_audits.length, 1);
  assert.equal(tables.question_audits[0].id, originalId);
  assert.equal(tables.question_audits[0].findings.previous_errors.length, 1);
  assert.equal(tables.question_revision_drafts.length, 0);
});

test('a funded retry succeeds in place, then future attempts use the cache', async () => {
  reset();
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'credit_balance_exhausted' } }), { status: 429 });
  await call({ question_id: QID });
  const originalId = tables.question_audits[0].id;
  scriptAi([{ classification: 'PASS', clinical_risk: 'low', issues: [] }]);
  const response = await call({ question_id: QID });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'pass');
  assert.equal(tables.question_audits.length, 1);
  assert.equal(body.audit.id, originalId);
  assert.equal(body.audit.findings.previous_errors.length, 1);
  assert.equal(body.audit.note, null);
  assert.equal(body.audit.findings.failure, undefined);
  const calls = scriptAi([]);
  assert.equal((await (await call({ question_id: QID })).json()).status, 'cached');
  assert.equal(calls.length, 0);
  assert.deepEqual(tables.questions, [question()]);
});

test('a retry that creates a correction is skipped on repetition without another draft', async () => {
  reset();
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  await call({ question_id: QID });
  scriptAi([
    { classification: 'MAJOR', clinical_risk: 'medium', issues: [], revise_scope: ['options'] },
    revision(),
    { answer: [1], multiple_defensible: false, clinical_accuracy_concern: false, sufficient_information: true, entry_level_appropriate: true },
  ]);
  assert.equal((await (await call({ question_id: QID })).json()).status, 'revised');
  assert.equal(tables.question_audits.length, 1);
  assert.equal(tables.question_revision_drafts.length, 1);
  const calls = scriptAi([]);
  assert.equal((await (await call({ question_id: QID })).json()).status, 'skipped');
  assert.equal(calls.length, 0);
  assert.equal(tables.question_revision_drafts.length, 1);
});

test('invalid API configuration and rate limiting stop the batch with distinct errors', async () => {
  for (const [status, code] of [[401, 'ai_configuration'], [403, 'ai_configuration'], [429, 'ai_service_error']]) {
    reset();
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded' } }), { status });
    const body = await (await call({ question_id: QID })).json();
    assert.equal(body.error_code, code);
    assert.equal(body.stop_batch, true);
  }
});

test('a missing API key is an explicit configuration error without an AI call', async () => {
  reset();
  delete env.OPENAI_API_KEY;
  try {
    const calls = scriptAi([]);
    const body = await (await call({ question_id: QID })).json();
    assert.equal(body.error_code, 'ai_configuration');
    assert.equal(calls.length, 0);
  } finally {
    env.OPENAI_API_KEY = 'test-key';
  }
});

test('AI requests reserve prompt cost and limit completion tokens within the supplied budget', async () => {
  reset();
  const calls = scriptAi([{ classification: 'PASS', clinical_risk: 'low', issues: [] }]);
  await call({ question_id: QID, max_cost_usd: 0.01 });
  assert.equal(calls.length, 1);
  const request = calls[0];
  assert.ok(Number.isInteger(request.max_completion_tokens));
  assert.ok(request.max_completion_tokens >= 128);
  const bound = new TextEncoder().encode(JSON.stringify(request.messages)).length + 256;
  assert.ok((bound * 0.4 + request.max_completion_tokens * 1.6) / 1e6 <= 0.01);
});

test('SATA revisions keep item_data options and correct positions in sync', async () => {
  const sata = question({
    item_type: 'sata', is_ngn: true, option_a: null, option_b: null, option_c: null, option_d: null, correct_answer: null,
    item_data: { correct: [0, 2], options: ['One', 'Two', 'Three', 'Four', 'Five'] }, option_rationales: { 0: 'a', 1: 'b', 2: 'c', 3: 'd', 4: 'e' },
  });
  reset(sata);
  scriptAi([
    { classification: 'MINOR', clinical_risk: 'low', issues: [], revise_scope: ['options'] },
    { stem: sata.stem, options: ['One', 'Two b', 'Three', 'Four', 'Five', 'Six'], correct: [4, 2], rationale: 'Because of the pathophysiology involved here.', option_rationales: ['a', 'b', 'c', 'd', 'e', 'f'], difficulty: 'hard', clinical_judgment_skill: 'x', change_summary: 'Added an option.' },
    { answer: [2, 4], multiple_defensible: false, clinical_accuracy_concern: false, sufficient_information: true, entry_level_appropriate: true },
  ]);
  const body = await (await call({ question_id: QID })).json();
  assert.equal(body.status, 'revised', JSON.stringify(body.audit?.note ?? body));
  const proposed = tables.question_revision_drafts[0].proposed_content;
  assert.deepEqual(proposed.item_data, { correct: [1, 3], options: ['One', 'Two b', 'Three', 'Four', 'Five', 'Six'] });
  assert.deepEqual(Object.keys(proposed.option_rationales), ['0', '1', '2', '3', '4', '5']);
});
