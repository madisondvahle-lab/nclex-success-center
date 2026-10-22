import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { MODEL, registryEntry, selectCurrent, currentInteraction } from '../supabase/functions/_shared/diagnostic-ngn.mjs';
import { ngnEvidence, updateAbility, updateNGNAbility } from '../supabase/functions/_shared/diagnostic-assessment-engine.mjs';

const prompt = (id, type, fields) => ({ id, type, textFormat: 'plain', scoringVersion: 'ngn-v1', stem: 'Synthetic question', rationale: 'Synthetic rationale', ...fields });
const entry = {
  id: 'source', kind: 'case', schemaVersion: 1, textFormat: 'plain', scenario: 'Synthetic scenario',
  tabs: [{ id: 'notes', label: 'Notes', columns: ['Finding'], entries: [
    { at: '2026-10-21T08:00', cells: [{ id: 'finding-a', t: 'Synthetic finding' }] },
    { at: '2026-10-21T09:00', fromItem: 2, cells: [{ id: 'future', t: 'FUTURE MUST STAY PRIVATE' }] },
  ] }],
  items: [
    prompt('first', 'highlight', { chartSelections: true, segments: [{ id: 'finding-a', t: 'Synthetic finding', correct: true, rationale: 'PRIVATE FINDING KEY' }] }),
    prompt('second', 'cloze', { template: '{{0}} then {{1}}', dropdowns: [{ options: ['A', 'B'], correct: 0 }, { options: ['A', 'B'], correct: 1 }] }),
    prompt('third', 'matrix', { rows: ['R1', 'R2'], cols: ['A', 'B'], responseMode: 'single', correct: ['0:0', '1:1'] }),
  ],
};
const question = {
  id: '00000000-0000-4000-8000-000000000001', stem: 'Synthetic title', rationale: 'Synthetic rationale', active: true,
  source_key: 'qbank-bulk-fixture-authored', item_type: 'case', item_data: entry,
  difficulty: 'medium', nclex_category: 'Physiological Adaptation', topic: 'Synthetic topic',
};
const clone = v => structuredClone(v);
const state = { tables: {}, token: 'student-token', failCommit: false };
class Query {
  constructor(table) { this.table = table; this.filters = []; this.start = 0; this.end = Infinity; }
  select() { return this; }
  eq(key, value) { this.filters.push(row => {
    if (key === 'item_data->>schemaVersion') return String(row.item_data?.schemaVersion) === value;
    if (key === 'in_house_assessment_attempts.student_id') return state.tables.in_house_assessment_attempts.some(a => a.id === row.attempt_id && a.student_id === value);
    return row[key] === value;
  }); return this; }
  neq(key, value) { this.filters.push(row => row[key] !== value); return this; }
  in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
  like(key, pattern) { this.filters.push(row => row[key]?.startsWith(pattern.slice(0, -1))); return this; }
  order() { return this; }
  limit(n) { this.end = n - 1; return this; }
  range(a, b) { this.start = a; this.end = b; return this; }
  update(values) { this.values = values; return this; }
  insert(values) { this.inserted = values; return this; }
  async execute(single = false) {
    const rows = state.tables[this.table];
    assert.ok(rows, `Unexpected table ${this.table}`);
    let found;
    if (this.inserted) { const row = { id: `attempt-${rows.length + 1}`, ...clone(this.inserted) }; rows.push(row); found = [row]; }
    else {
      found = rows.filter(row => this.filters.every(filter => filter(row))).slice(this.start, this.end + 1);
      if (this.values) found.forEach(row => Object.assign(row, clone(this.values)));
    }
    return { data: clone(single ? found[0] || null : found), error: null };
  }
  maybeSingle() { return this.execute(true); }
  single() { return this.execute(true); }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
}
const service = {
  from: table => new Query(table),
  async rpc(name, args) {
    assert.equal(name, 'commit_in_house_diagnostic_answer');
    if (state.failCommit) return { data: null, error: new Error('Synthetic atomic commit failure') };
    const attempt = state.tables.in_house_assessment_attempts.find(a => a.id === args.p_attempt_id && a.checkpoint_revision === args.p_expected_revision && a.status === 'in_progress');
    if (!attempt) return { data: null, error: null };
    const rows = state.tables.in_house_assessment_item_responses;
    assert.ok(args.p_responses.every(row => !rows.some(r => r.attempt_id === attempt.id && r.item_id === row.item_id)));
    rows.push(...clone(args.p_responses).map((r, i) => ({ id: `${rows.length + i}`, ...r })));
    Object.assign(attempt, {
      checkpoint: clone(args.p_checkpoint), checkpoint_revision: args.p_expected_revision + 1,
      ability_estimate: args.p_ability_estimate, result: args.p_result, status: args.p_complete ? 'completed' : 'in_progress',
      total_questions: rows.filter(r => r.attempt_id === attempt.id).length,
      correct_questions: rows.filter(r => r.attempt_id === attempt.id && r.is_correct).length,
    });
    return { data: [{ checkpoint_revision: attempt.checkpoint_revision }], error: null };
  },
};
globalThis.__ngnTestCreateClient = (_url, key, options) => key === 'service' ? service : {
  auth: { getUser: async () => ({ data: { user: options?.global?.headers?.Authorization === 'Bearer student-token' ? { id: 'user' } : options?.global?.headers?.Authorization === 'Bearer admin-token' ? { id: 'admin' } : null }, error: null }) },
  rpc: async name => { assert.equal(name, 'is_app_admin'); return { data: options?.global?.headers?.Authorization === 'Bearer admin-token', error: null }; },
};
let enableNewAttempts = 'true';
globalThis.Deno = { env: { get: key => ({ SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
  NGN_CAT_NEW_ATTEMPTS_ENABLED: enableNewAttempts })[key] } };
