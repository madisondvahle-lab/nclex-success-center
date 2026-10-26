const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const root = join(__dirname, '..');
const window = {};
vm.runInNewContext(readFileSync(join(root, 'cat-inventory.js'), 'utf8'), { window });
const inventory = window.CATInventory;

test('inventory reconciles actual server rows, including nonselectable children and missing content', () => {
  const rows = inventory.reconcile([
    { item_id: 'case', selectable: true }, { item_id: 'case:a', parent_item_id: 'case', selectable: false },
    { item_id: 'server-only', selectable: true },
  ], [{ id: 'case', questions: [{ qid: 'a', stem: 'Child question', options: ['A', 'B'] }] }]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].content.stem, 'Child question');
  assert.equal(rows[1].selectable, false);
  assert.equal(rows[2].content, null);
});

test('inventory renders canonical solutions without interpreting clinical content as HTML', () => {
  const html = inventory.card({
    item_id: '<script>bad</script>', item_type: 'mcq', item_source: 'original', selectable: true,
    content: { stem: '<img onerror="bad">', options: ['<script>bad</script>'] },
    core_tags: ['delegation'], correct_response: [1], rationale: { correct: '<script>bad</script>' },
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.match(html, /zero-based/);
  assert.match(html, /delegation/);
  assert.doesNotMatch(html, /<input|<button/);
});

test('existing bank UI mounts the isolated inventory only after its admin check', () => {
  const html = readFileSync(join(root, 'question-bank-review.html'), 'utf8');
  assert.ok(html.indexOf("if(!admin.data)") < html.indexOf('CATInventory.mount'));
  assert.match(html, /id="pane-cat"/);
  for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
});
