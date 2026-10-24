// Explicitly run against a disposable, synthetic-only local Supabase project.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { counts, presentation } from '../supabase/functions/_shared/sata-presentation.mjs';
import { updateAbility, shouldStop, shouldStopMock, pickNextQuestion } from '../supabase/functions/_shared/diagnostic-assessment-engine.mjs';
const env = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(env.API_URL, 'http://127.0.0.1:54321', 'Never run against a hosted project');
async function api(path, method = 'GET', body, token = env.SERVICE_ROLE_KEY) {
  const url = new URL(path, env.API_URL);
  assert.equal(url.origin, env.API_URL);
  const response = await fetch(url, { method, headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json', Prefer: 'return=representation' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  return { status: response.status, data };
}
async function rest(table, method = 'GET', body, query = '') {
  const result = await api('/rest/v1/' + table + query, method, body);
  assert.ok(result.status < 300, JSON.stringify(result));
  return result.data;
}
async function all(table) {
  const rows = [];
  for (let offset = 0;; offset += 500) {
    const page = await rest(table, 'GET', undefined, `?order=id&offset=${offset}&limit=500`);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
async function account(mode) {
  const email = `sata-order-${randomUUID()}@example.test`, password = randomUUID() + '-Aa9!';
  const created = await api('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true });
  assert.equal(created.status, 200);
  const signed = await api('/auth/v1/token?grant_type=password', 'POST', { email, password }, env.ANON_KEY);
  assert.equal(signed.status, 200);
  const [student] = await rest('students', 'POST', { name: 'Synthetic SATA test', email, pin: 'test-only',
    auth_user_id: created.data.id, portal_stage: mode === 'assessment' ? 'assessment' : 'active' });
  return { token: signed.data.access_token, studentId: student.id };
}
const beforeAttempts = await all('in_house_assessment_attempts'), beforeRows = await all('in_house_assessment_item_responses');
const oldKeys = await rest('in_house_diagnostic_item_keys');
assert.ok(oldKeys.every(k => k.item_source === 'local-synthetic'), 'Refusing to replace non-synthetic inventory');
await rest('in_house_diagnostic_item_keys', 'DELETE', undefined, '?item_source=eq.local-synthetic');
const categoryPairs = [
  ['Management of Care', 'Safe & Effective Care Environment'], ['Safety & Infection Prevention', 'Safe & Effective Care Environment'],
  ['Health Promotion & Maintenance', 'Health Promotion & Maintenance'], ['Psychosocial Integrity', 'Psychosocial Integrity'],
  ['Basic Care & Comfort', 'Physiological Integrity'], ['Pharmacological & Parenteral Therapies', 'Physiological Integrity'],
  ['Reduction of Risk Potential', 'Physiological Integrity'], ['Physiological Adaptation', 'Physiological Integrity'],
];
const tags = ['delegation', 'consent_rights', 'infection_prevention', 'insulin_glucose', 'high_alert_medications',
  'blood_administration', 'airway_breathing', 'circulation_shock', 'fluids_electrolytes', 'postoperative_risk', 'maternal_newborn', 'pediatrics', 'psych_safety'];
const key = (id, i, overrides = {}) => ({ item_id: id, bank_scope: 'diagnostic', item_source: 'local-synthetic',
  selectable: true, item_type: 'mcq', difficulty: i % 3 + 1,
  category: categoryPairs[i % 8][0], nclex_category: categoryPairs[i % 8][0], blueprint: categoryPairs[i % 8][1],
  core_tags: tags, correct_response: [0], rationale: { correct: 'Synthetic rationale' }, ...overrides });
const sata = Object.entries(counts).filter(([id]) => !id.includes(':')).map(([id, n], i) => key(id, i, {
  item_type: 'sata', correct_response: Array.from({ length: Math.min(3 + i % 3, n - 1) }, (_, j) => j),
}));
await rest('in_house_diagnostic_item_keys', 'POST', [...sata, ...Array.from({ length: 165 }, (_, i) => key(`sata-test-mcq-${i}`, i))]);
await rest('in_house_diagnostic_item_keys', 'POST', [key('cs1', 0, { bank_scope: 'remediation', item_type: 'casestudy', case_length: 2 })]);
await rest('in_house_diagnostic_item_keys', 'POST', [
  key('cs1:cs1a', 0, { bank_scope: 'remediation', selectable: false, parent_item_id: 'cs1', sequence_order: 0, item_type: 'sata', correct_response: [0, 1, 2, 3, 4], rationale: 'Synthetic case-child rationale' }),
  key('cs1:cs1b', 0, { bank_scope: 'remediation', selectable: false, parent_item_id: 'cs1', sequence_order: 1, rationale: 'Synthetic case-child rationale' }),
]);
const bank = await rest('in_house_diagnostic_item_keys');
const reports = [];
const clients = process.argv.includes('--combined')
  ? ['legacy', 'sata', 'mcq', 'ngn', 'combined']
  : ['legacy', 'sata', 'mcq'];
for (const mode of ['practice', 'nclex', 'mock', 'assessment', 'remediation']) for (const client of clients) {
  const sataCapable = client === 'sata' || client === 'combined';
  const mcqCapable = client === 'mcq' || client === 'combined';
  const presentationCapable = sataCapable || mcqCapable;
  const user = await account(mode);
  const call = body => api('/functions/v1/diagnostic-assessment', 'POST', { ...body, ...(sataCapable ? { optionProtocol: presentation.VERSION } : {}),
    ...(mcqCapable ? { mcqOptionProtocol: 'mcq-order-v1' } : {}),
    ...(['ngn', 'combined'].includes(client) ? { clientProtocol: 'ngn-cat-v1' } : {}) }, user.token);
  const profile = { mode, qCount: mode === 'remediation' ? 2 : 12 };
  const started = await call({ action: 'start', mode, sessionKey: randomUUID(), profile });
  assert.equal(started.status, 200, JSON.stringify(started));
  assert.equal(started.data.attempt.assessment_version, 'in-house-core-v1', 'Run this baseline matrix with local NGN admissions disabled');
  const attemptId = started.data.attempt.id, saved = started.data.attempt.checkpoint.presentations;
  assert.equal(Boolean(saved), presentationCapable);
  const scopeKeys = bank.filter(k => k.bank_scope === (mode === 'remediation' ? 'remediation' : 'diagnostic'));
  const encoded = (id, answer) => saved?.[id] ? { version: presentation.VERSION, optionIds: answer.map(i => saved[id].ids[i]) } : answer;
  const mcqAnswer = (id, index) => saved?.[id]
    ? { version: presentation.VERSION, optionIds: [saved[id].ids[index]] }
    : index;
  let current = started.data.currentItemId, revision = 0, history = [], ability = 0.5, sataCount = 0, result;
  if (presentationCapable) {
    const cached = await api('/functions/v1/diagnostic-assessment', 'POST', { action: 'resume', assessmentKey: started.data.attempt.assessment_key }, user.token);
    assert.equal(cached.status, 409);
    const overwrite = await call({ action: 'checkpoint', attemptId, expectedRevision: revision,
      checkpoint: { presentations: {}, draft: { selected: [] } } });
    assert.equal(overwrite.status, 400);
  }
  while (current) {
    const item = scopeKeys.find(k => k.item_id === current);
    const children = item.item_type === 'casestudy' ? scopeKeys.filter(k => k.parent_item_id === current).sort((a, b) => a.sequence_order - b.sequence_order) : [item];
    const correct = history.length % 3 !== 1;
    const answers = Object.fromEntries(children.map(child => {
      const canonical = child.item_type === 'sata' ? correct ? child.correct_response : [counts[child.item_id] - 1] : correct ? [0] : [1];
      return [child.item_id,
        child.item_type === 'sata' || child.parent_item_id ? encoded(child.item_id, canonical)
          : child.item_type === 'mcq' ? mcqAnswer(child.item_id, canonical[0]) : canonical[0]];
    }));
    const draft = item.item_type === 'casestudy'
      ? { selected: [], csAnswers: Object.fromEntries(children.map(c => [c.item_id.split(':')[1], answers[c.item_id]])) }
      : { selected: item.item_type === 'sata' ? answers[current]
        : item.item_type === 'mcq' ? mcqAnswer(current, correct ? 0 : 1)
          : [correct ? 0 : 1], csAnswers: {} };
    const paused = await call({ action: 'checkpoint', attemptId, expectedRevision: revision, checkpoint: { draft } });
    assert.equal(paused.status, 200, JSON.stringify(paused));
    revision = paused.data.checkpointRevision;
    const resumed = await call({ action: 'resume', assessmentKey: started.data.attempt.assessment_key });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.data.currentItemId, current);
    assert.deepEqual(resumed.data.attempt.checkpoint.presentations, saved);
    if (item.item_type === 'sata') assert.deepEqual(resumed.data.attempt.checkpoint.draft.selected, correct ? item.correct_response : [counts[current] - 1]);
    if (presentationCapable && children.some(c => c.item_type === 'sata')) {
      const broken = item.item_type === 'sata' ? { answer: { version: presentation.VERSION, optionIds: ['foreign'] } }
        : { caseAnswers: { cs1a: { version: presentation.VERSION, optionIds: ['foreign'] }, cs1b: [0] } };
      const invalid = await call({ action: 'answer', attemptId, expectedRevision: revision, itemId: current, ...broken });
      assert.equal(invalid.status, 400);
    }
    const submitted = { action: 'answer', attemptId, expectedRevision: revision, itemId: current,
      ...(item.item_type === 'casestudy' ? { caseAnswers: draft.csAnswers } : { answer: answers[current] }) };
    result = await call(submitted);
    assert.equal(result.status, 200, JSON.stringify(result));
    for (const child of children) {
      if (child.item_type === 'sata') sataCount++;
      const raw = updateAbility(ability, correct, item.difficulty);
      ability = raw;
      history.push({ id: child.item_id, sourceId: item.item_id, difficulty: item.difficulty, blueprint: item.blueprint,
        nclex_category: item.nclex_category, core_tags: tags, correct });
    }
    const expectedAbility = Number(ability.toFixed(3));
    if (mode !== 'mock' || result.data.completed) assert.equal(result.data.abilityEstimate, expectedAbility);
    ability = expectedAbility;
    const stop = mode === 'nclex' ? shouldStop(history, ability, tags.map(key => ({ key }))) :
      mode === 'mock' ? shouldStopMock(history, ability, tags.map(key => ({ key }))) : null;
    if (stop) assert.equal(result.data.result, stop);
    if (!result.data.completed) {
      const original = Math.random;
      const eligible = new Set();
      try {
        for (const random of [0, 0.49, 0.99]) {
          Math.random = () => random;
          eligible.add(pickNextQuestion(scopeKeys.filter(k => k.selectable), history, profile, ability,
            tags.map(key => ({ key })), started.data.attempt.target_questions)?.item_id);
        }
      } finally { Math.random = original; }
      assert.ok(eligible.has(result.data.nextItemId), 'Option ordering must not change the original selection shortlist');
    }
    const duplicate = await call(submitted);
    assert.equal(duplicate.status, 409);
    revision = result.data.checkpointRevision;
    current = result.data.nextItemId;
  }
  const review = await call({ action: 'review', attemptId });
  assert.equal(review.status, 200);
  assert.equal(review.data.responses.length, history.length);
  for (const response of review.data.responses) {
    assert.equal(response.is_correct, history.find(h => h.id === response.item_id).correct);
    if (response.question_type === 'sata') assert.deepEqual(response.presentation, saved?.[response.item_id]);
    if (response.question_type === 'mcq' && saved?.[response.item_id]) {
      assert.deepEqual(response.presentation, saved[response.item_id], 'Historical MCQ review must retain its saved answer mapping.');
      assert.ok(response.rationale, 'Mapped MCQ review must retain its canonical rationale.');
    }
  }
  reports.push({ mode, client, sataCapable, mcqCapable, responses: history.length, sata: sataCount, passed: true });
}
const afterAttempts = new Map((await all('in_house_assessment_attempts')).map(row => [row.id, row]));
const afterRows = new Map((await all('in_house_assessment_item_responses')).map(row => [row.id, row]));
for (const row of beforeAttempts) assert.deepEqual(afterAttempts.get(row.id), row);
for (const row of beforeRows) assert.deepEqual(afterRows.get(row.id), row);
console.log(JSON.stringify({ reports, preservedPriorAttempts: beforeAttempts.length, preservedPriorResponses: beforeRows.length, localOnly: true }, null, 2));