let source = readFileSync(new URL('../supabase/functions/diagnostic-assessment/index.ts', import.meta.url), 'utf8');
source = source.replace("import { createClient } from 'npm:@supabase/supabase-js@2';", 'const createClient = globalThis.__ngnTestCreateClient;');
source = source.replaceAll(/from '(\.\.\/_shared\/[^']+)'/g, (_, path) => `from '${new URL(path, new URL('../supabase/functions/diagnostic-assessment/index.ts', import.meta.url)).href}'`);
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: 'transform' })).toString('base64')}`);
function reset() {
  enableNewAttempts = 'true';
  state.failCommit = false;
  state.tables = {
    students: [{ id: 'student', auth_user_id: 'user', portal_stage: 'active' }],
    questions: [clone(question)], question_import_reviews: [{ source_key: question.source_key, status: 'published' }],
    in_house_diagnostic_item_keys: [], in_house_assessment_attempts: [], in_house_assessment_item_responses: [],
  };
}
async function request(body, token = 'student-token', clientProtocol = 'ngn-cat-v1') {
  const response = await handler.fetch(new Request('https://example.test/assessment', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: 'https://portal.studywithmadison.com' }, body: JSON.stringify({ ...body, clientProtocol }),
  }));
  return { status: response.status, data: await response.json() };
}
test('legacy/cached clients never start a versioned attempt or receive reviewed NGN items', async () => {
  for (const protocol of [null, 'unknown-future-protocol']) {
    reset();
    state.tables.in_house_diagnostic_item_keys.push(traditionalKey('legacy-static'));
    const started = await request({ action: 'start', profile: { mode: 'mock' }, sessionKey: 'cached' }, 'student-token', protocol);
    assert.equal(started.status, 200);
    assert.equal(started.data.attempt.assessment_version, 'in-house-core-v1');
    assert.equal(started.data.currentItemId, 'legacy-static');
    assert.equal(started.data.currentItem, null);
    const answered = await request({ action: 'answer', attemptId: started.data.attempt.id, expectedRevision: 0,
      itemId: 'legacy-static', answer: 0 }, 'student-token', protocol);
    assert.equal(answered.status, 200);
    assert.equal(answered.data.completed, true);
    assert.equal(answered.data.responses[0].scoringModel, 'in-house-core-v1');
  }
});

test('missing or disabled activation creates only legacy attempts even for capable clients', async () => {
  for (const flag of [undefined, 'false', 'TRUE', '']) {
    reset();
    enableNewAttempts = flag;
    state.tables.in_house_diagnostic_item_keys.push(traditionalKey('legacy-static'));
    const started = await request({ action: 'start', mode: 'mock', sessionKey: 'disabled' });
    assert.equal(started.status, 200);
    assert.equal(started.data.attempt.assessment_version, 'in-house-core-v1');
    assert.equal(started.data.currentItemId, 'legacy-static');
  }
});

test('incompatible clients cannot resume, answer, checkpoint or abandon an existing NGN attempt', async () => {
  reset();
  const started = await request({ action: 'start', mode: 'mock', sessionKey: 'capable' });
  const attemptId = started.data.attempt.id;
  const before = clone(state.tables);
  for (const body of [
    { action: 'start', mode: 'mock', sessionKey: 'cached' },
    { action: 'resume', assessmentKey: 'diagnostic-mock' },
    { action: 'answer', attemptId, expectedRevision: 0, itemId: started.data.currentItemId, answer: ['finding-a'] },
    { action: 'checkpoint', attemptId, expectedRevision: 0, checkpoint: {} },
    { action: 'abandon', attemptId },
  ]) {
    const result = await request(body, 'student-token', null);
    assert.equal(result.status, 409);
    assert.match(result.data.error, /Refresh.*progress is unchanged/);
    assert.equal(result.data.currentItem, undefined);
    assert.deepEqual(state.tables, before);
  }
});

test('legacy abandon retains its existing idempotent and ownership behavior', async () => {
  reset();
  state.tables.in_house_diagnostic_item_keys.push(traditionalKey('legacy-static'));
  const started = await request({ action: 'start', mode: 'mock', sessionKey: 'legacy' }, 'student-token', null);
  const missing = await request({ action: 'abandon', attemptId: 'missing' }, 'student-token', null);
  assert.equal(missing.status, 200);
  assert.equal(missing.data.abandoned, false);
  for (const expected of [true, false]) {
    const result = await request({ action: 'abandon', attemptId: started.data.attempt.id }, 'student-token', null);
    assert.equal(result.status, 200);
    assert.equal(result.data.abandoned, expected);
  }
});

test('rollback activation switch stops new NGN attempts but existing cases still resume and complete unchanged', async () => {
  reset();
  const started = await request({ action: 'start', mode: 'mock', sessionKey: 'before-rollback' });
  enableNewAttempts = 'false';
  const resumed = await request({ action: 'resume', assessmentKey: 'diagnostic-mock' });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.data.attempt.assessment_version, MODEL);
  let id = resumed.data.currentItemId;
  const answers = [['finding-a'], [0, 0], ['0:0', '1:0']];
  let final;
  for (const [expectedRevision, answer] of answers.entries()) {
    final = await request({ action: 'answer', attemptId: started.data.attempt.id, expectedRevision, itemId: id, answer });
    assert.equal(final.status, 200);
    id = final.data.nextItemId;
  }
  assert.equal(final.data.completed, true);
  assert.deepEqual(final.data.responses.map(r => [r.credit.earned, r.credit.max]), [[1, 1], [1, 2], [1, 2]]);
  const history = clone(state.tables.in_house_assessment_item_responses);
  state.tables.in_house_diagnostic_item_keys.push(traditionalKey('after-rollback'));
  const next = await request({ action: 'start', mode: 'mock', sessionKey: 'after-rollback' });
  assert.equal(next.status, 200);
  assert.equal(next.data.attempt.assessment_version, 'in-house-core-v1');
  assert.deepEqual(state.tables.in_house_assessment_item_responses, history);
  const review = await request({ action: 'review', attemptId: started.data.attempt.id });
  assert.equal(review.status, 200);
  assert.deepEqual(review.data.responses.map(r => r.credit), final.data.responses.map(r => r.credit));
  const beforeReview = clone(state.tables);
  const outdatedReview = await request({ action: 'review', attemptId: started.data.attempt.id }, 'student-token', null);
  assert.equal(outdatedReview.status, 409);
  assert.match(outdatedReview.data.error, /requires the updated CAT page/);
  assert.equal(outdatedReview.data.responses, undefined);
  assert.deepEqual(state.tables, beforeReview);
});

test('authenticated endpoint: start, checkpoint/resume, staged answers, grouped ability, completion and authorized review', async () => {
  reset();
  const started = await request({ action: 'start', mode: 'mock', sessionKey: 'synthetic' });
  assert.equal(started.status, 200);
  const attempt = state.tables.in_house_assessment_attempts[0];
  const id = attempt.id;
  assert.equal(started.data.attempt.assessment_version, MODEL);
  assert.match(started.data.currentItemId, /:first$/);
  assert.doesNotMatch(JSON.stringify(started.data), /FUTURE MUST|PRIVATE FINDING|ngnState|"correct"|rationale|content_version/);
  const saved = await request({ action: 'checkpoint', attemptId: id, expectedRevision: 0, checkpoint: {
    currentItemId: 'forged-future', ability: 1, scoringModel: 'forged', ngnState: { forged: true },
    draft: { ngn: { answer: ['finding-a'], tabId: 'notes' } }, examTimer: { remainingMs: 1000, multiplier: 1, showTimer: false },
  } });
  assert.equal(saved.status, 200);
  assert.equal(attempt.checkpoint.currentItemId, started.data.currentItemId);
  assert.equal(attempt.checkpoint.ability, 0.5);
  assert.equal(attempt.checkpoint.scoringModel, MODEL);
  const resumed = await request({ action: 'resume', assessmentKey: 'diagnostic-mock' });
  assert.deepEqual(resumed.data.attempt.checkpoint.draft.ngn, { answer: ['finding-a'], tabId: 'notes' });
  assert.equal(resumed.data.attempt.checkpoint.examTimer.showTimer, false);
  assert.equal(resumed.data.attempt.checkpoint.ngnState, undefined);
  const first = await request({ action: 'answer', attemptId: id, expectedRevision: 1, itemId: started.data.currentItemId, answer: ['finding-a'] });
  assert.equal(first.status, 200);
  assert.equal(attempt.ability_estimate, 0.5, 'no update within a dependent case');
  assert.equal(first.data.completed, false);
  assert.equal(first.data.abilityEstimate, null);
  assert.equal(first.data.outcomes[0].correct_answer, undefined);
  assert.equal(first.data.responses[0].credit, undefined);
  assert.match(first.data.nextItemId, /:second$/);
  assert.match(JSON.stringify(first.data.nextItem), /FUTURE MUST/);
  const second = await request({ action: 'answer', attemptId: id, expectedRevision: 2, itemId: first.data.nextItemId, answer: [0, 0] });
  assert.equal(second.status, 200);
  assert.equal(attempt.ability_estimate, 0.5);
  const third = await request({ action: 'answer', attemptId: id, expectedRevision: 3, itemId: second.data.nextItemId, answer: ['0:0', '1:0'] });
  assert.equal(third.status, 200);
  assert.equal(third.data.completed, true);
  assert.equal(third.data.result, null, 'an exhausted pool is not presented as a pass/fail result');
  assert.equal(third.data.completionReason, 'insufficient-items');
  assert.equal(attempt.ability_estimate, 0.53, 'one update using mean question credit (1 + .5 + .5)/3');
  assert.equal(third.data.responses.length, 3);
  assert.deepEqual(third.data.responses.map(r => [r.credit.earned, r.credit.max]), [[1, 1], [1, 2], [1, 2]]);
  assert.ok(third.data.responses.every(r => r.contentVersion.length === 64 && r.interaction.rationale));
  const studentReview = await request({ action: 'review', attemptId: id });
  assert.equal(studentReview.status, 200);
  const adminReview = await request({ action: 'review', attemptId: id }, 'admin-token');
  assert.equal(adminReview.status, 200);
  assert.deepEqual(adminReview.data.responses.map(r => r.credit), studentReview.data.responses.map(r => r.credit));
});
test('bad auth, stale/replayed IDs, invalid responses and premature review never modify records', async () => {
  reset();
  assert.equal((await request({ action: 'start', mode: 'mock', sessionKey: 'test' }, 'expired')).status, 401);
  const started = await request({ action: 'start', mode: 'mock', sessionKey: 'test' });
  const { id } = started.data.attempt;
  const before = JSON.stringify(state.tables.in_house_assessment_attempts);
  for (const input of [
    { expectedRevision: 0, itemId: 'forged', answer: ['finding-a'] },
    { expectedRevision: 5, itemId: started.data.currentItemId, answer: ['finding-a'] },
    { expectedRevision: 0, itemId: started.data.currentItemId, answer: ['future'] },
    { expectedRevision: 0, itemId: started.data.currentItemId, answer: ['finding-a', 'finding-a'] },
  ]) assert.ok((await request({ action: 'answer', attemptId: id, ...input })).status >= 400);
  assert.equal(JSON.stringify(state.tables.in_house_assessment_attempts), before);
  assert.equal(state.tables.in_house_assessment_item_responses.length, 0);
  assert.equal((await request({ action: 'review', attemptId: id })).status, 403);
  state.tables.students[0].id = 'other-student';
  assert.equal((await request({ action: 'answer', attemptId: id, expectedRevision: 0, itemId: started.data.currentItemId, answer: ['finding-a'] })).status, 404);
});
test('content snapshots survive edits/unpublishing; resuming cannot change a case key or historical review', async () => {
  reset();
  const started = await request({ action: 'start', mode: 'mock', sessionKey: 'test' });
  const { id } = started.data.attempt;
  state.tables.questions[0].active = false;
  state.tables.questions[0].item_data.items[0].segments[0].correct = false;
  const resumed = await request({ action: 'resume', assessmentKey: 'diagnostic-mock' });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.data.currentItemId, started.data.currentItemId);
  const scored = await request({ action: 'answer', attemptId: id, expectedRevision: 0, itemId: started.data.currentItemId, answer: ['finding-a'] });
  assert.equal(scored.status, 200);
  assert.equal(state.tables.in_house_assessment_item_responses[0].is_correct, true);
});
test('legacy attempts retain binary scoring, checkpoints, history, and grouped-case submission shape', async () => {
  reset();
  state.tables.questions = [];
  state.tables.in_house_diagnostic_item_keys = [
    { bank_scope: 'diagnostic', item_id: 'legacy-case', selectable: true, item_type: 'casestudy', case_length: 2, difficulty: 2, blueprint: 'Other', core_tags: [] },
    ...['a', 'b'].map((id, i) => ({ bank_scope: 'diagnostic', item_id: `legacy-case:${id}`, parent_item_id: 'legacy-case', selectable: false, item_type: 'mcq', sequence_order: i + 1, difficulty: 2, correct_response: [0], rationale: 'Legacy rationale' })),
  ];
  state.tables.in_house_assessment_attempts.push({
    id: 'legacy-attempt', student_id: 'student', assessment_key: 'diagnostic-mock', assessment_version: 'in-house-core-v1',
    status: 'in_progress', ability_estimate: 0.5, target_questions: 150, checkpoint_revision: 0,
    checkpoint: { schemaVersion: 3, mode: 'mock', currentItemId: 'legacy-case', profile: { mode: 'mock' } },
  });
  delete state.tables.questions;
  delete state.tables.question_import_reviews;
  const existing = await request({ action: 'start', mode: 'mock', sessionKey: 'legacy-resume' });
  assert.equal(existing.status, 200, 'legacy starts must not depend on the new registry');
  assert.equal(existing.data.attempt.assessment_version, 'in-house-core-v1');
  assert.equal((await request({ action: 'resume', assessmentKey: 'diagnostic-mock' })).status, 200);
  const first = await request({ action: 'answer', attemptId: 'legacy-attempt', expectedRevision: 0, itemId: 'legacy-case', caseAnswers: { a: [0], b: [1] } });
  assert.equal(first.status, 200);
  assert.equal(first.data.scoringModel, 'in-house-core-v1');
  assert.deepEqual(state.tables.in_house_assessment_item_responses.map(r => r.selected_answer), [[0], [1]]);
  assert.deepEqual(state.tables.in_house_assessment_item_responses.map(r => r.is_correct), [true, false]);
  assert.ok(Math.abs(state.tables.in_house_assessment_attempts[0].ability_estimate - 0.476) < 0.001);
  assert.equal(state.tables.in_house_assessment_attempts[0].checkpoint.ngnState, undefined);
  assert.equal(first.data.responses[0].credit, undefined);
});

test('failed and concurrent atomic commits cannot double-score or advance a case twice', async () => {
  reset();
  const started = await request({ action: 'start', mode: 'mock', sessionKey: 'atomic-test' });
  const { id } = started.data.attempt;
  const submit = { action: 'answer', attemptId: id, expectedRevision: 0, itemId: started.data.currentItemId, answer: ['finding-a'], earned: 999, ability: 1 };
  const before = JSON.stringify(state.tables.in_house_assessment_attempts);
  state.failCommit = true;
  const originalError = console.error;
  console.error = () => {};
  let failure;
  try { failure = await request(submit); } finally { console.error = originalError; }
  assert.equal(failure.status, 500);
  assert.equal(JSON.stringify(state.tables.in_house_assessment_attempts), before);
  assert.equal(state.tables.in_house_assessment_item_responses.length, 0);
  state.failCommit = false;
  const results = await Promise.all([request(submit), request(submit)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(state.tables.in_house_assessment_item_responses.length, 1);
  assert.equal(state.tables.in_house_assessment_attempts[0].checkpoint.ngnState.current.stage, 1);
  assert.equal(state.tables.in_house_assessment_attempts[0].ability_estimate, 0.5);
  assert.equal((await request(submit)).status, 409);
});

test('all standalone NGN answer shapes pass through server scoring and completed history', async () => {
  const cases = [
    [prompt('mcq', 'mcq', { options: ['A', 'B'], correct: [0] }), 0, [1, 1]],
    [prompt('sata', 'sata', { options: ['A', 'B', 'C'], correct: [0, 1] }), [0], [1, 2]],
    [prompt('highlight', 'highlight', { segments: [{ id: 'a', t: 'A', correct: true }, { id: 'b', t: 'B', correct: true }, { id: 'c', t: 'C', correct: false }] }), ['a'], [1, 2]],
    [prompt('matrix-single', 'matrix', { rows: ['R1', 'R2'], cols: ['A', 'B'], responseMode: 'single', correct: ['0:0', '1:1'] }), ['0:0', '1:0'], [1, 2]],
    [prompt('matrix', 'matrix', { rows: ['R1', 'R2'], cols: ['A', 'B'], correct: ['0:0', '1:1'] }), ['0:0', '1:0'], [0, 2]],
    [prompt('matrix-columns', 'matrix', { rows: ['R1', 'R2'], cols: ['A', 'B'], correct: ['0:0', '1:1'] }), ['0:0', '0:1'], [1, 2]],
    [prompt('matrix-rows', 'matrix', { rows: ['R1', 'R2'], cols: ['A', 'B'], scoringAxis: 'row', correct: ['0:0', '1:1'] }), ['0:0', '1:0'], [1, 2]],
    [prompt('cloze', 'cloze', { template: '{{0}}', dropdowns: [{ options: ['A', 'B'], correct: 0 }] }), [1], [0, 1]],
    [prompt('bowtie', 'bowtie', { bowtie: { actions: ['A', 'B'], conditions: ['C', 'D'], complications: ['E', 'F'] }, correct: { actions: [0, 1], condition: 0, complications: [0, 1] } }), [0, 1, 1, 1, 0], [4, 5]],
    [prompt('fill', 'fill', { correct: 1.25, tolerance: 0.01 }), '1.25', [1, 1]],
  ];
  for (const [item, answer, credit] of cases) {
    reset();
    Object.assign(state.tables.questions[0], {
      item_type: item.type, item_data: { ...item, schemaVersion: 1 },
    });
    const started = await request({ action: 'start', mode: 'mock', sessionKey: `test-${item.type}` });
    assert.equal(started.status, 200, item.type);
    const scored = await request({ action: 'answer', attemptId: started.data.attempt.id, expectedRevision: 0, itemId: started.data.currentItemId, answer });
    assert.equal(scored.status, 200, item.type);
    assert.deepEqual([scored.data.responses[0].credit.earned, scored.data.responses[0].credit.max], credit);
    assert.deepEqual(scored.data.responses[0].selected_answer, answer);
    assert.deepEqual(state.tables.in_house_assessment_item_responses[0].selected_answer, answer);
    const review = await request({ action: 'review', attemptId: started.data.attempt.id });
    assert.deepEqual(review.data.responses[0].selected_answer, answer);
    assert.deepEqual([review.data.responses[0].credit.earned, review.data.responses[0].credit.max], credit);
  }
});

const coreTags = ['delegation', 'consent_rights', 'infection_prevention', 'insulin_glucose',
  'high_alert_medications', 'blood_administration', 'airway_breathing', 'circulation_shock',
  'fluids_electrolytes', 'postoperative_risk', 'maternal_newborn', 'pediatrics', 'psych_safety'];
const categoryBlueprints = [
  ['Management of Care', 'Safe & Effective Care Environment'],
  ['Safety & Infection Prevention', 'Safe & Effective Care Environment'],
  ['Health Promotion & Maintenance', 'Health Promotion & Maintenance'],
  ['Psychosocial Integrity', 'Psychosocial Integrity'],
  ['Basic Care & Comfort', 'Physiological Integrity'],
  ['Pharmacological & Parenteral Therapies', 'Physiological Integrity'],
  ['Reduction of Risk Potential', 'Physiological Integrity'],
  ['Physiological Adaptation', 'Physiological Integrity'],
];
function traditionalKey(id, type = 'mcq', difficulty = 2, categoryIndex = 7) {
  const [category, blueprint] = categoryBlueprints[categoryIndex];
  return {
    bank_scope: 'diagnostic', item_id: id, selectable: true, item_type: type,
    difficulty, blueprint, category, nclex_category: category, core_tags: coreTags,
    correct_response: type === 'sata' ? [0, 1] : [0], rationale: 'Traditional synthetic rationale',
  };
}
function installQuestion(item, serial, categoryIndex = 7, difficulty = 'medium') {
  const record = {
    ...clone(question), id: `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    source_key: `qbank-bulk-mixed-${serial}`, item_type: item.kind === 'case' ? 'case' : item.type,
    item_data: { ...clone(item), schemaVersion: 1 }, difficulty, nclex_category: categoryBlueprints[categoryIndex][0],
  };
  state.tables.questions.push(record);
  state.tables.question_import_reviews.push({ source_key: record.source_key, status: 'published' });
  return `qbank:${record.id}`;
}
const mixedFormats = [
  [prompt('highlight', 'highlight', { chartSelections: true, segments: [{ id: 'a', t: 'A', correct: true }, { id: 'b', t: 'B', correct: true }, { id: 'c', t: 'C', correct: false }] }), ['a'], [1, 2]],
  [prompt('cloze', 'cloze', { template: '{{0}} then {{1}}', dropdowns: [{ options: ['A', 'B'], correct: 0 }, { options: ['A', 'B'], correct: 1 }] }), [0, 0], [1, 2]],
  [prompt('matrix-single', 'matrix', { responseMode: 'single', rows: ['R1', 'R2'], cols: ['A', 'B'], correct: ['0:0', '1:1'] }), ['0:0', '1:0'], [1, 2]],
  [prompt('matrix-multiple', 'matrix', { rows: ['R1', 'R2'], cols: ['A', 'B'], correct: ['0:0', '1:1'] }), ['0:0', '0:1'], [1, 2]],
  [prompt('bowtie', 'bowtie', { bowtie: { actions: ['A', 'B', 'C'], conditions: ['D', 'E'], complications: ['F', 'G', 'H'] }, correct: { actions: [0, 1], condition: 0, complications: [0, 1] } }), [0, 2, 0, 0, 2], [3, 5]],
  [prompt('sata', 'sata', { options: ['A', 'B', 'C'], correct: [0, 1] }), [0], [1, 2]],
  [prompt('mcq', 'mcq', { options: ['A', 'B'], correct: [0] }), 0, [1, 1]],
  [prompt('numeric', 'fill', { correct: 1.25, tolerance: 0.01 }), '1.25', [1, 1]],
];
function mixedChart(length) {
  return [
    { id: 'notes', label: 'Notes', columns: ['Finding'], entries: [
      { at: '2026-10-21T08:00', cells: [{ id: 'a', t: 'A' }] },
      { at: '2026-10-21T08:01', cells: [{ id: 'b', t: 'B' }] },
      { at: '2026-10-21T08:02', cells: [{ id: 'c', t: 'C' }] },
      ...Array.from({ length: length - 1 }, (_, i) => ({
        at: `2026-10-21T09:0${i}`, fromItem: i + 2, cells: [{ t: `STAGE-${i + 2}-ONLY` }],
      })),
    ] },
    { id: 'labs', label: 'Results', columns: ['Result'], fromItem: length, entries: [
      { at: '2026-10-21T10:00', cells: [{ t: 'FINAL-STAGE-ONLY' }] },
    ] },
  ];
}

