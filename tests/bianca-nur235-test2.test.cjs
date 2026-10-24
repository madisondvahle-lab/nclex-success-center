const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = name => readFileSync(join(__dirname, '..', name), 'utf8');
const bank = JSON.parse(read('bianca-nur235-test2-bank.json'));
const questions = bank.questions;

test('NUR 235 Test 2 bank contains 100 grouped, unique questions with the declared distribution', () => {
  assert.equal(questions.length, 100);
  assert.equal(new Set(questions.map(question => question.id)).size, 100);
  assert.deepEqual(
    questions.map(question => question.id),
    Array.from({ length: 100 }, (_, index) => `NUR235-T2-${String(index + 1).padStart(3, '0')}`)
  );

  const counts = (field, values) => Object.fromEntries(values.map(value => [
    value,
    questions.filter(question => question[field] === value).length,
  ]));
  assert.deepEqual(counts('category', Object.keys(bank.counts.by_category)), bank.counts.by_category);
  assert.deepEqual(counts('type', Object.keys(bank.counts.by_type)), bank.counts.by_type);
  assert.deepEqual(counts('difficulty', Object.keys(bank.counts.by_difficulty)), bank.counts.by_difficulty);

  let previousCategory = -1;
  const categories = Object.keys(bank.counts.by_category);
  for (const question of questions) {
    const category = categories.indexOf(question.category);
    assert.ok(category >= previousCategory, `${question.id} is outside the topic grouping`);
    previousCategory = category;
  }
  for (const category of categories) {
    const group = questions.filter(question => question.category === category);
    assert.equal(group.length, 20);
    assert.deepEqual(group.slice(0, 5).map(question => question.difficulty), Array(5).fill('moderate'));
    assert.deepEqual(group.slice(5).map(question => question.difficulty), Array(15).fill('challenging'));
  }
});

test('every answer key and option rationale maps to the options shown to the student', () => {
  const sourceIds = new Set(Object.keys(bank.sources));
  for (const question of questions) {
    const optionIds = question.options.map(option => option.id);
    assert.ok(optionIds.length >= 4 && optionIds.length <= 5, question.id);
    assert.equal(new Set(optionIds).size, optionIds.length, `${question.id} has duplicate option IDs`);
    assert.ok(question.correct_answers.length > 0, `${question.id} has no answer key`);
    assert.ok(question.correct_answers.every(id => optionIds.includes(id)), `${question.id} has an invalid answer key`);
    assert.equal(new Set(question.correct_answers).size, question.correct_answers.length, `${question.id} repeats a keyed answer`);
    assert.ok(question.type === 'single_select' || question.type === 'sata', `${question.id} has an unsupported type`);
    assert.equal(
      question.type === 'single_select'
        ? question.correct_answers.length === 1
        : question.correct_answers.length >= 2,
      true,
      question.id
    );
    assert.ok(question.correct_rationale.trim(), `${question.id} has no correct-answer rationale`);
    assert.ok(question.exam_strategy.trim(), `${question.id} has no assessment guidance`);
    assert.deepEqual(
      Object.keys(question.option_rationales).sort(),
      [...optionIds].sort(),
      `${question.id} does not explain every option`
    );
    assert.ok(Object.values(question.option_rationales).every(rationale => rationale.trim()), `${question.id} has a blank option rationale`);
    assert.ok(question.source_refs.length > 0, `${question.id} has no lecture reference`);
    assert.ok(question.source_refs.every(reference => sourceIds.has(reference.source_id)), `${question.id} has an invalid source reference`);
  }
});

test('shared scorer awards full credit only for the keyed single-select or exact SATA answer set', () => {
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
    const answer = item.type === 'mcq' ? item.correct[0] : item.correct.slice();
    assert.equal(scoring.score(item, answer).full, true, `${question.id} rejects its keyed answer`);
    if (item.type === 'mcq') {
      assert.equal(scoring.score(item, (answer + 1) % item.options.length).full, false, `${question.id} accepts a wrong answer`);
    } else {
      assert.equal(scoring.score(item, answer.slice(1)).full, false, `${question.id} accepts an incomplete SATA set`);
      const extra = item.options.findIndex((_, index) => !item.correct.includes(index));
      assert.equal(scoring.score(item, [...answer, extra]).full, false, `${question.id} accepts an extra SATA choice`);
    }
  }
});

test('new practice page and idempotent dashboard resource are separate from NUR 215', () => {
  const html = read('bianca-nur235-test2.html');
  const sql = read('supabase-bianca-nur235-test2-resource.sql');
  const dashboard = read('student-dashboard.html');

  assert.match(html, /bianca-nur235-test2-bank\.json/);
  assert.match(html, /bianca-nur235-test2-100/);
  assert.match(html, /qid:q\.id/);
  assert.match(html, /ExamUI\.score/);
  assert.match(html, /ExamUI\.reviewHtml/);
  assert.doesNotMatch(html, /bianca-nur215|NUR 215/);
  assert.match(sql, /'practice_set'/);
  assert.match(sql, /'bianca-nur235-test2\.html'/);
  assert.match(sql, /not exists/i);
  assert.match(sql, /bianca\.edwards86@gmail\.com/);
  assert.match(dashboard, /NUR 235\|nur235/);
});

test('slide review records identified inaccuracies and qualifications', () => {
  assert.ok(bank.slide_review.length >= 8);
  assert.ok(bank.slide_review.some(note => note.source_id === 'EYES' && /chalazion/i.test(note.issue)));
  assert.ok(bank.slide_review.some(note => note.source_id === 'ENMT' && /Weber/i.test(note.issue)));
  assert.ok(bank.slide_review.some(note => note.source_id === 'RESP' && /mechanical ventilation/i.test(note.issue)));
});
