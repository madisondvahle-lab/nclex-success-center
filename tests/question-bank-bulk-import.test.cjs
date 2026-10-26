const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { webcrypto } = require('node:crypto');
const vm = require('node:vm');
const test = require('node:test');

const read = file => readFileSync(join(__dirname, '..', file), 'utf8');
const html = read('question-bank-review.html');
const plain = value => JSON.parse(JSON.stringify(value));
function harness() {
  const nodes = new Map(), writes = [];
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', after() {} });
    return nodes.get(id);
  };
  const context = {
    window: {}, crypto: webcrypto, $, console,
    document: { querySelectorAll: () => [] },
    bulkImportReady: true, stagedBatch: [], pendingBulkTracking: null,
    live: [], reviews: new Map(), session: { user: { id: 'synthetic-admin' } },
    esc: value => String(value ?? '').replaceAll('<', '&lt;'),
    bulkMatch: () => null, setLiveFilter() {}, render() {}, renderManage() {},
    db: { from(table) {
      return {
        insert(rows) {
          writes.push({ table, rows: plain(rows) });
          return { select: async () => ({ data: rows.map((row, i) => ({ ...row, id: `db-${i}` })) }) };
        },
        async upsert(rows) { writes.push({ table, rows: plain(rows) }); return {}; }
      };
    } }
  };
  for (const file of ['option-presentation.js', 'ngn-author-ngn.js']) vm.runInNewContext(read(file), context);
  context.NGNAuthor = context.window.NGNAuthor;
  vm.runInNewContext(
    html.slice(html.indexOf('const BULK_TYPES='), html.indexOf('function bulkMatch(')) +
    html.slice(html.indexOf('function stagedCanSave('), html.indexOf('function renderQualityDrafts(')),
    context
  );
  return { context, $, writes };
}
const chart = () => [{
  id: 'vitals', label: 'Vital Signs', columns: ['Pulse'],
  entries: [{ at: '2026-10-26T08:00', cells: [{ id: 'pulse', t: '80' }] }]
}];
function question(type = 'cloze', id = 'synthetic-1') {
  const base = { id, type, schemaVersion: 1, textFormat: 'plain', scoringVersion: 'ngn-v1', stem: 'Synthetic question', rationale: 'Synthetic explanation' };
  if (['mcq', 'sata'].includes(type)) Object.assign(base, { options: ['One', 'Two', 'Three', 'Four'], correct: [0] });
  if (type === 'matrix') Object.assign(base, { rows: ['First', 'Second'], cols: ['Yes', 'No'], correct: ['0:0', '1:1'], responseMode: 'single' });
  if (type === 'cloze') Object.assign(base, { template: 'Choose {{0}}.', dropdowns: [{ options: ['One', 'Two'], correct: 1 }] });
  if (type === 'highlight') Object.assign(base, { chartSelections: true, segments: [{ id: 'pulse', t: '80', correct: true }] });
  if (type === 'bowtie') Object.assign(base, { bowtie: { actions: ['A', 'B'], conditions: ['C'], complications: ['D', 'E'] }, correct: { actions: [0, 1], condition: 0, complications: [0, 1] } });
  if (type === 'fill') Object.assign(base, { correct: 2.5, tolerance: 0.1 });
  base.tabs = chart();
  if (type === 'case') {
    delete base.type;
    Object.assign(base, { kind: 'case', title: 'Synthetic case', scenario: 'Synthetic scenario', items: ['mcq', 'sata', 'cloze', 'matrix', 'bowtie', 'fill'].map((t, i) => {
      const child = question(t, `child-${i}`).item_data;
      delete child.tabs;
      return child;
    }) });
    base.tabs[0].entries.push({ at: '2026-10-26T09:00', fromItem: 6, cells: [{ t: '96' }] });
  }
  return {
    id, stem: base.stem, rationale: base.rationale, item_type: type,
    difficulty: 'medium', nclex_category: 'Reduction of Risk Potential',
    topic: 'Synthetic technical test', clinical_judgment_skill: 'Analyze cues',
    option_rationales: { a: 'Explanation A', b: 'Explanation B', c: 'Explanation C', d: 'Explanation D' },
    references: [{ title: 'Synthetic test reference', url: 'https://example.test/reference' }],
    ...(type === 'mcq' ? { options: base.options, correct_answer: 'a' } : {}),
    item_data: base
  };
}
async function stage(h, items, wrapped = true) {
  h.$('bulk-json').value = JSON.stringify(wrapped ? { items } : items);
  await h.context.previewBulk();
}

