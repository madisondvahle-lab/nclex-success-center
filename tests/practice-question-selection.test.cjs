const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const helper = readFileSync(join(root, 'question-bank-selection.js'), 'utf8');
const page = readFileSync(join(root, 'supplemental-practice.html'), 'utf8');
const migration = readFileSync(join(root, 'supabase-legacy-practice-sets-qbank-migration.sql'), 'utf8');

function selection() {
  const context = { window: {} };
  vm.runInNewContext(helper, context);
  return context.window.PracticeQuestionSelection;
}

test('medium and hard is the builder default, with selectable alternatives', () => {
  const api = selection();
  const questions = [
    { id: 'easy', difficulty: 'easy' },
    { id: 'medium', difficulty: 'medium' },
    { id: 'hard', difficulty: 'hard' }
  ];
  assert.deepEqual(api.filter(questions, { difficulty: 'medium-hard' }).map(item => item.id), ['medium', 'hard']);
  assert.deepEqual(api.filter(questions, { difficulty: 'all' }).map(item => item.id), ['easy', 'medium', 'hard']);
  assert.deepEqual(api.filter(questions, { difficulty: 'easy' }).map(item => item.id), ['easy']);
  assert.match(page, /<option value="medium-hard" selected>Medium \+ Hard<\/option>/);
});

test('category and topic filters intersect instead of widening the selected pool', () => {
  const api = selection();
  const questions = [
    { id: 'match', nclexCategory: 'physiological', topic: 'Heart Failure', difficulty: 'hard' },
    { id: 'other-topic', nclexCategory: 'physiological', topic: 'Asthma', difficulty: 'hard' },
    { id: 'other-category', nclexCategory: 'psychosocial', topic: 'Heart Failure', difficulty: 'hard' },
    { id: 'easy', nclexCategory: 'physiological', topic: 'Heart Failure', difficulty: 'easy' }
  ];
  assert.deepEqual(
    api.filter(questions, {
      categories: ['physiological'],
      topics: ['Heart Failure'],
      difficulty: 'medium-hard'
    }).map(item => item.id),
    ['match']
  );
});

test('student builder inventory and question query are limited to active MCQs', () => {
  assert.match(page, /loadQuestionCatalog[\s\S]*?\.eq\('active',true\)\.eq\('item_type','mcq'\)/);
  assert.match(page, /\.eq\('active',true\)\s*\.eq\('item_type','mcq'\)/);
  for (const script of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script[1]);
  }
});

test('assigned legacy practice sets load their questions from the master bank', () => {
  for (const id of ['safety-priority-01', 'med-procedure-01', 'ngn-acute-01']) {
    assert.match(page, new RegExp(`id:'${id}'.*questionSource:'question-bank'`));
  }
  assert.match(page, /id:'nur215-foundations-practice'.*questionSource:'question-bank'/);
  assert.match(page, /db\.from\('question_set_items'\)[\s\S]*?question:questions!inner/);
  assert.match(page, /Assigned sets & materials/);
  for (const legacyId of ['sp01-q01', 'mp01-q01', 'ng01-q01', 'nur215-001']) {
    assert.doesNotMatch(page, new RegExp(legacyId));
  }
});

