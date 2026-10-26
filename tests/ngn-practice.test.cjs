const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { webcrypto } = require('node:crypto');
const test = require('node:test');
const vm = require('node:vm');
const root = join(__dirname, '..');
const context = { console, crypto: webcrypto, structuredClone };
context.window = context;
context.document = { querySelector: () => ({ content: 'sata-order-v1' }) };
for (const file of ['option-presentation.js', 'ngn-scoring.js', 'exam-ui-ngn.js', 'ngn-author-ngn.js', 'ngn-practice.js', 'question-bank-selection.js', 'exam-adapters.js', 'practice-review-data.js']) {
  vm.runInNewContext(readFileSync(join(root, file), 'utf8'), context);
}
const { NGNPractice, ExamUI, NGNAuthor, PracticeQuestionSelection, ExamAdapters } = context;
const plain = value => JSON.parse(JSON.stringify(value));
const tabs = [
  { id: 'notes', label: "Nurses' Notes", columns: ['Finding'], entries: [
    { at: '2026-10-26T10:00', fromItem: 3, cells: [{ t: 'Future synthetic finding' }] },
    { at: '2026-10-26T08:00', cells: [{ id: 'finding', t: 'Initial synthetic finding' }] }
  ] },
  ...['Vital Signs', 'Laboratory Results', 'Medication Administration Record'].map((label, i) => ({
    id: 'tab-' + i, label, fromItem: i + 1, columns: ['Value'],
    entries: [{ at: '2026-10-26T08:00', cells: [{ t: 'Synthetic value ' + i }] }]
  }))
];
const item = (type, extra) => ({ ...plain(NGNAuthor.blank(type)), stem: 'Synthetic ' + type, rationale: 'Synthetic rationale ' + type, ...extra });
function fixture() {
  const entry = { kind: 'case', schemaVersion: 1, textFormat: 'plain', id: 'authored-case', title: 'Synthetic case',
    scenario: 'Synthetic patient record', tabs: plain(tabs), items: [
      item('sata', { options: ['A', 'B', 'C', 'D'], correct: [0, 1] }),
      item('matrix', { rows: ['R1', 'R2'], cols: ['C1', 'C2'], correct: ['0:0', '1:1'], responseMode: 'single' }),
      item('cloze', { template: '{{0}} then {{1}}', dropdowns: [{ options: ['A', 'B'], correct: 0 }, { options: ['A', 'B'], correct: 1 }] }),
      item('highlight', { chartSelections: true, segments: [{ id: 'finding', t: 'Initial synthetic finding', correct: true }] }),
      item('bowtie', { bowtie: { actions: ['A', 'B', 'C'], conditions: ['A', 'B'], complications: ['A', 'B', 'C'] }, correct: { actions: [0, 1], condition: 0, complications: [0, 1] } }),
      item('fill', { correct: 5 })
    ] };
  return { id: 'bank-case', active: true, item_type: 'case', stem: 'Synthetic case', item_data: entry };
}
function engine(item, answer) {
  return Object.assign(Object.create(ExamUI.Exam.prototype), {
    items: [item], i: 0, ans: [answer], checked: [false], tab: {}, o: {}, struck: [new Set()]
  });
}

test('published six-item cases preserve authored order, all charts, stages, IDs and content', () => {
  const row = fixture(), before = JSON.stringify(row);
  const entry = NGNPractice.fromRow(row);
  const items = ExamUI.prepare([entry], { shuffleOptions: false });
  assert.equal(items.length, 6);
  assert.deepEqual(plain(items.map(it => it.qid)), row.item_data.items.map(it => it.id));
  assert.deepEqual(plain(items[0].case.tabs), tabs);
  const e = engine(items[0], []);
  assert.doesNotMatch(e.leftPane(items[0]), /Future synthetic finding|Laboratory Results|Medication Administration/);
  assert.match(e.leftPane(items[0]), /Initial synthetic finding/);
  const later = engine(items[3], []);
  const html = later.chartHtml(items[3].case.tabs[0], 4);
  assert.ok(html.indexOf('Initial synthetic finding') < html.indexOf('Future synthetic finding'));
  assert.match(later.leftPane(items[3]), /Medication Administration Record/);
  assert.equal(JSON.stringify(row), before);
  assert.throws(() => NGNPractice.fromRow({ ...row, active: false }), /published/);
  assert.throws(() => NGNPractice.fromRow({ ...row, item_data: { ...row.item_data, items: row.item_data.items.slice(1) } }), /six items/);
});

test('partial credit, all interaction responses and review survive a JSON checkpoint roundtrip', () => {
  const items = ExamUI.prepare([NGNPractice.fromRow(fixture())], { shuffleOptions: false });
  const result = plain({ items, ans: [[0], ['0:0', '1:0'], [0, 0], ['finding'], [0, 2, 0, 0, 1], '5'], marked: [true] });
  const details = NGNPractice.details(result);
  const summary = NGNPractice.summary(details);
  assert.deepEqual(plain(summary), { full: 2, earned: 9, max: 13, percent: 69 });
  assert.equal(details[0].credit.earned, 1);
  assert.equal(details[0].marked_for_review, true);
  assert.equal(details[5].case_index, 5);
  const stored = plain(details);
  const review = NGNPractice.reviewHtml(context.PracticeReviewData.normalize(stored));
  assert.match(review, /9\/13 points/);
  assert.match(review, /Synthetic rationale cloze/);
  assert.match(review, /Medication Administration Record/);
  assert.match(review, /Case item 6 of 6/);
  assert.deepEqual(stored.map(row => row.selected_answer), result.ans);
  const omitted = NGNPractice.details({ items, ans: items.map(context.NGNScoring.emptyAnswer), marked: [] });
  assert.equal(NGNPractice.summary(omitted).earned, 0);
  assert.equal(NGNPractice.summary(omitted).max, 13);
  assert.doesNotThrow(() => NGNPractice.reviewHtml(omitted));
});

