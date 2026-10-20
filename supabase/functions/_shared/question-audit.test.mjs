import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  autoFixContent, compareVerification, contentHash, prioritize, screenDeterministic,
  snapshotContent, syncScoring, validateContent,
} from './question-audit-core.mjs';

const mcq = (overrides = {}) => snapshotContent({
  stem: 'A client receiving heparin has new epistaxis and bruising. Which action should the nurse take first?',
  option_a: 'Review the most recent aPTT result',
  option_b: 'Apply ice to the forehead',
  option_c: 'Increase the infusion rate',
  option_d: 'Encourage fluids',
  correct_answer: 'a',
  rationale: 'Bleeding on heparin requires checking coagulation status before the next dose or rate decision is made.',
  difficulty: 'medium', topic: 'Anticoagulants', nclex_category: 'Pharmacological Therapies', clinical_judgment_skill: 'Analyze cues',
  option_rationales: { a: 'a', b: 'b', c: 'c', d: 'd' }, reference_list: [], item_type: 'mcq',
  ...overrides,
});
const sata = (overrides = {}) => snapshotContent({
  stem: 'Which findings indicate a complication? Select all that apply.', rationale: 'Because.', difficulty: 'hard', topic: 'T', nclex_category: 'C',
  clinical_judgment_skill: 'x', item_type: 'sata', is_ngn: true,
  item_data: { correct: [0, 2], options: ['One', 'Two', 'Three', 'Four', 'Five'] },
  option_rationales: { 0: 'a', 1: 'b', 2: 'c', 3: 'd', 4: 'e' }, reference_list: [],
  ...overrides,
});
const errors = content => validateContent(content).filter(issue => issue.severity === 'error');

test('snapshot matches the keys compared by apply_question_revision', () => {
  assert.deepEqual(Object.keys(mcq()).sort(), [
    'clinical_judgment_skill', 'correct_answer', 'difficulty', 'is_ngn', 'item_data', 'item_type', 'module_key', 'nclex_category',
    'nclex_sub', 'option_a', 'option_b', 'option_c', 'option_d', 'option_rationales', 'rationale', 'reference_list', 'stem', 'topic',
  ]);
});

test('content hash is stable, key-order independent, and changes with content', () => {
  const a = mcq();
  const reordered = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(contentHash(a), contentHash(reordered));
  assert.notEqual(contentHash(a), contentHash(mcq({ option_b: 'Apply ice' })));
});

test('valid MCQ and SATA items have no structural errors', () => {
  assert.deepEqual(errors(mcq()), []);
  assert.deepEqual(errors(sata()), []);
});

test('MCQ validation reports field-specific errors', () => {
  assert.equal(errors(mcq({ correct_answer: 'e' }))[0].field, 'correct_answer');
  assert.equal(errors(mcq({ option_c: '  ' }))[0].field, 'option_c');
  assert.ok(errors(mcq({ option_d: 'review the most recent aPTT result' })).some(issue => issue.field === 'option_d'));
  assert.ok(errors(mcq({ option_rationales: { a: 'x', e: 'y' } })).some(issue => issue.field === 'option_rationales.e'));
  assert.ok(errors(mcq({ option_rationales: [] })).some(issue => issue.field === 'option_rationales'));
});

test('options that differ only by a symbol are not duplicates', () => {
  const rh = mcq({ option_a: 'Rh+ mother / Rh\u2013 baby', option_b: 'Rh\u2013 mother / Rh+ baby', option_c: 'Rh+ mother / Rh+ baby', option_d: 'Rh\u2013 mother / Rh\u2013 baby' });
  assert.deepEqual(errors(rh), []);
  assert.ok(errors(mcq({ option_d: 'Review the most recent aPTT result.' })).length === 0);
});