test('all eight interaction types and record-backed MCQ/SATA validate without mutation', () => {
  const h = harness();
  for (const type of ['mcq', 'sata', 'cloze', 'matrix', 'highlight', 'bowtie', 'fill', 'case']) {
    const item = question(type), before = plain(item);
    assert.deepEqual(plain(h.context.validateBatchItems([item])[0].errors), [], type);
    assert.deepEqual(item, before);
  }
  const classic = question('mcq'); delete classic.item_data;
  assert.deepEqual(plain(h.context.validateBatchItems([classic])[0].errors), []);
});

test('documented copy/paste cloze example validates and saves unchanged as one inactive draft', async () => {
  const h = harness();
  const example = JSON.parse(read('docs/question-bank-json-import.md').match(/```json\n([\s\S]*?)\n```/)[1]);
  await stage(h, example.items);
  assert.deepEqual(plain(h.context.stagedBatch[0].errors), []);
  h.context.reviewClearBulkItems();
  await h.context.saveBulkDrafts();
  assert.equal(h.writes[0].rows.length, 1);
  assert.equal(h.writes[0].rows[0].active, false);
  assert.deepEqual(h.writes[0].rows[0].item_data, example.items[0].item_data);
});

test('1, 5, 25 and 50 items retain review gating and save only inactive drafts', async () => {
  for (const count of [1, 5, 25, 50]) {
    const h = harness(), items = Array.from({ length: count }, (_, i) => question(i % 2 ? 'mcq' : 'cloze', `q-${i}`));
    await stage(h, items, count !== 5);
    assert.equal(h.context.stagedBatch.length, count);
    assert.equal(h.context.stagedCanSave(), false);
    h.context.reviewClearBulkItems();
    assert.equal(h.context.stagedCanSave(), true);
    await h.context.saveBulkDrafts();
    assert.equal(h.writes.length, 2);
    const rows = h.writes[0].rows;
    assert.equal(rows.length, count);
    rows.forEach((row, i) => {
      assert.equal(row.active, false);
      assert.deepEqual(row.item_data, items[i].item_data);
      assert.deepEqual(row.reference_list, items[i].references);
    });
    assert.ok(h.writes[1].rows.every(row => row.status === 'draft'));
  }
});

test('empty and over-limit batches fail; migration readiness and manual reviews remain required', async () => {
  for (const count of [0, 51]) {
    const h = harness();
    await stage(h, Array.from({ length: count }, (_, i) => question('cloze', `q-${i}`)));
    assert.equal(h.context.stagedBatch.length, 0);
    assert.match(h.$('bulk-status').textContent, /1–50/);
    await h.context.saveBulkDrafts();
    assert.equal(h.writes.length, 0);
  }
  const h = harness();
  await stage(h, [question()]);
  h.context.bulkImportReady = false;
  h.context.reviewClearBulkItems();
  assert.equal(h.context.stagedCanSave(), false);
});

