// Run only on the retained disposable project: enabled phase, restart admissions off, then rollback phase.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import '../ngn-scoring.js';
import { MODEL } from '../supabase/functions/_shared/diagnostic-ngn.mjs';
import { updateNGNAbility } from '../supabase/functions/_shared/diagnostic-assessment-engine.mjs';
const [statusPath, phase, statePath] = process.argv.slice(2);
assert.ok(['enabled', 'rollback'].includes(phase) && statePath, 'Supply status.json enabled|rollback private-state.json');
const env = JSON.parse(readFileSync(statusPath, 'utf8'));
assert.equal(env.API_URL, 'http://127.0.0.1:54321');
async function api(path, method = 'GET', body, token = env.SERVICE_ROLE_KEY) {
  const target = new URL(path, env.API_URL);
  assert.equal(target.origin, env.API_URL);
  const response = await fetch(target, { method, headers: { apikey: env.ANON_KEY,
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  return { status: response.status, data };
}
async function rest(table, method = 'GET', body, query = '') {
  const r = await api('/rest/v1/' + table + query, method, body);
  assert.ok(r.status < 300, JSON.stringify(r));
  return r.data;
}
async function all(table) {
  const rows = [];
  for (let offset = 0;; offset += 500) {
    const page = await rest(table, 'GET', undefined, `?order=id&offset=${offset}&limit=500`);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
const tables = ['in_house_assessment_attempts', 'in_house_assessment_item_responses'];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function baseline() {
  return Object.fromEntries(await Promise.all(tables.map(async t => {
    const rows = await all(t);
    return [t, { ids: rows.map(r => r.id), hash: digest(rows) }];
  })));
}
async function unchanged(before) {
  for (const t of tables) {
    const rows = (await all(t)).filter(r => before[t].ids.includes(r.id));
    assert.equal(rows.length, before[t].ids.length);
    assert.equal(digest(rows), before[t].hash, `Existing ${t} must remain byte-identical`);
  }
}
async function account(mode, admin = false) {
  const email = `combined-ngn-${randomUUID()}@example.test`, password = randomUUID() + '-Aa9!';
  const created = await api('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true });
  assert.equal(created.status, 200);
  if (admin) await rest('app_admins', 'POST', { user_id: created.data.id });
  else await rest('students', 'POST', { name: 'Synthetic combined tester', email, pin: 'test-only',
    auth_user_id: created.data.id, portal_stage: mode === 'assessment' ? 'assessment' : 'active' });
  const signed = await api('/auth/v1/token?grant_type=password', 'POST', { email, password }, env.ANON_KEY);
  assert.equal(signed.status, 200);
  return { email, password, token: signed.data.access_token };
}
const capabilities = {
  legacy: {}, sata: { optionProtocol: 'sata-order-v1' }, ngn: { clientProtocol: 'ngn-cat-v1' },
  combined: { clientProtocol: 'ngn-cat-v1', optionProtocol: 'sata-order-v1' },
};
const call = (user, body, client = 'combined') =>
  api('/functions/v1/diagnostic-assessment', 'POST', { ...body, ...capabilities[client] }, user.token);
const prompt = (id, type, fields) => ({ id, type, textFormat: 'plain', scoringVersion: 'ngn-v1',
  stem: `Synthetic ${id}`, rationale: `Synthetic rationale ${id}`, ...fields });
const sata = n => prompt(`sata-${n}`, 'sata', { options: Array.from({ length: 6 }, (_, i) => `Synthetic choice ${i}`),
  correct: Array.from({ length: n }, (_, i) => i),
  optionRationales: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i, `Synthetic option rationale ${n}:${i}`])) });
const entries = [
  { id: 'synthetic-case', kind: 'case', schemaVersion: 1, textFormat: 'plain', scenario: 'Synthetic record',
    tabs: [{ id: 'notes', label: 'Notes', columns: ['Finding'], entries: [
      { at: '2026-10-21T08:00', cells: [{ id: 'finding', t: 'Synthetic finding' }] },
      { at: '2026-10-21T09:00', fromItem: 2, cells: [{ t: 'SYNTHETIC FUTURE FINDING' }] },
    ] }, { id: 'labs', label: 'Labs', columns: ['Test', 'Result'], entries: [
      { at: '2026-10-21T08:00', cells: [{ t: 'Synthetic test' }, { t: 'Synthetic result' }] },
    ] }],
    items: [sata(3), sata(4), sata(5)] },
  ...[3, 4, 5].map(n => ({ ...sata(n), schemaVersion: 1 })),
  { ...prompt('highlight', 'highlight', { segments: [{ id: 'finding', t: 'Synthetic finding', correct: true }, { id: 'other', t: 'Other synthetic finding', correct: false }] }), schemaVersion: 1 },
  { ...prompt('cloze', 'cloze', { template: '{{0}} then {{1}}', dropdowns: [{ options: ['A', 'B'], correct: 0 }, { options: ['A', 'B'], correct: 1 }] }), schemaVersion: 1 },
  { ...prompt('matrix', 'matrix', { rows: ['R1', 'R2'], cols: ['A', 'B'], responseMode: 'single', correct: ['0:0', '1:1'] }), schemaVersion: 1 },
  { ...prompt('bowtie', 'bowtie', { bowtie: { actions: ['A', 'B', 'C'], conditions: ['A', 'B'], complications: ['A', 'B', 'C'] },
    correct: { actions: [0, 1], condition: 0, complications: [0, 1] } }), schemaVersion: 1 },
];
const answerFor = item => {
  switch (item.type) {
    case 'sata': return item.correct.slice(0, -1);
    case 'highlight': return ['finding'];
    case 'cloze': return [0, 1];
    case 'matrix': return ['0:0', '1:1'];
    case 'bowtie': return [0, 1, 0, 0, 1];
    default: throw new Error('Unexpected synthetic interaction');
  }
};
const encode = (item, answer) => item.presentation
  ? { version: 'sata-order-v1', optionIds: answer.map(i => item.presentation.ids[i]) } : answer;
let saved;
if (phase === 'enabled') {
  const before = await baseline();
  const keys = await rest('in_house_diagnostic_item_keys');
  assert.ok(keys.every(k => k.item_source === 'local-synthetic'));
  const existing = await rest('questions');
  assert.ok(existing.every(q => q.source_key?.startsWith('qbank-bulk-local-')), 'Synthetic disposable questions only');
  await rest('questions', 'PATCH', { active: false }, '?source_key=like.qbank-bulk-local-*');
  const records = [];
  for (const entry of entries) {
    const id = randomUUID(), source_key = `qbank-bulk-local-combined-${id}`;
    await rest('questions', 'POST', { id, source_key, stem: 'Synthetic combined question',
      rationale: 'Synthetic overall rationale', active: false, difficulty: 'medium', nclex_category: 'Physiological Adaptation',
      topic: 'Synthetic combined test', item_type: entry.kind === 'case' ? 'case' : entry.type, item_data: entry,
      ...(entry.type === 'sata' ? { option_rationales: entry.optionRationales } : {}) });
    await rest('question_import_reviews', 'POST', { source_key, status: 'published' });
    records.push({ id, entry });
  }
  const admin = await account('mock', true), other = await account('mock'), reports = [], pending = [];
  assert.equal((await api('/rest/v1/rpc/is_app_admin', 'POST', {}, admin.token)).data, true);
  for (const mode of ['nclex', 'mock', 'assessment']) for (const client of ['ngn', 'combined']) {
    for (const record of records) {
      await rest('questions', 'PATCH', { active: false }, '?source_key=like.qbank-bulk-local-combined-*');
      await rest('questions', 'PATCH', { active: true }, `?id=eq.${record.id}`);
      // The dynamic-only bank deliberately exhausts after this one snapshot, testing safe exhaustion too.
      await rest('in_house_diagnostic_item_keys', 'PATCH', { selectable: false }, '?item_source=eq.local-synthetic');
      const user = await account(mode);
      const started = await call(user, { action: 'start', mode, sessionKey: randomUUID() }, client);
      assert.equal(started.status, 200, JSON.stringify(started));
      assert.equal(started.data.attempt.assessment_version, MODEL, 'Restart the local server with admissions enabled');
      let item = started.data.currentItem, revision = 0, final;
      const id = started.data.attempt.id, originalOrder = structuredClone(item.presentation), selected = [];
      assert.equal(Boolean(item.presentation), client === 'combined' && item.type === 'sata');
      assert.doesNotMatch(JSON.stringify(item), /"correct"|"rationale"|optionRationales|SYNTHETIC FUTURE/);
      for (const table of ['in_house_diagnostic_item_keys', 'in_house_assessment_item_responses']) {
        assert.ok([401, 403].includes((await api(`/rest/v1/${table}?select=*`, 'GET', undefined, user.token)).status));
      }
      assert.deepEqual((await api(`/rest/v1/in_house_assessment_attempts?id=eq.${id}`, 'GET', undefined, user.token)).data, []);
      assert.equal((await call(other, { action: 'checkpoint', attemptId: id, expectedRevision: 0, checkpoint: {} }, client)).status, 404);
      assert.equal((await call(user, { action: 'review', attemptId: id }, client)).status, 403);
      for (const old of client === 'combined' ? ['legacy', 'sata', 'ngn'] : ['legacy', 'sata']) {
        assert.equal((await call(user, { action: 'resume', assessmentKey: started.data.attempt.assessment_key }, old)).status, 409);
      }
      const sourceItems = record.entry.kind === 'case' ? record.entry.items : [record.entry];
      for (const source of sourceItems) {
        const answer = answerFor(source), wire = encode(item, answer);
        const paused = await call(user, { action: 'checkpoint', attemptId: id, expectedRevision: revision,
          checkpoint: { draft: { ngn: { answer: wire, tabId: record.entry.kind === 'case' ? 'labs' : null } } } }, client);
        assert.equal(paused.status, 200, JSON.stringify(paused));
        revision = paused.data.checkpointRevision;
        const signed = await api('/auth/v1/token?grant_type=password', 'POST', { email: user.email, password: user.password }, env.ANON_KEY);
        user.token = signed.data.access_token;
        const resumed = await call(user, { action: 'resume', assessmentKey: started.data.attempt.assessment_key }, client);
        assert.deepEqual(resumed.data.currentItem, item);
        assert.deepEqual(resumed.data.attempt.checkpoint.draft.ngn.answer, answer);
        if (record.entry.kind === 'case' && source.id === 'sata-3' && client === 'combined') {
          pending.push({ user, mode, id, item, revision, assessmentKey: started.data.attempt.assessment_key, record });
          break;
        }
        const submit = { action: 'answer', attemptId: id, expectedRevision: revision, itemId: item.id, answer: wire };
        const responses = await Promise.all([call(user, submit, client), call(user, submit, client)]);
        assert.deepEqual(responses.map(r => r.status).sort(), [200, 409], JSON.stringify(responses));
        final = responses.find(r => r.status === 200);
        selected.push(answer);
        const scored = globalThis.NGNScoring.score(source, answer);
        const [installed] = await rest('in_house_assessment_attempts', 'GET', undefined, `?id=eq.${id}`);
        const detail = installed.checkpoint.ngnState.responses[item.id];
        assert.equal(detail.credit.score, scored.score);
        assert.deepEqual(final.data.responses.find(r => r.item_id === item.id).selected_answer, answer);
        assert.deepEqual(detail.item.presentation, item.presentation);
        revision = final.data.checkpointRevision;
        item = final.data.nextItem;
      }
      if (final?.data.completed) {
        const review = await call(user, { action: 'review', attemptId: id }, 'combined');
        assert.equal(review.status, 200);
        assert.equal((await call(admin, { action: 'review', attemptId: id }, 'combined')).status, 200);
        assert.equal((await call(other, { action: 'review', attemptId: id }, 'combined')).status, 403);
        assert.deepEqual(review.data.responses.map(r => r.selected_answer), selected);
        if (record.entry.type === 'sata') {
          assert.deepEqual(review.data.responses[0].presentation, originalOrder);
          assert.deepEqual(review.data.responses[0].interaction.optionRationales, record.entry.optionRationales);
        }
      }
      reports.push({ mode, client, type: record.entry.kind || record.entry.type, correctCount: record.entry.correct?.length, pending: !final });
    }
  }
  // Alter only synthetic source rows; saved in-progress case and completed reviews must retain their own snapshots.
  await rest('questions', 'PATCH', { active: false, stem: 'Changed synthetic source', item_data: { schemaVersion: 1 } }, '?source_key=like.qbank-bulk-local-combined-*');
  await unchanged(before);
  const preserved = {};
  for (const t of tables) {
    const rows = (await all(t)).filter(r => t !== 'in_house_assessment_attempts' || !pending.some(p => p.id === r.id));
    preserved[t] = { ids: rows.map(r => r.id), hash: digest(rows) };
  }
  saved = { pending, admin, before: preserved, reports };
  writeFileSync(statePath, JSON.stringify(saved), { mode: 0o600 });
  console.log(JSON.stringify({ phase, workflows: reports.length, pendingRollback: pending.length,
    historicalAttemptsPreserved: before.in_house_assessment_attempts.ids.length,
    historicalRowsPreserved: before.in_house_assessment_item_responses.ids.length, reports }, null, 2));
} else {
  saved = JSON.parse(readFileSync(statePath, 'utf8'));
  for (const pending of saved.pending) {
    const { user, id, record, assessmentKey } = pending;
    let { item, revision } = pending;
    const resumed = await call(user, { action: 'resume', assessmentKey });
    assert.deepEqual(resumed.data.currentItem, item);
    for (const [i, source] of record.entry.items.entries()) {
      const answer = answerFor(source);
      const result = await call(user, { action: 'answer', attemptId: id, expectedRevision: revision, itemId: item.id, answer: encode(item, answer) });
      assert.equal(result.status, 200, JSON.stringify(result));
      assert.deepEqual(result.data.responses.find(r => r.item_id === item.id).selected_answer, answer);
      const [installed] = await rest('in_house_assessment_attempts', 'GET', undefined, `?id=eq.${id}`);
      assert.deepEqual(installed.checkpoint.ngnState.responses[item.id].item.optionRationales, source.optionRationales);
      if (i === 0) assert.match(JSON.stringify(result.data.nextItem), /SYNTHETIC FUTURE/);
      revision = result.data.checkpointRevision;
      item = result.data.nextItem;
      if (i === 2) {
        assert.equal(result.data.completed, true);
        const credit = (2 / 3 + 3 / 4 + 4 / 5) / 3;
        assert.equal(result.data.abilityEstimate, Number(updateNGNAbility(0.5, credit, 2).toFixed(3)));
        assert.equal((await call(user, { action: 'review', attemptId: id })).status, 200);
      }
    }
  }
  await rest('in_house_diagnostic_item_keys', 'PATCH', { selectable: true }, '?parent_item_id=is.null&item_source=eq.local-synthetic');
  for (const pending of saved.pending) {
    const next = await call(pending.user, { action: 'start', mode: pending.mode, sessionKey: randomUUID() });
    assert.equal(next.status, 200, JSON.stringify(next));
    assert.equal(next.data.attempt.assessment_version, 'in-house-core-v1', 'Rollback must disable NEW NGN starts only');
    assert.equal(next.data.attempt.checkpoint.optionProtocol, 'sata-order-v1', 'NGN admission flag does not disable SATA identity starts');
  }
  for (const t of tables) {
    const oldIds = saved.before[t].ids;
    const prior = (await all(t)).filter(r => oldIds.includes(r.id));
    assert.equal(prior.length, oldIds.length);
    assert.equal(digest(prior), saved.before[t].hash);
  }
  console.log(JSON.stringify({ phase, resumedAndCompletedWithAdmissionsOff: saved.pending.length,
    newStartsCoreWithSata: saved.pending.length, completedResponseRowsUnchanged: saved.before.in_house_assessment_item_responses.ids.length }));
}
