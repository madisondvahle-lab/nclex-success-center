const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = name => readFileSync(join(__dirname, '..', name), 'utf8');
const bank = JSON.parse(read('bianca-nur235-test2-2026-v2-bank.json'));
const page = read('bianca-nur235-test2-2026-v2.html');
const questions = bank.questions;

test('version 2 bank preserves all 100 question IDs and MCQ/SATA distribution', () => {
  assert.equal(bank.bank_id, 'bianca-nur235-test2-2026-v2');
  assert.equal(bank.version, '2.0.0');
  assert.equal(questions.length, 100);
  assert.deepEqual(
    questions.map(question => question.id),
    Array.from({ length: 100 }, (_, index) => `NUR235-T2-${String(index + 1).padStart(3, '0')}`)
  );
  assert.equal(questions.filter(question => question.type === 'single_select').length, 70);
  assert.equal(questions.filter(question => question.type === 'sata').length, 30);
  assert.deepEqual(bank.counts.by_type, { single_select: 70, sata: 30 });
  assert.deepEqual(
    Object.fromEntries(['moderate', 'challenging'].map(difficulty => [
      difficulty,
      questions.filter(question => question.difficulty === difficulty).length,
    ])),
    bank.counts.by_difficulty
  );
});

test('all keys and rationales map to the displayed options', () => {
  for (const question of questions) {
    const optionIds = question.options.map(option => option.id);
    assert.ok(optionIds.length >= 4 && optionIds.length <= 5, question.id);
    assert.equal(new Set(optionIds).size, optionIds.length, `${question.id} has duplicate option IDs`);
    assert.ok(question.correct_answers.length > 0, `${question.id} has no key`);
    assert.equal(new Set(question.correct_answers).size, question.correct_answers.length, `${question.id} repeats a keyed option`);
    assert.ok(question.correct_answers.every(id => optionIds.includes(id)), `${question.id} has an invalid keyed option`);
    assert.equal(
      question.type === 'single_select' ? question.correct_answers.length === 1 : question.correct_answers.length >= 2,
      true,
      `${question.id} has the wrong number of keyed answers`
    );
    assert.ok(question.correct_rationale.trim(), `${question.id} has no correct-answer rationale`);
    assert.ok(question.exam_strategy.trim(), `${question.id} has no clinical reasoning guidance`);
    assert.deepEqual(
      Object.keys(question.option_rationales).sort(),
      [...optionIds].sort(),
      `${question.id} does not explain every option`
    );
    assert.ok(Object.values(question.option_rationales).every(rationale => rationale.trim()), `${question.id} has a blank option rationale`);
  }
});

test('shared scoring accepts keyed answers and rejects incorrect, incomplete, or extra answers', () => {
  const context = {};
  vm.runInNewContext(read('ngn-scoring.js'), context);
  const scoring = context.NGNScoring;

  for (const question of questions) {
    const optionIds = question.options.map(option => option.id);
    const item = {
      type: question.type === 'sata' ? 'sata' : 'mcq',
      options: question.options.map(option => option.text),
      correct: question.correct_answers.map(id => optionIds.indexOf(id)),
    };
    const keyed = item.type === 'mcq' ? item.correct[0] : item.correct.slice();
    assert.equal(scoring.score(item, keyed).full, true, `${question.id} rejects its key`);
    if (item.type === 'mcq') {
      assert.equal(scoring.score(item, (keyed + 1) % item.options.length).full, false, `${question.id} accepts a wrong answer`);
    } else {
      assert.equal(scoring.score(item, keyed.slice(1)).full, false, `${question.id} accepts an incomplete set`);
      const extra = item.options.findIndex((_, index) => !item.correct.includes(index));
      assert.notEqual(extra, -1, `${question.id} has no distractor to test`);
      assert.equal(scoring.score(item, [...keyed, extra]).full, false, `${question.id} accepts an extra answer`);
    }
  }
});

test('versioned page loads the v2 bank, defaults to all matches, and isolates saved results', () => {
  assert.match(page, /fetch\('bianca-nur235-test2-2026-v2-bank\.json'/);
  assert.match(page, /practice_key:'bianca-nur235-test2-2026-v2'/);
  assert.match(page, /practice_title:'NUR 235 Test 2 Revised Practice Exam'/);
  assert.match(page, /\$\('count'\)\.value=opts\.map\(String\)\.includes\(keep\)\?keep:String\(n\)/);
  assert.match(page, /correct:q\.correct_answers\.map\(a=>ids\.indexOf\(a\)\)/);
  assert.match(page, /q\.option_rationales\[o\.id\]/);
  assert.match(page, /instant:tutor/);
  assert.match(page, /ExamUI\.reviewHtml/);
  assert.doesNotMatch(page, /bianca-nur235-test2-bank\.json|bianca-nur235-test2-100/);
});

test('Q047 keeps its corrected observation key', () => {
  const question = questions.find(item => item.id === 'NUR235-T2-047');
  assert.ok(question);
  assert.deepEqual(question.correct_answers, ['A', 'B', 'C']);
});
