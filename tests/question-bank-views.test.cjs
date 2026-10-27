const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = readFileSync(join(__dirname, '..', 'question-bank-views.js'), 'utf8');
const html = readFileSync(join(__dirname, '..', 'question-bank-review.html'), 'utf8');
function api() {
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.QBankViews;
}
const questions = [
  { id: 'a', question_no: 10, created_at: '2026-10-25T10:00:00Z', stem: 'First question', nclex_category: 'Management of Care', study_area: 'Fundamentals', item_type: 'mcq', viewStatus: 'Draft' },
  { id: 'b', question_no: 20, created_at: '2026-10-26T10:00:00Z', stem: 'Second question', nclex_category: 'Management of Care', study_area: 'Adult Health', item_type: 'sata', viewStatus: 'Approved' },
  { id: 'c', stem: 'Third question', nclex_category: 'Other', item_type: 'case', viewStatus: 'Needs review' }
];
test('all views combine category, area, type, status and search without changing questions', () => {
  const views = api(), before = JSON.stringify(questions);
  assert.equal(views.matches(questions[0], { category: 'Management of Care', area: 'Fundamentals', type: 'mcq', status: 'Draft', search: 'first' }), true);
  for (const [field, value] of Object.entries({ category: 'Other', area: 'Adult Health', type: 'case', status: 'Approved', search: 'missing' })) {
    assert.equal(views.matches(questions[0], { [field]: value }), false);
  }
  assert.equal(views.matches({}, { type: 'mcq' }), true);
  assert.equal(JSON.stringify(questions), before);
});
test('date and number sorting place unnumbered/undated items last and preserve file order', () => {
  const views = api(), ids = sort => [...questions].sort((a, b) => views.compare(a, b, sort)).map(q => q.id);
  assert.deepEqual(ids('newest'), ['b', 'a', 'c']);
  assert.deepEqual(ids('oldest'), ['a', 'b', 'c']);
  assert.deepEqual(ids('number-desc'), ['b', 'a', 'c']);
  assert.deepEqual(ids('number-asc'), ['a', 'b', 'c']);
  assert.deepEqual(ids('original'), ['a', 'b', 'c']);
  assert.deepEqual(ids('stem'), ['a', 'b', 'c']);
});
test('saved review status distinguishes approval from publishing', () => {
  const views = api(), reviews = new Map([['qbank-bulk-b-q', { status: 'approved' }]]);
  assert.equal(views.statusOf({ source_key: 'qbank-bulk-b-q', active: false }, reviews), 'Approved');
  assert.equal(views.statusOf({ source_key: 'qbank-bulk-b-q', active: true }, reviews), 'Published');
  assert.equal(views.statusOf({ source_key: 'qbank-bulk-other', active: false }, reviews), 'Draft');
  assert.equal(views.statusOf({ active: false }, reviews), 'Inactive');
});
test('duplicate actions use the existing protected deletion path and unique explicit selections', async () => {
  const calls = [], context = {
    duplicateSelection: new Set(['extra']),
    updateDuplicateSelection() {}, renderManage() {}, updateBankOverview() {},
    async mApply(action, ids) { calls.push({ action, ids }); }
  };
  vm.runInNewContext('let duplicateDeleting=false;' + html.slice(html.indexOf('async function deleteDuplicateCopies('), html.indexOf('const BULK_TYPES=')), context);
  await context.deleteDuplicateCopies(['extra', 'extra']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'delete');
  assert.deepEqual(Array.from(calls[0].ids), ['extra']);
  assert.equal(context.duplicateSelection.size, 0);
  assert.doesNotMatch(html.slice(html.indexOf('async function deleteDuplicateCopies('), html.indexOf('const BULK_TYPES=')), /\.from\(|\.rpc\(/);
});
test('all three existing surfaces have filters and imported cards retain original action indexes', () => {
  for (const id of ['manage-view-filters', 'import-view-filters', 'duplicate-view-filters']) assert.ok(html.includes(`id="${id}"`));
  assert.match(html, /shown\.map\(\(\{entry,index\}\)=>/);
  assert.match(html, /filteredBulkEntries\(\)\.map\(\(\{entry\}\)=>entry\)/);
  assert.match(html, /QUESTION_COLUMNS='id,created_at,archived_at,/);
  assert.match(html, /if\(!filtered\.some\(q=>q\.id===id\)\)mSel\.delete\(id\)/);
});
