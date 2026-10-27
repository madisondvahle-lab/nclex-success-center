const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const vm = require('node:vm');

const context = { window: {}, crypto: { randomUUID }, console };
vm.runInNewContext(readFileSync(join(__dirname, '..', 'ngn-scoring.js'), 'utf8'), context);
context.window.NGNScoring = context.NGNScoring;
for (const file of ['exam-ui-ngn.js', 'ngn-author-ngn.js']) {
  vm.runInNewContext(readFileSync(join(__dirname, '..', file), 'utf8'), context);
}
const { Exam, prepare, score, reviewHtml } = context.window.ExamUI;
const { validate, blank } = context.window.NGNAuthor;
test('student practice uses the same unmodified exam theme as the import preview', () => {
  const practice = readFileSync(join(__dirname, '..', 'supplemental-practice.html'), 'utf8');
  const preview = readFileSync(join(__dirname, '..', 'question-bank-review.html'), 'utf8');
  const stylesheet = page => page.match(/href="(exam-ui\.css[^"]*)"/)?.[1];
  assert.ok(stylesheet(preview));
  assert.equal(stylesheet(practice), stylesheet(preview));
  const styles = [...practice.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
  assert.doesNotMatch(styles, /\.ex-(?:app|header|toolbar|main|pane|stem|opts|opt|footer|fb|tb|item-no|mark-l)\b/);
});
test('split question typography matches prompts and options without restyling matrix controls', () => {
  const css = readFileSync(join(__dirname, '..', 'exam-ui.css'), 'utf8');
  assert.match(css, /\.ex-prompt\{[^}]*font-size:\.9em/);
  assert.match(css, /\.ex-right \.ex-stem\{[^}]*font-size:\.9em/);
  assert.match(css, /\.ex-right \.ex-opts\{[^}]*font-size:\.9em/);
  assert.match(css, /\.ex-right \.ex-opts \.ex-opt\{[^}]*align-items:flex-start[^}]*min-height:44px/);
  assert.match(css, /\.ex-right \.ex-opts \.ex-txt\{[^}]*min-width:0[^}]*line-height:1\.6/);
  const page = readFileSync(join(__dirname, '..', 'question-bank-review.html'), 'utf8');
  assert.match(page, /exam-ui\.css\?v=ngn-preview-typography-v1/);
});
const plain = value => JSON.parse(JSON.stringify(value));
const item = (type, extra = {}) => ({ ...plain(blank(type)), scoringVersion: undefined, stem: 'Test prompt', rationale: 'Test explanation', ...extra });
const tabs = [
  { id: 'notes', label: 'Notes', columns: ['Finding'], entries: [
    { at: '2026-10-21T10:00', fromItem: 2, cells: [{ id: 'later', t: 'Later finding' }] },
    { at: '2026-10-21T08:00', cells: [{ id: 'early', t: 'Initial finding' }] }
  ] },
  { id: 'labs', label: 'Results', fromItem: 2, columns: ['Result'], entries: [
    { at: '2026-10-21T09:00', cells: [{ t: 'Test result' }] }
  ] }
];
const highlight = item('highlight', {
  chartSelections: true, tabs,
  segments: [{ id: 'early', t: 'Initial finding', correct: true, rationale: 'Finding explanation' }]
});
function engine(it, answer = [], checked = false) {
  const e = Object.create(Exam.prototype);
  Object.assign(e, { items: [it], i: 0, ans: [answer], checked: [checked], tab: {}, changes: [0] });
  return e;
}
test('legacy NGN scoring remains unchanged for each supported interaction', () => {
  const examples = [
    [item('mcq', { options: ['A', 'B'], correct: [0] }), 0, 1],
    [item('sata', { correct: [0, 1] }), [0, 2], 0],
    [item('sata', { correct: [0, 1] }), [0], 0.5],
    [item('matrix', { correct: ['0:0', '1:1'] }), ['0:0'], 0.5],
    [item('cloze', { dropdowns: [{ correct: 0 }, { correct: 1 }] }), [0, 0], 0.5],
    [item('highlight', { segments: [{ id: 'a', correct: true }, { id: 'b', correct: true }, { id: 'c' }] }), ['a', 'c'], 0],
    [item('fill', { correct: 2.5, tolerance: 0.1 }), '2.55', 1],
    [item('bowtie'), [1, 0, 0, 1, 0], 1],
    [item('bowtie'), [0, 0, 0, 0, 0], 0.6]
  ];
  for (const [it, answer, expected] of examples) assert.equal(score(it, answer).score, expected, it.type);
});
test('the existing consult bank still renders and awards full credit for its unchanged keys', () => {
  vm.runInNewContext(readFileSync(join(__dirname, '..', 'consult-diagnostic-bank.js'), 'utf8'), context);
  const source = context.window.CONSULT_DIAGNOSTIC_BANK;
  const before = JSON.stringify(source);
  for (const it of prepare(source, { shuffleOptions: false })) {
    const answer = it.type === 'mcq' ? it.correct[0] :
      it.type === 'fill' ? String(it.correct) :
      it.type === 'cloze' ? it.dropdowns.map(d => d.correct) :
      it.type === 'highlight' ? it.segments.filter(s => s.correct).map(s => s.id) :
      it.type === 'bowtie' ? [...it.correct.actions, it.correct.condition, ...it.correct.complications] : it.correct;
    const e = engine(it, answer);
    e.struck = [new Set()];
    assert.equal(score(it, answer).full, true, it.id);
    assert.equal(typeof e.answerUi(it), 'string');
    if (it.case || it.tabs?.length) assert.equal(typeof e.leftPane(it), 'string');
  }
  assert.equal(JSON.stringify(source), before);
});
test('explicit all-or-nothing is opt-in and duplicate response IDs cannot inflate credit', () => {
  const it = item('sata', { correct: [0, 1] });
  assert.equal(score(it, [0, 0]).score, 0.5);
  assert.equal(score({ ...it, scoring: 'zero-one' }, [0]).score, 0);
  assert.equal(score({ ...it, scoring: 'zero-one' }, [0, 1]).score, 1);
  assert.throws(() => score({ ...it, correct: [] }, []), /no correct answers/);
});
test('case preparation preserves original IDs, keys, structured tabs, and source content', () => {
  const source = { kind: 'case', id: 'case', scenario: 'Test scenario', tabs, items: [
    { ...highlight, id: 'q1' }, item('mcq', { id: 'q2', options: ['A', 'B'], correct: [1] })
  ] };
  const before = JSON.stringify(source), prepared = prepare([source], { shuffleOptions: false });
  assert.deepEqual(plain(prepared.map(it => it.qid)), ['q1', 'q2']);
  assert.equal(prepared[1].caseIndex, 1);
  assert.deepEqual(plain(prepared[0].case.tabs), tabs);
  assert.equal(JSON.stringify(source), before);
});
test('chart entries sort chronologically and cannot reveal future findings', () => {
  const e = engine(highlight);
  const first = e.chartHtml(tabs[0], 1);
  assert.match(first, /Initial finding/);
  assert.doesNotMatch(first, /Later finding|correct|Finding explanation/);
  const later = e.chartHtml(tabs[0], 2);
  assert.ok(later.indexOf('Initial finding') < later.indexOf('Later finding'));
  assert.equal(tabs[0].entries[0].at, '2026-10-21T10:00', 'source order remains unchanged');
});
test('structured clinical times preserve authored military time and original ISO across offsets and stages', () => {
  const e = engine(highlight), entries = [
    { at: '2026-10-26T14:30:00-05:00', fromItem: 2, cells: ['Afternoon'] },
    { at: '2026-10-26T08:30:00+14:00', cells: ['Early instant'] },
    { at: '2026-10-26T08:00:00-05:00', cells: ['Morning'] },
    { at: '2026-10-26T00:00:00Z', cells: ['Midnight'] },
    { at: '2026-10-26T23:59', cells: ['Late'] }
  ];
  const before = plain(entries);
  for (const label of ['Nursing Assessment', 'Laboratory Results', 'Treatment Records']) {
    const tab = { label, columns: ['Record'], entries };
    const first = e.chartHtml(tab, 1), later = e.chartHtml(tab, 2);
    assert.match(first, /<th scope="col">Time<\/th>/);
    for (const time of ['0800', '0830', '0000', '2359']) assert.ok(first.includes(`>${time}</time>`));
    assert.doesNotMatch(first, />1430<\/time>|Afternoon/);
    assert.match(later, />1430<\/time>/);
    assert.match(later, /datetime="2026-10-26T14:30:00-05:00"/);
    assert.doesNotMatch(later, />2026-10-26[^<]*<\/time>/);
    assert.ok(first.indexOf('Early instant') < first.indexOf('Morning'), 'sort by original instants, not displayed time');
  }
  assert.deepEqual(entries, before);
});
test('matrix headings use explicit presentation metadata or clear prompt context without changing keys', () => {
  for (const [extra, label] of [
    [{ stem: 'For each proposed intervention, classify appropriateness.' }, 'Potential Intervention'],
    [{ prompt: 'Classify the following potential interventions.' }, 'Potential Intervention'],
    [{ stem: 'Classify each nursing action.' }, 'Nursing Action'],
    [{ stem: 'Classify each clinical finding.' }, 'Finding'],
    [{ stem: 'Which findings require an intervention?' }, 'Finding'],
    [{ rowLabel: 'Custom <heading>', stem: 'Classify proposed interventions.' }, 'Custom &lt;heading&gt;']
  ]) {
    const it = item('matrix', { rows: ['One', 'Two'], cols: ['Yes', 'No'], correct: ['0:0', '1:1'], ...extra });
    const before = plain(it), e = engine(it);
    assert.ok(e.answerUi(it).includes(`<th>${label}</th>`));
    assert.deepEqual(plain(it), before);
    assert.equal(score(it, ['0:0', '1:1']).full, true);
  }
});
test('case tab disclosure and prior timestamps follow the current question stage', () => {
  const it = { ...highlight, case: { id: 'case', scenario: 'Test', tabs, total: 2 }, caseIndex: 0 };
  const e = engine(it);
  assert.doesNotMatch(e.leftPane(it), />Results<|Later finding/);
  it.caseIndex = 1;
  e.tab.case = 'notes';
  assert.match(e.leftPane(it), />Results</);
  assert.match(e.leftPane(it), /Initial finding[\s\S]*Later finding/);
  it.caseIndex = 0;
  assert.doesNotMatch(e.leftPane(it), />Results<|Later finding/);
});
test('only question-linked chart findings become answer buttons; labels are escaped', () => {
  const e = engine(highlight, ['early']);
  assert.match(e.findingHtml({ id: 'early', t: '<test>' }), /aria-pressed="true"[^>]*>&lt;test&gt;/);
  assert.equal(e.findingHtml({ id: 'later', t: 'Later finding' }), 'Later finding');
  assert.match(e.findingHtml({ id: 'early', t: 'Initial finding' }), /class="seg on"/);
  e.checked[0] = true;
  assert.match(e.findingHtml({ id: 'early', t: 'Initial finding' }), / disabled/);
  assert.match(reviewHtml(highlight, ['early']), /Finding explanation/);
});
test('legacy HTML charts and highlight notes retain their original rendering', () => {
  const e = engine(highlight);
  assert.equal(e.chartHtml({ html: '<p>Legacy chart</p>' }, 1), '<p>Legacy chart</p>');
  const legacy = { ...highlight, chartSelections: false };
  e.items[0] = legacy;
  assert.match(e.answerUi(legacy), /data-h="early"/);
  e.items[0] = { ...highlight, stem: '<img src=x>', textFormat: 'plain' };
  assert.match(e.answerUi(e.it), /&lt;img src=x&gt;/);
});
test('author validates every format without JSON input', () => {
  const valid = [
    item('mcq', { options: ['A', 'B'] }), item('sata', { options: ['A', 'B'] }),
    item('matrix', { rows: ['R'], cols: ['A', 'B'], correct: ['0:1'], responseMode: 'single' }),
    item('cloze', { dropdowns: [{ options: ['A', 'B'], correct: 0 }] }),
    highlight,
    item('bowtie', { bowtie: { actions: ['A', 'B'], conditions: ['C'], complications: ['D', 'E'] } }),
    item('fill')
  ].map(it => it === highlight ? { ...it, tabs: [tabs[0]], chartSelections: false } : it);
  // Standalone questions cannot disclose records after their only item.
  valid[4].tabs = [{ ...tabs[0], entries: [tabs[0].entries[1]] }];
  for (const it of valid) assert.equal(validate(it), it);
  const study = { kind: 'case', id: 'test', scenario: 'Test', tabs, items: [
    { ...highlight, id: 'one' }, item('mcq', { id: 'two', options: ['A', 'B'] })
  ] };
  assert.equal(validate(study), study);
});
test('author rejects invalid keys, duplicate IDs, missing rationale, and hidden keyed findings', () => {
  assert.throws(() => validate(item('sata', { options: ['A'], correct: [4] })), /valid correct/);
  assert.throws(() => validate(item('fill', { rationale: '' })), /rationale/);
  assert.throws(() => validate(item('cloze', { template: '{{1}}', dropdowns: [{ options: ['A'], correct: 0 }] })), /matching sentence marker/);
  assert.throws(() => validate(item('matrix', { rows: ['R'], cols: ['A', 'B'], correct: ['0:0', '0:1'], responseMode: 'single' })), /exactly one/);
  const duplicate = plain(highlight);
  duplicate.tabs[0].entries[0].cells[0].id = 'early';
  assert.throws(() => validate(duplicate), /IDs must be unique/);
  const invalidStage = plain(highlight);
  invalidStage.tabs[0].entries[0].fromItem = 0;
  assert.throws(() => validate(invalidStage), /positive item number/);
  const hidden = { kind: 'case', id: 'test', scenario: 'Test', tabs, items: [
    { ...highlight, id: 'first', segments: [{ id: 'later', t: 'Later finding', correct: true }] },
    item('mcq', { id: 'second', options: ['A', 'B'] })
  ] };
  assert.throws(() => validate(hidden), /available chart cell/);
});
test('single-selection matrix replaces the response in its row without disturbing other rows', () => {
  const e = engine(item('matrix', { responseMode: 'single' }), ['0:0', '1:0']);
  e.o = {};
  e.onChange({ target: { dataset: { r: '0', c: '1' }, checked: true } });
  assert.deepEqual(plain(e.ans[0]), ['1:0', '0:1']);
});
test('locked answers and ordinary browser text selection cannot alter recorded highlights', () => {
  const e = engine(highlight, ['early'], true);
  const target = { closest: selector => selector === '[data-h]' ? { dataset: { h: 'early' } } : null };
  e.onClick({ target, detail: 1 });
  assert.deepEqual(e.ans[0], ['early']);
  e.checked[0] = false;
  e.o = {};
  e.highlightStart = { x: 0, y: 0 };
  context.window.getSelection = () => ({ toString: () => 'ordinary selection' });
  e.onClick({ target, detail: 1, clientX: 20, clientY: 0 });
  assert.deepEqual(e.ans[0], ['early']);
  e.main = { querySelectorAll: () => [] };
  e.onClick({ target, detail: 1, clientX: 0, clientY: 0 });
  assert.deepEqual(plain(e.ans[0]), [], 'a deliberate click still works if ordinary selected text remains elsewhere');
  delete context.window.getSelection;
});
test('all form editors mount, preserve structured charts, and validate without a JSON field', () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.classList = { add() {} }; }
    appendChild(el) { this.children.push(el); }
    replaceChildren() { this.children = []; }
    setAttribute() {}
    addEventListener() {}
  }
  context.document = { createElement: tag => new Element(tag) };
  const walk = root => [root, ...root.children.flatMap(walk)];
  for (const type of context.window.NGNAuthor.types) {
    const root = new Element('div'), source = plain(blank(type));
    if (type === 'case') source.tabs = plain(tabs);
    else source.tabs = [{ ...plain(tabs[0]), entries: [plain(tabs[0].entries[1])] }];
    const before = JSON.stringify(source);
    const editor = context.window.NGNAuthor.mount(root, source, () => ({ stem: 'Test', rationale: 'Test' }));
    assert.equal(typeof editor.read, 'function');
    assert.ok(walk(root).some(el => el.tag === 'legend' && el.textContent === 'Clinical record tab'), type);
    assert.ok(!walk(root).some(el => /JSON/.test(el.textContent || '')));
    assert.equal(JSON.stringify(source), before, 'mounting must not mutate the original bank item');
  }
  const root = new Element('div');
  const ready = { ...highlight, tabs: [{ ...plain(tabs[0]), entries: [plain(tabs[0].entries[1])] }] };
  assert.deepEqual(plain(context.window.NGNAuthor.mount(root, ready).read()), plain(ready));
  const choices = new Element('div');
  const choiceEditor = context.window.NGNAuthor.mount(choices, item('sata', { options: ['A', 'B', 'C'], correct: [2] }));
  const firstOption = walk(choices).find(el => el.tag === 'fieldset' && el.children.some(c => c.tag === 'legend' && c.textContent === 'Answer option 1'));
  firstOption.children.find(el => el.tag === 'button' && el.textContent === 'Remove').onclick();
  assert.deepEqual(plain(choiceEditor.read().correct), [1], 'removal preserves the keyed choice rather than shifting it to another answer');
  const matrix = new Element('div');
  const matrixEditor = context.window.NGNAuthor.mount(matrix, item('matrix', { rows: ['R1', 'R2'], cols: ['A', 'B'], correct: ['1:1'] }));
  const firstRow = walk(matrix).find(el => el.tag === 'fieldset' && el.children.some(c => c.tag === 'legend' && c.textContent === 'Matrix row 1'));
  firstRow.children.find(el => el.tag === 'button' && el.textContent === 'Remove').onclick();
  assert.deepEqual(plain(matrixEditor.read().correct), ['0:1']);
  delete context.document;
});
test('versioned previews require a complete valid interaction before checking it', () => {
  const it = { ...plain(blank('bowtie')), stem: 'Test', rationale: 'Test' };
  assert.equal(context.window.ExamUI.isAnswered(it, [0, null, 0, null, null]), false);
  assert.equal(context.window.ExamUI.isAnswered(it, [0, 1, 0, 0, 1]), true);
  assert.equal(context.window.ExamUI.isAnswered({ ...plain(blank('fill')), correct: 2 }, '2junk'), false);
});
