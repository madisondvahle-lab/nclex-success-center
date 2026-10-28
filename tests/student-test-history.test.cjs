const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = join(__dirname, '..');
const context = { console, crypto: webcrypto, structuredClone };
context.window = context;
context.document = { querySelector: () => ({ content: 'sata-order-v1' }) };
for (const file of ['option-presentation.js', 'ngn-scoring.js', 'exam-ui-ngn.js', 'practice-review-data.js', 'assessment-display.js', 'student-test-history.js']) {
  vm.runInNewContext(readFileSync(join(root, file), 'utf8'), context, { filename: file });
}
const { detailRows, summary, questionHtml } = context.StudentTestHistory;
const plain = value => JSON.parse(JSON.stringify(value));

test('saved zero-index answers, SATA, omissions and legacy flags keep their meaning', () => {
  const rows = detailRows([
    { selected_answer: 0, correct_answer: 0, correct: true },
    { selected_answer: [2, 0], correct_answer: [0, 2] },
    { selected_answer: 1, correct_answer: 0, correct: false },
    { selected_answer: [], correct_answer: [0] },
    { selected_answer: null, correct_answer: 0 },
    { correct: false },
    { question_id: 'old-summary-only' }
  ]);
  assert.deepEqual(plain(rows.map(row => row.status)), ['correct', 'correct', 'incorrect', 'omitted', 'omitted', 'incorrect', 'unknown']);
  assert.deepEqual(plain(summary(rows).counts), { correct: 2, incorrect: 2, partial: 0, omitted: 2, unknown: 1 });
  assert.equal(summary(rows).points, null);
});

test('NGN points are summed independently of fully correct item counts', () => {
  const rows = detailRows([
    { selected_answer: [0], correct_answer: [0, 1], correct: false, credit: { earned: 1, max: 2, score: 0.5 } },
    { selected_answer: 0, correct_answer: 0, correct: true, credit: { earned: 1, max: 1, score: 1 } },
    { selected_answer: [], correct_answer: [0], correct: false, credit: { earned: 0, max: 3, score: 0 } }
  ]);
  assert.equal(rows[0].status, 'partial');
  assert.deepEqual(plain(summary(rows).points), { earned: 2, max: 6 });
  assert.equal(summary(rows).counts.correct, 1);
  assert.equal(summary(rows).counts.omitted, 1);
});

test('legacy normalized credit preserves points without rescoring saved answers', () => {
  const rows = detailRows([{ selected_answer: [0], correct_answer: [0, 1], correct: false, credit: { score: 0.5, full: false } }]);
  assert.deepEqual(plain(summary(rows).points), { earned: 0.5, max: 1 });
  assert.equal(rows[0].status, 'partial');
  assert.throws(() => detailRows(null), /supported format/);
  assert.throws(() => detailRows([null]), /invalid/);
});

test('question review keeps saved option order, correct keys and per-option explanations', () => {
  const presentation = { version: 'sata-order-v1', order: [2, 0, 1], ids: ['a', 'b', 'c'] };
  const saved = [{ question_id: 'saved', stem: 'Synthetic question', options: ['Alpha', 'Beta', 'Gamma'],
    selected_answer: 0, correct_answer: 2, presentation, rationale: 'Synthetic rationale',
    option_rationales: { 2: 'Gamma explanation' }, correct: false }];
  const before = JSON.stringify(saved);
  const html = questionHtml(detailRows(saved)[0]);
  assert.ok(html.indexOf('Gamma') < html.indexOf('Alpha'));
  assert.match(html, /Gamma explanation/);
  assert.match(html, /correct answer/);
  assert.match(html, /selected/);
  assert.match(html, /Synthetic rationale/);
  assert.equal(JSON.stringify(saved), before);
});

test('read-only clinical-record review shows only the saved case stage', () => {
  const row = detailRows([{
    selected_answer: ['0:0'], correct_answer: ['0:0'], correct: true,
    interaction: { type: 'matrix', rows: ['Finding'], cols: ['Present'], correct: ['0:0'],
      stem: 'Synthetic matrix', rationale: 'Synthetic explanation',
      caseIndex: 0, case: { scenario: 'Saved scenario', tabs: [
        { label: 'Notes', columns: ['Finding'], entries: [
          { at: '2026-10-27T08:00', cells: ['Initial synthetic finding'] },
          { at: '2026-10-27T09:00', fromItem: 2, cells: ['Future finding'] }
        ] },
        { label: 'Future tab', fromItem: 2, columns: [], entries: [] }
      ] } }
  }])[0];
  const html = questionHtml(row);
  assert.match(html, /Saved scenario/);
  assert.match(html, /Initial synthetic finding/);
  assert.doesNotMatch(html, /Future finding|Future tab/);
  assert.match(html, /Finding → Present/);
});

test('review does not execute markup in stems, option text or rationales', () => {
  const html = questionHtml(detailRows([{ stem: '<img src=x onerror=alert(1)>', options: ['<script>bad()</script>', 'B'],
    selected_answer: 0, correct_answer: 1, rationale: '<script>bad()</script>' }])[0]);
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&lt;script&gt;/);
});

test('old summary-only questions are explicit about missing content', () => {
  const html = questionHtml(detailRows([{ correct: false, question_id: 'old' }])[0]);
  assert.match(html, /not saved/);
  assert.match(html, /No rationale was saved/);
});

test('older array-backed MCQ selections and zero-valued fill answers remain visible', () => {
  const mcq = questionHtml(detailRows([{ question_type: 'mcq', selected_answer: [0], correct_answer: [1],
    options: ['Selected option', 'Correct option'], correct: false }])[0]);
  assert.match(mcq, /Selected option <em>\(selected\)<\/em>/);
  const fill = questionHtml(detailRows([{ selected_answer: 0, correct_answer: 0, correct: true,
    interaction: { type: 'fill', correct: 0, rationale: 'Synthetic' } }])[0]);
  assert.match(fill, /Entered: 0/);
  assert.doesNotMatch(fill, /\(blank\)/);
});