test('mixed traditional/NGN CAT completes 150 responses, resumes cases, preserves review, and stays inconclusive without independent evidence', async () => {
  reset();
  state.tables.questions = [];
  state.tables.question_import_reviews = [];
  const expected = new Map();
  for (let i = 0; i < 45; i++) {
    const key = traditionalKey(`mixed-traditional-${i}`, i % 2 ? 'sata' : 'mcq', (i % 3) + 1, i % 8);
    state.tables.in_house_diagnostic_item_keys.push(key);
    expected.set(key.item_id, { answer: key.item_type === 'sata' ? [1, 0] : 0 });
    const [item, answer, credit] = mixedFormats[i % mixedFormats.length];
    const parent = installQuestion({ ...item, tabs: mixedChart(1) }, i + 1, i % 8, ['easy', 'medium', 'hard'][i % 3]);
    expected.set(parent, { answer, credit });
  }
  for (let i = 0; i < 10; i++) {
    const parent = installQuestion({
      id: `case-${i}`, kind: 'case', textFormat: 'plain', scenario: 'Synthetic unfolding case',
      tabs: mixedChart(6), items: mixedFormats.slice(0, 6).map(([item]) => item),
    }, i + 100, i % 8, ['easy', 'medium', 'hard'][i % 3]);
    mixedFormats.slice(0, 6).forEach(([item, answer, credit], stage) => expected.set(`${parent}:${item.id}`, { answer, credit, parent, stage }));
  }
  // Existing unrelated rows must remain byte-for-byte unchanged.
  const historicalAttempt = { id: 'history', student_id: 'different-student', status: 'completed', assessment_version: 'in-house-core-v1', checkpoint: { original: true }, result: 'PASS' };
  const historicalResponse = { id: 'history-response', attempt_id: 'history', item_id: 'unchanged', selected_answer: [1], is_correct: true };
  state.tables.in_house_assessment_attempts.push(clone(historicalAttempt));
  state.tables.in_house_assessment_item_responses.push(clone(historicalResponse));
  const started = await request({ action: 'start', mode: 'mock', sessionKey: 'full-mixed' });
  assert.equal(started.status, 200);
  const attempt = state.tables.in_house_assessment_attempts.find(a => a.id === started.data.attempt.id);
  let currentId = started.data.currentItemId, display = started.data.currentItem;
  let completed, count = 0, pausedCases = 0, caseScores = [], visited = new Set();
  const evidence = [];
  while (currentId) {
    assert.ok(count < 150);
    assert.ok(!visited.has(currentId), 'current-attempt questions never repeat');
    visited.add(currentId);
    const fixture = expected.get(currentId);
    assert.ok(fixture, currentId);
    const current = currentInteraction(attempt.checkpoint);
    const key = current ? attempt.checkpoint.ngnState.current.key :
      state.tables.in_house_diagnostic_item_keys.find(k => k.item_id === currentId);
    const before = attempt.ability_estimate;
    if (fixture.parent) {
      assert.equal(fixture.stage, caseScores.length, 'case children are sequential and contiguous');
      assert.equal(display.caseIndex, fixture.stage);
      const text = JSON.stringify(display);
      for (let stage = 2; stage <= 6; stage++) {
        assert.equal(text.includes(`STAGE-${stage}-ONLY`), stage <= fixture.stage + 1);
      }
      assert.equal(text.includes('FINAL-STAGE-ONLY'), fixture.stage === 5);
      if (fixture.stage === 1) {
        const saved = await request({ action: 'checkpoint', attemptId: attempt.id, expectedRevision: attempt.checkpoint_revision,
          checkpoint: { draft: { ngn: { answer: fixture.answer, tabId: 'notes' } }, examTimer: { remainingMs: 3600000, multiplier: 1.5, showTimer: false } } });
        assert.equal(saved.status, 200);
        const resumed = await request({ action: 'resume', assessmentKey: 'diagnostic-mock' });
        assert.equal(resumed.status, 200);
        assert.equal(resumed.data.currentItemId, currentId);
        assert.deepEqual(resumed.data.attempt.checkpoint.draft.ngn, { answer: fixture.answer, tabId: 'notes' });
        assert.equal(resumed.data.attempt.checkpoint.examTimer.multiplier, 1.5);
        assert.equal(resumed.data.responses.length, count);
        assert.equal(resumed.data.attempt.assessment_version, MODEL);
        pausedCases++;
      }
    }
    const scored = await request({ action: 'answer', attemptId: attempt.id, expectedRevision: attempt.checkpoint_revision,
      itemId: currentId, answer: fixture.answer });
    assert.equal(scored.status, 200, currentId);
    count++;
    const savedResponse = state.tables.in_house_assessment_item_responses.find(r => r.attempt_id === attempt.id && r.item_id === currentId);
    assert.deepEqual(savedResponse.selected_answer, fixture.answer);
    const detail = attempt.checkpoint.ngnState.responses[currentId];
    if (fixture.credit) {
      assert.deepEqual([detail.credit.earned, detail.credit.max], fixture.credit);
      assert.deepEqual(detail.answer, fixture.answer);
      assert.ok(detail.item.rationale);
    }
    const normalized = fixture.credit ? fixture.credit[0] / fixture.credit[1] : 1;
    if (fixture.parent) caseScores.push(normalized);
    const final = !fixture.parent || fixture.stage === 5;
    const expectedAbility = final
      ? Number(updateNGNAbility(before, fixture.parent ? caseScores.reduce((a, b) => a + b, 0) / 6 : normalized, key.difficulty).toFixed(3))
      : before;
    assert.equal(attempt.ability_estimate, expectedAbility, 'exact adaptive update once per standalone/group');
    if (fixture.parent && final) caseScores = [];
    evidence.push({ id: currentId, evidenceGroup: fixture.parent || currentId, evidenceCredit: normalized, difficulty: key.difficulty });
    assert.equal(scored.data.result, null, 'insufficient independent evidence cannot classify readiness');
    assert.equal(scored.data.completed, count === 150);
    if (!scored.data.completed) {
      assert.equal(scored.data.abilityEstimate, null);
      assert.ok(scored.data.responses.every(r => r.credit === undefined && r.rationale === undefined));
    } else completed = scored.data;
    currentId = scored.data.nextItemId;
    display = scored.data.nextItem;
  }
  assert.equal(count, 150);
  assert.equal(pausedCases, 10);
  assert.equal(ngnEvidence(evidence).length, 55, '45 traditional plus 10 full-credit standalone responses; partial cases add no confidence');
  assert.equal(completed.completionReason, 'item-limit-or-fixed-length');
  assert.equal(attempt.status, 'completed');
  for (const token of ['student-token', 'admin-token']) {
    const review = await request({ action: 'review', attemptId: attempt.id }, token);
    assert.equal(review.status, 200);
    assert.equal(review.data.responses.length, 150);
    for (const response of review.data.responses) {
      const fixture = expected.get(response.item_id);
      assert.ok(response.rationale, response.item_id);
      if (fixture.credit) {
        assert.deepEqual([response.credit.earned, response.credit.max], fixture.credit);
        assert.deepEqual(response.selected_answer, fixture.answer);
        assert.equal(response.scoringVersion, 'ngn-v1');
        assert.match(response.contentVersion, /^[0-9a-f]{64}$/);
      }
    }
  }
  assert.deepEqual(state.tables.in_house_assessment_attempts[0], historicalAttempt);
  assert.deepEqual(state.tables.in_house_assessment_item_responses[0], historicalResponse);
});