test('MCQ/SATA records pass through the existing practice adapter without changing keys or normal items', () => {
  for (const type of ['mcq', 'sata']) {
    const row = { id: type, stem: 'Synthetic prompt', rationale: 'Synthetic explanation', item_type: type,
      option_a: 'A', option_b: 'B', option_c: 'C', option_d: 'D', correct_answer: 'b',
      item_data: { ...item(type, { options: ['A', 'B', 'C', 'D'], correct: [1] }), tabs: [{ ...plain(tabs[0]), entries: [plain(tabs[0].entries[1])] }] } };
    const normal = PracticeQuestionSelection.fromBankRow({ ...row, item_data: { options: ['A', 'B', 'C', 'D'], correct: [1] } });
    assert.equal(normal.interaction, undefined);
    const q = { id: type, stem: row.stem, rationale: row.rationale, ...PracticeQuestionSelection.fromBankRow(row) };
    const [prepared] = ExamUI.prepare(ExamAdapters.fromPracticeSet([q]), { shuffleOptions: false });
    assert.equal(prepared.case, undefined);
    assert.deepEqual(plain(prepared.tabs), row.item_data.tabs);
    assert.deepEqual(plain(prepared.correct), [1]);
    assert.match(engine(prepared, type === 'mcq' ? 1 : [1]).leftPane(prepared), /Initial synthetic finding/);
    assert.equal(ExamUI.score(prepared, type === 'mcq' ? 1 : [1]).full, true);
  }
});

test('standalone NGN and record-backed MCQ remain single items, not artificial cases', () => {
  for (const type of ['mcq', 'sata', 'matrix', 'cloze', 'highlight', 'bowtie', 'fill']) {
    const source = type === 'mcq' ? item('mcq', { options: ['A', 'B'], correct: [0] }) : fixture().item_data.items.find(it => it.type === type);
    const entry = NGNPractice.fromRow({ id: type, active: true, item_type: type, stem: type, item_data: { ...source, chartSelections: false, tabs: [] } });
    const prepared = ExamUI.prepare([entry], { shuffleOptions: false });
    assert.equal(prepared.length, 1);
    assert.equal(prepared[0].case, undefined);
  }
});

test('explicit assignment revalidates publication, is repeat-safe, and never writes questions or student rows', async () => {
  const row = fixture(), resources = [], writes = [];
  const db = { from(table) {
    const filters = [];
    const query = {
      select() { return query; }, in(key, values) { filters.push(r => values.includes(r[key])); return query; },
      eq(key, value) { filters.push(r => r[key] === value); return query; }, limit() { return query; },
      insert(value) { writes.push(table); resources.push({ id: 'resource-' + resources.length, ...plain(value) }); return Promise.resolve({ error: null }); },
      then(resolve) { return Promise.resolve({ data: (table === 'questions' ? [row] : resources).filter(r => filters.every(f => f(r))), error: null }).then(resolve); }
    };
    return query;
  } };
  await NGNPractice.assign(db, 'synthetic-student', ['bank-case']);
  await NGNPractice.assign(db, 'synthetic-student', ['bank-case']);
  assert.equal(resources.length, 1);
  assert.equal(resources[0].assignment_details.question_count, 6);
  assert.equal(resources[0].assignment_details.practice_type, 'ngn-authored');
  assert.equal(resources[0].assignment_week, undefined);
  assert.equal(resources[0].url, 'supplemental-practice.html?ngn=bank-case');
  assert.deepEqual(writes, ['student_resources']);
  row.active = false;
  await assert.rejects(NGNPractice.assign(db, 'synthetic-student', ['bank-case']), /published/);
  assert.equal(resources.length, 1);
});

test('changed page scripts parse and traditional selection stays separate from explicit NGN assignments', () => {
  for (const file of ['supplemental-practice.html', 'madison-assignments.html', 'question-bank-review.html', 'shared-progress.html']) {
    const page = readFileSync(join(root, file), 'utf8');
    for (const script of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1], { filename: file });
  }
  const page = readFileSync(join(root, 'supplemental-practice.html'), 'utf8');
  assert.match(page, /\.in\('item_type',\['mcq','sata'\]\)/);
  assert.match(page, /eq\('student_id',student.id\)\.eq\('url',url\)/);
  assert.match(page, /resultSaved=true/);
  assert.match(page, /Retry saving/);
  assert.equal(NGNPractice.sameJSON({ answer: [0, 1], item: { id: 'q', type: 'sata' } }, { item: { type: 'sata', id: 'q' }, answer: [0, 1] }), true);
  assert.equal(NGNPractice.sameJSON({ answer: [0, 1] }, { answer: [0] }), false);
});
