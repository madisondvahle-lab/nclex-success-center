import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(env.API_URL, 'http://127.0.0.1:54321', 'Refusing non-local Supabase integration test.');
assert.ok(env.ANON_KEY && env.SERVICE_ROLE_KEY, 'Supabase local credentials are required.');

async function api(path, method = 'GET', body, token = env.SERVICE_ROLE_KEY) {
  const url = new URL(path, env.API_URL);
  assert.equal(url.origin, env.API_URL, 'Integration requests must remain on the local Supabase instance.');
  const response = await fetch(url, {
    method,
    headers: {
      apikey: env.ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}

async function rpc(token, args) {
  const result = await api('/rest/v1/rpc/save_nur312_parallel_practice', 'POST', args, token);
  assert.ok(result.status < 300, JSON.stringify(result));
  return result.data;
}

const email = `mcq-local-${randomUUID()}@example.test`;
const password = `${randomUUID()}-Aa9!`;
const created = await api('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true });
assert.equal(created.status, 200, JSON.stringify(created));
const signed = await api('/auth/v1/token?grant_type=password', 'POST', { email, password }, env.ANON_KEY);
assert.equal(signed.status, 200, JSON.stringify(signed));
const token = signed.data.access_token;

const studentResult = await api('/rest/v1/students', 'POST', {
  name: 'Synthetic MCQ integration account',
  email,
  auth_user_id: created.data.id,
  portal_stage: 'active',
});
assert.ok(studentResult.status < 300, JSON.stringify(studentResult));
const student = Array.isArray(studentResult.data) ? studentResult.data[0] : studentResult.data;
const assignment = await api('/rest/v1/student_resources', 'POST', {
  student_id: student.id,
  url: 'nur312-exam2-parallel.html',
});
assert.ok(assignment.status < 300, JSON.stringify(assignment));

const bank = JSON.parse(readFileSync(new URL('../nur312-exam2-parallel-question-bank.json', import.meta.url), 'utf8'));
const sessionKey = randomUUID();
let attempt = await rpc(token, { p_action: 'start-mcq-order-v1', p_session_key: sessionKey });
assert.equal(attempt.status, 'in_progress');
assert.equal(attempt.checkpoint.schemaVersion, 2);
assert.equal(Object.keys(attempt.checkpoint.presentationOrders).length, bank.length);
assert.ok(Object.values(attempt.checkpoint.presentationOrders).every(order =>
  Array.isArray(order) && order.length === 4 && new Set(order).size === 4 &&
  order.every(value => Number.isInteger(value) && value >= 0 && value < 4)));

const presentationOrders = structuredClone(attempt.checkpoint.presentationOrders);
const attemptId = attempt.id;
let revision = attempt.checkpoint_revision;
const q0 = bank[0];
const q0Order = presentationOrders[q0.id];
const wrongDisplay = q0Order.findIndex(canonical => canonical !== q0.a);
let saved = await rpc(token, {
  p_action: 'answer-mcq-order-v1',
  p_attempt_id: attemptId,
  p_expected_revision: revision,
  p_item_id: q0.id,
  p_answer: wrongDisplay,
});
assert.equal(saved.totalQuestions, 1);
assert.equal(saved.correctQuestions, 0);
revision = saved.checkpointRevision;

const q1 = bank[1];
const q1Order = presentationOrders[q1.id];
const rightDisplay = q1Order.indexOf(q1.a);
saved = await rpc(token, {
  p_action: 'answer-mcq-order-v1',
  p_attempt_id: attemptId,
  p_expected_revision: revision,
  p_item_id: q1.id,
  p_answer: rightDisplay,
});
assert.equal(saved.totalQuestions, 2);
assert.equal(saved.correctQuestions, 1);
revision = saved.checkpointRevision;

const resumed = await rpc(token, { p_action: 'start-mcq-order-v1', p_session_key: sessionKey });
assert.equal(resumed.id, attemptId);
assert.equal(resumed.checkpoint_revision, revision);
assert.deepEqual(resumed.checkpoint.presentationOrders, presentationOrders);
assert.equal(resumed.responses.length, 2);
assert.deepEqual(
  resumed.responses.map(response => response.selected_answer),
  [q0Order[wrongDisplay], q1.a],
  'The server stores canonical indexes after mapped answers are submitted.',
);

const resumedFromAnotherTab = await rpc(token, {
  p_action: 'start-mcq-order-v1',
  p_session_key: randomUUID(),
});
assert.equal(resumedFromAnotherTab.id, attemptId, 'The latest active attempt remains resumable without its original tab key.');
assert.deepEqual(resumedFromAnotherTab.checkpoint.presentationOrders, presentationOrders);

for (let index = 2; index < bank.length; index++) {
  const question = bank[index];
  const order = presentationOrders[question.id];
  const response = await rpc(token, {
    p_action: 'answer-mcq-order-v1',
    p_attempt_id: attemptId,
    p_expected_revision: revision,
    p_item_id: question.id,
    p_answer: order.indexOf(question.a),
  });
  assert.equal(response.totalQuestions, index + 1);
  assert.equal(response.correctQuestions, index);
  revision = response.checkpointRevision;
}

const finished = await rpc(token, { p_action: 'finish', p_attempt_id: attemptId });
assert.equal(finished.totalQuestions, bank.length);
assert.equal(finished.correctQuestions, bank.length - 1);
const completed = await rpc(token, { p_action: 'start-mcq-order-v1', p_session_key: sessionKey });
assert.equal(completed.status, 'completed');
assert.deepEqual(completed.checkpoint.presentationOrders, presentationOrders);
assert.equal(completed.responses.length, bank.length);

const legacySessionKey = randomUUID();
const legacyAttempt = await rpc(token, { p_action: 'start', p_session_key: legacySessionKey });
assert.ok(legacyAttempt.id);
const legacyQuestion = bank[0];
const legacyAnswer = await rpc(token, {
  p_action: 'answer',
  p_attempt_id: legacyAttempt.id,
  p_expected_revision: legacyAttempt.checkpoint_revision,
  p_item_id: legacyQuestion.id,
  p_answer: legacyQuestion.a,
});
assert.equal(legacyAnswer.correctQuestions, 1, 'Legacy numeric canonical answers remain accepted.');

console.log(JSON.stringify({
  localSupabaseOnly: true,
  authenticatedSyntheticUser: true,
  questionCount: bank.length,
  mappedScoring: '115/116 with canonical response persistence',
  restoredPresentation: true,
  crossTabResume: true,
  completedHistoryRestore: true,
  legacyNumericCompatibility: true,
  noProductionDataTouched: true,
}, null, 2));
