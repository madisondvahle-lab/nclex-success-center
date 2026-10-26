import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { approvedQuestionKey, publicApprovedQuestion } from './cat-approved-question-bank.mjs';
import { canonicalAnswer, newPresentations } from './sata-presentation.mjs';
import { pickNextQuestion } from './diagnostic-assessment-engine.mjs';
import { publicCheckpoint } from './diagnostic-ngn.mjs';

const mcq = overrides => ({
  id: '7d0f45c0-6a0e-4fe1-8cce-897fa7800c10',
  active: true,
  item_type: 'mcq',
  stem: 'A reviewed clinical application question?',
  option_a: 'First',
  option_b: 'Second',
  option_c: 'Third',
  option_d: 'Fourth',
  correct_answer: 'b',
  rationale: 'Rationale reviewed by the tutor.',
  topic: 'Safety',
  difficulty: 'medium',
  nclex_category: 'Safety and Infection Control',
  reviewed_cognitive_demand: 'application',
  ...overrides,
});

test('maps approved MCQ fields into the existing CAT key shape', () => {
  const key = approvedQuestionKey(mcq({}));
  assert.equal(key.item_id, 'qbank:7d0f45c0-6a0e-4fe1-8cce-897fa7800c10');
  assert.equal(key.item_source, 'main-question-bank-cat-approved');
  assert.equal(key.category, 'Safety & Infection Prevention');
  assert.equal(key.blueprint, 'Safe & Effective Care Environment');
  assert.equal(key.difficulty, 2);
  assert.deepEqual(key.correct_response, [1]);
  assert.deepEqual(key.core_tags, []);
  const saved = newPresentations([key], true);
  const answer = canonicalAnswer(saved, key.item_id, {
    version: saved[key.item_id].version,
    optionIds: [saved[key.item_id].ids[1]],
  });
  assert.equal(answer[0], key.correct_response[0]);
  const selected = pickNextQuestion([key], [], { mode: 'practice' }, 0.5, [], 30);
  assert.equal(selected.item_id, key.item_id);
});

test('maps approved SATA indexes and uses its actual option count for saved presentations', () => {
  const key = approvedQuestionKey(mcq({
    id: '2716f89a-6101-489c-9e84-cc4bc6cb246b',
    item_type: 'sata',
    item_data: { options: ['One', 'Two', 'Three', 'Four', 'Five'], correct: [0, 3] },
  }));
  assert.deepEqual(key.correct_response, [0, 3]);
  assert.equal(key.option_count, 5);
  const saved = newPresentations([key]);
  assert.equal(saved[key.item_id].order.length, 5);
  const answer = canonicalAnswer(saved, key.item_id, {
    version: saved[key.item_id].version,
    optionIds: [saved[key.item_id].ids[0], saved[key.item_id].ids[3]],
  });
  assert.deepEqual(answer, key.correct_response);
});

test('rejects unsupported, malformed, or unclassified question content', () => {
  assert.equal(approvedQuestionKey(mcq({ item_type: 'bowtie' })), null);
  assert.equal(approvedQuestionKey(mcq({ item_data: { schemaVersion: 1 } })), null);
  assert.equal(approvedQuestionKey(mcq({ item_data: { schemaVersion: 2 } })), null);
  assert.equal(approvedQuestionKey(mcq({ reviewed_cognitive_demand: null })), null);
  assert.equal(approvedQuestionKey(mcq({ nclex_category: 'Unknown category' })), null);
  assert.equal(approvedQuestionKey(mcq({ difficulty: 'unreviewed' })), null);
  assert.equal(approvedQuestionKey(mcq({ correct_answer: 'z' })), null);
  assert.equal(approvedQuestionKey(mcq({ rationale: '' })), null);
  assert.equal(approvedQuestionKey(mcq({
    item_type: 'sata',
    item_data: { options: ['One', 'Two'], correct: [0, 0] },
  })), null);
});

test('student-facing approved question never includes the key or rationale', () => {
  const key = approvedQuestionKey(mcq({}));
  const studentQuestion = publicApprovedQuestion(key, {});
  assert.deepEqual(studentQuestion.options, ['First', 'Second', 'Third', 'Fourth']);
  assert.equal(studentQuestion.id, key.item_id);
  assert.equal(Object.hasOwn(studentQuestion, 'correct_response'), false);
  assert.equal(Object.hasOwn(studentQuestion, 'rationale'), false);
  const checkpoint = publicCheckpoint({ currentItemId: key.item_id, catCurrentItemKey: key });
  assert.equal(Object.hasOwn(checkpoint, 'catCurrentItemKey'), false);
  assert.equal(checkpoint.currentItemId, key.item_id);
});

test('approval database functions are admin-gated and service-role-only for CAT key reads', () => {
  const sql = readFileSync(new URL('../../../supabase-question-cat-approval.sql', import.meta.url), 'utf8');
  assert.match(sql, /if not public\.is_app_admin\(\) then/i);
  assert.match(sql, /p_confirmed_clinical_review is not true/i);
  assert.match(sql, /create policy "admins read CAT question approvals"[\s\S]*?using \(public\.is_app_admin\(\)\)/i);
  assert.match(sql, /revoke all on function public\.get_cat_approved_questions\(\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.get_cat_approved_questions\(\) to service_role/i);
});
