const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const helper = readFileSync(join(root, 'question-bank-selection.js'), 'utf8');
const page = readFileSync(join(root, 'supplemental-practice.html'), 'utf8');

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