test('question-bank migration preserves all four legacy sets and supported item types', () => {
  const match = migration.match(/\$legacy_questions\$\n([\s\S]*?)\n\$legacy_questions\$::jsonb/);
  assert.ok(match, 'migration includes its JSON question payload');
  const questions = JSON.parse(match[1]);
  const counts = questions.reduce((grouped, question) => {
    (grouped[question.set_key] ||= []).push(question);
    return grouped;
  }, {});
  assert.deepEqual(
    Object.fromEntries(Object.entries(counts).map(([key, items]) => [key, items.length])),
    {
      'safety-priority-01': 5,
      'med-procedure-01': 5,
      'ngn-acute-01': 5,
      'nur215-foundations-practice': 60
    }
  );
  assert.equal(questions.length, 75);
  assert.equal(questions.filter(question => question.item_type === 'mcq').length, 66);
  assert.equal(questions.filter(question => question.item_type === 'sata').length, 9);
  assert.equal(new Set(questions.map(question => `${question.set_key}:${question.legacy_id}`)).size, 75);
  for (const question of questions) {
    assert.ok(question.stem);
    assert.ok(question.rationale);
    assert.ok(Array.isArray(question.options) && question.options.length >= 4);
    assert.ok(Array.isArray(question.correct) && question.correct.length);
    assert.ok(question.position > 0);
  }
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ON CONFLICT \(set_key, legacy_id\)/);
  assert.match(migration, /question_bank.*IS TRUE|q\.active IS TRUE/);
  assert.match(migration, /SET active = TRUE,[\s\S]*?source_key = COALESCE/);
  assert.match(migration, /q\.rationale IS DISTINCT FROM item\.rationale/);
  assert.match(migration, /different rationale; resolve the content before migrating/);
  assert.match(migration, /CREATE TEMP TABLE legacy_practice_items AS/);
  assert.doesNotMatch(migration, /CREATE TEMP TABLE legacy_practice_items ON COMMIT DROP/);
  assert.match(migration, /DO \$\$[\s\S]*?CREATE TEMP TABLE legacy_practice_items AS[\s\S]*?DROP TABLE legacy_practice_items;\s+END \$\$;\s+COMMIT;/);
});

test('QBank-backed practice preserves legacy IDs and SATA answer indexes', async () => {
  const payload = migration.match(/\$legacy_questions\$\n([\s\S]*?)\n\$legacy_questions\$::jsonb/);
  const items = JSON.parse(payload[1]).filter(item => item.set_key === 'nur215-foundations-practice');
  const records = items.map(item => ({
    legacy_id: item.legacy_id,
    question: {
      id: `db-${item.position}`,
      question_no: item.position,
      stem: item.stem,
      option_a: item.item_type === 'mcq' ? item.options[0] : null,
      option_b: item.item_type === 'mcq' ? item.options[1] : null,
      option_c: item.item_type === 'mcq' ? item.options[2] : null,
      option_d: item.item_type === 'mcq' ? item.options[3] : null,
      correct_answer: item.item_type === 'mcq' ? 'abcd'[item.correct[0]] : null,
      rationale: item.rationale,
      topic: item.topic,
      difficulty: item.difficulty,
      item_type: item.item_type,
      item_data: item.item_type === 'sata' ? { options: item.options, correct: item.correct } : null
    }
  }));
  const query = {
    select() { return this; },
    eq(field, value) { assert.equal(field, 'set_key'); assert.equal(value, 'nur215-foundations-practice'); return this; },
    order(field) { assert.equal(field, 'position'); return Promise.resolve({ data: records, error: null }); }
  };
  const loaderSource = page.match(/async function loadQuestionBankSet\(set\)\{[\s\S]*?\n    \}/);
  assert.ok(loaderSource, 'page contains the Question Bank set loader');
  const loadSet = vm.runInNewContext(`(${loaderSource[0]})`, {
    db: { from(table) { assert.equal(table, 'question_set_items'); return query; } }
  });
  const questions = await loadSet({ id: 'nur215-foundations-practice', questionCount: 60, title: 'NUR 215 Foundations Practice' });
  assert.equal(questions.length, 60);
  assert.equal(questions[0].id, 'nur215-001');
  assert.equal(questions.at(-1).id, 'nur215-060');
  const sata = questions.find(question => Array.isArray(question.answer));
  const sataItem = items.find(item => item.item_type === 'sata');
  assert.equal(sata.id, sataItem.legacy_id);
  assert.equal(sata.options.length, sataItem.options.length);
  assert.deepEqual(Array.from(sata.answer), sataItem.correct);
});