test('SATA validation catches stale or invalid scoring metadata', () => {
  assert.ok(errors(sata({ item_data: { correct: [0, 9], options: ['a', 'b', 'c', 'd', 'e'] } })).some(issue => issue.field === 'item_data.correct'));
  assert.ok(errors(sata({ item_data: { correct: [], options: ['a', 'b', 'c', 'd'] } })).some(issue => issue.field === 'item_data.correct'));
  assert.ok(errors(sata({ item_data: { correct: [1, 1], options: ['a', 'b', 'c', 'd'] } })).some(issue => issue.message.includes('duplicates')));
  assert.ok(errors(sata({ item_data: { correct: [0], options: ['a', 'b', 'c'] } })).some(issue => issue.field === 'item_data.options'));
  assert.ok(errors(sata({ item_data: null })).some(issue => issue.field === 'item_data'));
  assert.ok(errors(sata({ option_rationales: { 0: 'a', 7: 'b' } })).some(issue => issue.field === 'option_rationales.7'));
});

test('missing rationales are advisory for originals and blocking for revisions', () => {
  const content = mcq({ option_rationales: {} });
  assert.deepEqual(errors(content), []);
  assert.equal(validateContent(content, { requireRationales: true }).filter(issue => issue.severity === 'error').length, 4);
});

test('legacy bare-URL references warn instead of blocking', () => {
  const issues = validateContent(mcq({ reference_list: ['https://example.org/x'] }));
  assert.equal(issues.find(issue => issue.field === 'reference_list').severity, 'warning');
  assert.equal(validateContent(mcq({ reference_list: [{ title: '', url: 'nope' }] })).find(issue => issue.field === 'reference_list').severity, 'error');
});

test('syncScoring realigns SATA metadata without inventing a key', () => {
  const next = syncScoring(sata({ item_data: { correct: [2, 0, 2], options: [' One ', 'Two', 'Three', 'Four'] } }));
  assert.deepEqual(next.item_data, { correct: [0, 2], options: ['One', 'Two', 'Three', 'Four'] });
});

test('syncScoring leaves MCQ item_data null and rebuilds it when present', () => {
  assert.equal(syncScoring(mcq()).item_data, null);
  const next = syncScoring(mcq({ item_data: { options: ['stale'], correct: [3] } }));
  assert.deepEqual(next.item_data.correct, [0]);
  assert.equal(next.item_data.options[0], 'Review the most recent aPTT result');
});

test('autoFix changes whitespace only', () => {
  const { content, changes } = autoFixContent(mcq({ stem: '  A  client  with   pain. ', option_a: 'Review\t ' }));
  assert.equal(content.stem, 'A client with pain.');
  assert.equal(content.option_a, 'Review');
  assert.deepEqual(changes.sort(), ['option_a', 'stem']);
  assert.deepEqual(autoFixContent(mcq()).changes, []);
});

test('deterministic screen flags answer-choice clues', () => {
  const weak = mcq({
    option_a: 'Immediately assess airway patency to prevent further deterioration of the client',
    option_b: 'Ignore it', option_c: 'Never reposition', option_d: 'Reassure the client',
  });
  const codes = screenDeterministic(weak).signals.map(signal => signal.code);
  for (const code of ['key_longer', 'coaching_phrase', 'generic_option', 'absolute_distractors', 'very_short_option']) assert.ok(codes.includes(code), code);
  assert.equal(screenDeterministic(sata({ item_type: 'matrix' })).supported, false);
});

test('prioritization follows the requested order', () => {
  const q = { active: true };
  assert.equal(prioritize({ question: q, openFlags: 1 }).priority, 1);
  assert.equal(prioritize({ question: q, anyFlags: 1 }).priority, 1);
  assert.equal(prioritize({ question: q, structuralErrors: 1 }).priority, 2);
  assert.equal(prioritize({ question: q, score: 5 }).priority, 3);
  assert.equal(prioritize({ question: q }).priority, 4);
  assert.equal(prioritize({ question: { active: false } }).priority, 5);
});

test('verification must match the key and raise no concerns', () => {
  const content = mcq();
  assert.equal(compareVerification(content, { answer: [0], multiple_defensible: false }).agrees, true);
  assert.equal(compareVerification(content, { answer: [1] }).agrees, false);
  assert.equal(compareVerification(content, { answer: [0], multiple_defensible: true }).agrees, false);
  assert.equal(compareVerification(sata(), { answer: [2, 0] }).agrees, true);
  assert.equal(compareVerification(sata(), { answer: [0] }).agrees, false);
});