test('traditional correctness adjusts difficulty for the next NGN selection; partial credit remains separate', async () => {
  for (const correct of [true, false]) {
    reset();
    state.tables.questions = [];
    state.tables.question_import_reviews = [];
    state.tables.in_house_diagnostic_item_keys.push(traditionalKey('first-medium'));
    const easy = installQuestion(mixedFormats[5][0], 1, 7, 'easy');
    const hard = installQuestion(mixedFormats[1][0], 2, 7, 'hard');
    const start = await request({ action: 'start', mode: 'nclex', sessionKey: 'difficulty-check' });
    assert.equal(start.data.currentItemId, 'first-medium');
    const attempt = state.tables.in_house_assessment_attempts[0];
    const first = await request({ action: 'answer', attemptId: attempt.id, expectedRevision: 0,
      itemId: 'first-medium', answer: correct ? 0 : 1 });
    assert.equal(first.status, 200);
    assert.equal(attempt.ability_estimate, Number(updateAbility(0.5, correct, 2).toFixed(3)));
    assert.equal(first.data.nextItemId, correct ? hard : easy);
    assert.equal(first.data.nextItem.difficulty, correct ? 3 : 1);
    const before = attempt.ability_estimate;
    const second = await request({ action: 'answer', attemptId: attempt.id, expectedRevision: 1,
      itemId: first.data.nextItemId, answer: correct ? [0, 0] : [0] });
    assert.equal(second.status, 200);
    assert.equal(attempt.ability_estimate, Number(updateNGNAbility(before, 0.5, correct ? 3 : 1).toFixed(3)));
    assert.equal(second.data.completed, false);
    assert.equal(second.data.result, null);
  }
});