test('malformed interactions identify the question and field and cannot be saved', async t => {
  const cases = [
    ['cloze', q => { q.item_data.dropdowns[0].correct = 8; }, 'dropdowns[0].correct'],
    ['cloze', q => { q.item_data.template = '{{1}}'; }, 'template'],
    ['cloze', q => { q.item_data.dropdowns = null; }, 'dropdowns'],
    ['matrix', q => { q.item_data.correct = ['0:9']; }, 'correct'],
    ['matrix', q => { q.item_data.correct = ['0:0']; }, 'correct'],
    ['matrix', q => { q.item_data.rows = null; }, 'rows'],
    ['matrix', q => { q.item_data.responseMode = 'bad'; }, 'responseMode'],
    ['bowtie', q => { q.item_data.bowtie = null; }, 'bowtie'],
    ['bowtie', q => { q.item_data.correct.actions = [0, 0]; }, 'correct.actions'],
    ['highlight', q => { q.item_data.segments[0].id = 'hidden'; }, 'segments'],
    ['highlight', q => { q.item_data.segments = [null]; }, 'segments'],
    ['highlight', q => { q.item_data.segments[0].correct = 'true'; }, 'segments'],
    ['highlight', q => { q.item_data.chartSelections = 'false'; }, 'chartSelections'],
    ['highlight', q => { q.item_data.segments.push({ ...q.item_data.segments[0] }); }, 'segments'],
    ['sata', q => { q.item_data.correct = [-1]; }, 'correct'],
    ['fill', q => { q.item_data.correct = '2'; }, 'correct'],
    ['fill', q => { q.item_data.tolerance = -1; }, 'tolerance'],
    ['cloze', q => { q.item_data.tabs = {}; }, 'tabs'],
    ['cloze', q => { q.item_data.tabs = null; }, 'tabs'],
    ['cloze', q => { q.item_data.tabs.push(plain(q.item_data.tabs[0])); }, '.id'],
    ['cloze', q => { q.item_data.tabs[0].columns = []; }, '.columns'],
    ['cloze', q => { q.item_data.tabs[0].entries.push(plain(q.item_data.tabs[0].entries[0])); }, '.id'],
    ['cloze', q => { q.item_data.tabs[0].fromItem = null; }, '.fromItem'],
    ['cloze', q => { q.item_data.tabs[0].entries = [null]; }, 'entries[0]'],
    ['cloze', q => { q.item_data.tabs[0].entries[0].cells = null; }, 'cells'],
    ['cloze', q => { q.item_data.tabs[0].entries[0].at = 'not a date'; }, '.at'],
    ['cloze', q => { q.item_data.tabs[0].entries[0].fromItem = 2; }, '.fromItem'],
    ['cloze', q => { q.item_data.type = 'sata'; }, 'item_data.type'],
    ['cloze', q => { delete q.item_data.schemaVersion; }, 'schemaVersion'],
    ['cloze', q => { delete q.item_data.rationale; }, 'rationale'],
    ['cloze', q => { q.item_data = []; }, 'item_data'],
    ['mcq', q => { q.item_data.correct = [2]; }, 'item_data.correct'],
    ['mcq', q => { q.item_data.options.reverse(); q.options = ['One', 'Two', 'Three', 'Four']; }, 'item_data.options'],
    ['case', q => { q.item_data.items.pop(); }, 'item_data.items'],
    ['case', q => { q.item_data.items[2].dropdowns[0].correct = 10; }, 'items[2].dropdowns[0].correct'],
    ['case', q => { q.item_data.tabs[0].entries[1].fromItem = 7; }, 'entries[1].fromItem'],
    ['case', q => { q.item_data.items[1].id = q.item_data.items[0].id; }, 'items'],
    ['case', q => { q.item_data.items[0].tabs = chart(); }, 'items[0].tabs'],
    ['case', q => { q.item_data.items[0] = null; }, 'items']
  ];
  for (const [type, mutate, field] of cases) await t.test(`${type}: ${field}`, async () => {
    const h = harness(), q = question(type);
    mutate(q);
    await stage(h, [q]);
    assert.equal(h.context.stagedBatch.length, 1, h.$('bulk-status').textContent);
    const errors = plain(h.context.stagedBatch[0].errors).join(' ');
    assert.ok(errors.includes('Question 1 (synthetic-1)'), errors);
    assert.ok(errors.includes(field), errors);
    assert.doesNotMatch(errors, /Cannot read|is not a function/);
    h.context.reviewClearBulkItems();
    await h.context.saveBulkDrafts();
    assert.equal(h.writes.length, 0);
    assert.equal(h.$('bulk-save').disabled, true);
  });
});

test('validation runs again immediately before insert and preserves tracking retries', async () => {
  const h = harness();
  await stage(h, [question()]);
  h.context.reviewClearBulkItems();
  h.context.stagedBatch[0].item.item_data.dropdowns[0].correct = 99;
  await h.context.saveBulkDrafts();
  assert.equal(h.writes.length, 0);
  assert.match(h.$('bulk-preview-list').innerHTML, /dropdowns\[0\].correct/);

  const retry = harness();
  let attempts = 0;
  const original = retry.context.db.from;
  retry.context.db.from = table => table === 'question_import_reviews'
    ? { async upsert() { attempts++; return attempts === 1 ? { error: { message: 'Synthetic tracking failure' } } : {}; } }
    : original(table);
  await stage(retry, [question()]);
  retry.context.reviewClearBulkItems();
  await retry.context.saveBulkDrafts();
  assert.ok(retry.context.pendingBulkTracking);
  await retry.context.saveBulkDrafts();
  assert.equal(retry.context.pendingBulkTracking, null);
  assert.equal(retry.writes.length, 1, 'Retry must not insert another question');
});

test('invalid references and primitive entries render actionable errors rather than crashing preview', async () => {
  const h = harness(), q = question();
  q.references = [null];
  await stage(h, [q, null]);
  assert.equal(h.context.stagedBatch.length, 2);
  assert.match(h.$('bulk-preview-list').innerHTML, /Validation errors/);
  assert.match(h.$('bulk-preview-list').innerHTML, /Item 2 must be an object/);
});
