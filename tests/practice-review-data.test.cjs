const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const helper = readFileSync(join(root, 'practice-review-data.js'), 'utf8');
const page = readFileSync(join(root, 'shared-progress.html'), 'utf8');

function normalize(details) {
  const context = { window: {} };
  vm.runInNewContext(helper, context);
  return context.window.PracticeReviewData.normalize(details);
}

test('saved practice-result fields normalize to the progress-review field names', () => {
  const [item] = normalize([{
    question_id: 'q1',
    selected_answer: 'a',
    correct_answer: 'a',
    correct: true
  }]);
  assert.equal(item.id, 'q1');
  assert.equal(item.selected, 'a');
  assert.equal(item.correct, 'a');
  assert.equal(item.is_correct, true);
});

test('legacy review rows derive correctness from selected and correct answers', () => {
  const items = normalize([
    { question_id: 'q1', selected_answer: 1, correct_answer: 1 },
    { question_id: 'q2', selected_answer: 0, correct_answer: 1 },
    { question_id: 'q3', selected_answer: [1, 2], correct_answer: [2, 1] }
  ]);
  assert.deepEqual(items.map(item => item.is_correct), [true, false, true]);
});

test('correct practice records display zero missed questions', () => {
  const [item] = normalize([{ question_id: 'q1', selected_answer: 'b', correct_answer: 'b', correct: true }]);
  const missCount = [item].filter(detail => !detail.is_correct).length;
  assert.equal(missCount, 0);
  assert.match(page, /answerDetails:PracticeReviewData\.normalize\(item\.answer_details\)/);
  for (const script of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(script[1]);
  }
});