test('new short CAT and readiness assessments reach their limits without inventing a classification', async () => {
  for (const [mode, target] of [['nclex', 45], ['assessment', 85]]) {
    reset();
    state.tables.students[0].portal_stage = mode === 'assessment' ? 'assessment' : 'active';
    state.tables.questions = [];
    state.tables.question_import_reviews = [];
    const answers = new Map();
    for (let i = 0; i < 5; i++) {
      const key = traditionalKey(`limit-traditional-${i}`, 'mcq', 2, i % 8);
      state.tables.in_house_diagnostic_item_keys.push(key);
      answers.set(key.item_id, 0);
    }
    for (let i = 0; i < target - 11; i++) {
      const [item, answer] = mixedFormats[1];
      answers.set(installQuestion(item, i + 1, i % 8), answer);
    }
    const caseId = installQuestion({ id: 'limit-case', kind: 'case', textFormat: 'plain', scenario: 'Synthetic case',
      tabs: mixedChart(6), items: mixedFormats.slice(0, 6).map(([item]) => item) }, 1000);
    mixedFormats.slice(0, 6).forEach(([item, answer]) => answers.set(`${caseId}:${item.id}`, answer));
    const started = await request({ action: 'start', mode, sessionKey: `limit-${mode}` });
    assert.equal(started.status, 200);
    const attempt = state.tables.in_house_assessment_attempts[0];
    let id = started.data.currentItemId, count = 0, result;
    while (id) {
      assert.ok(count < target, mode);
      result = await request({ action: 'answer', attemptId: attempt.id, expectedRevision: attempt.checkpoint_revision,
        itemId: id, answer: answers.get(id) });
      assert.equal(result.status, 200);
      assert.equal(result.data.result, null);
      count++;
      assert.equal(result.data.completed, count === target);
      id = result.data.nextItemId;
    }
    assert.equal(count, target);
    assert.equal(result.data.completionReason, 'item-limit-or-fixed-length');
    assert.equal(attempt.status, 'completed');
    assert.equal((await request({ action: 'review', attemptId: attempt.id })).data.responses.length, target);
    assert.equal(Object.values(attempt.checkpoint.ngnState.responses).filter(r => r.parentId === caseId).length, 6,
      'all case children fit and finish before the limit');
  }
});

test('new traditional-only assessments with an exhausted small bank never fall back to PASS/FAIL', async () => {
  for (const mode of ['nclex', 'mock', 'assessment']) {
    reset();
    state.tables.students[0].portal_stage = mode === 'assessment' ? 'assessment' : 'active';
    state.tables.questions = [];
    state.tables.in_house_diagnostic_item_keys.push(traditionalKey('small-bank'));
    const started = await request({ action: 'start', mode, sessionKey: `small-${mode}` });
    assert.equal(started.status, 200);
    const finished = await request({ action: 'answer', attemptId: started.data.attempt.id, expectedRevision: 0,
      itemId: 'small-bank', answer: 0 });
    assert.equal(finished.status, 200);
    assert.equal(finished.data.completed, true);
    assert.equal(finished.data.result, null);
    assert.equal(finished.data.completionReason, 'insufficient-items');
    assert.equal(finished.data.responses[0].scoringModel, MODEL);
  }
});

test('historical MCQ, SATA, and bow-tie attempts keep their binary scores and original adaptive updates', async () => {
  const fixtures = [
    ['mcq', [0], 0, 1],
    ['sata', [0, 1], [1, 0], [0]],
    ['bowtie', { left: [0, 1], center: [0], right: [0, 1] },
      { left: [1, 0], center: [0], right: [1, 0] }, { left: [0, 2], center: [0], right: [0, 1] }],
  ];
  for (const [type, correctResponse, full, partialOrWrong] of fixtures) {
    for (const correct of [true, false]) {
      reset();
      delete state.tables.questions;
      delete state.tables.question_import_reviews;
      const key = { ...traditionalKey(`legacy-${type}`, type), correct_response: correctResponse };
      state.tables.in_house_diagnostic_item_keys = [key];
      const attempt = {
        id: `legacy-${type}`, student_id: 'student', assessment_key: 'diagnostic-mock', assessment_version: 'in-house-core-v1',
        status: 'in_progress', ability_estimate: 0.5, target_questions: 150, checkpoint_revision: 0,
        checkpoint: { schemaVersion: 3, mode: 'mock', currentItemId: key.item_id, profile: { mode: 'mock' } },
      };
      state.tables.in_house_assessment_attempts.push(attempt);
      const answer = correct ? full : partialOrWrong;
      const scored = await request({ action: 'answer', attemptId: attempt.id, expectedRevision: 0, itemId: key.item_id, answer });
      assert.equal(scored.status, 200, type);
      assert.equal(scored.data.completed, true);
      assert.equal(scored.data.scoringModel, 'in-house-core-v1');
      assert.equal(attempt.ability_estimate, Number(updateAbility(0.5, correct, 2).toFixed(3)));
      assert.equal(scored.data.responses[0].is_correct, correct);
      assert.equal(scored.data.responses[0].credit, undefined, 'legacy partial answers remain binary');
      assert.deepEqual(scored.data.responses[0].selected_answer, answer);
      assert.equal(attempt.checkpoint.ngnState, undefined);
      assert.equal(attempt.assessment_version, 'in-house-core-v1');
    }
  }
});
