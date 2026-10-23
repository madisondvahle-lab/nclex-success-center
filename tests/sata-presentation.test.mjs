import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import { canonicalAnswer, counts, newPresentations, presentation } from '../supabase/functions/_shared/sata-presentation.mjs';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const context = { window: {}, crypto: webcrypto, console };
for (const file of ['option-presentation.js', 'exam-ui-sata.js', 'exam-adapters.js']) runInNewContext(read(file), context);
const { prepare, score, reviewHtml, Exam } = context.window.ExamUI;
const plain = value => JSON.parse(JSON.stringify(value));

test('every hosted SATA option count matches unchanged canonical public content, including case children', () => {
  const window = {};
  runInNewContext(read('diagnostic-question-bank.js'), { window });
  const actual = {};
  for (const bank of Object.values(window.DIAGNOSTIC_BANKS)) for (const item of bank) {
    if (item.type === 'sata') actual[item.id] = item.options.length;
    for (const child of item.questions || []) if (child.type === 'sata') actual[`${item.id}:${child.qid}`] = child.options.length;
  }
  assert.deepEqual(actual, counts);
});

test('unbiased Fisher-Yates accepts every permutation and rejects modulo-biased samples', () => {
  let draws = [0xffffffff, 2, 1];
  assert.deepEqual(presentation.permutation(3, { getRandomValues: a => { a[0] = draws.shift(); } }), [0, 1, 2]);
  assert.equal(draws.length, 0);
  const seen = new Set();
  for (let first = 0; first < 3; first++) for (let second = 0; second < 2; second++) {
    const samples = [first, second];
    seen.add(presentation.permutation(3, { getRandomValues: a => { a[0] = samples.shift(); } }).join(','));
  }
  assert.equal(seen.size, 6, 'all six outcomes have one equally likely draw sequence');
});

test('three, four and five correct choices retain identities, score and rationales through every answer subset', () => {
  for (const correctCount of [3, 4, 5]) {
    const options = Array.from({ length: 6 }, (_, i) => 'Synthetic choice ' + i);
    const source = { id: 'test', type: 'sata', options, correct: options.map((_, i) => i).slice(0, correctCount),
      optionRationales: Object.fromEntries(options.map((_, i) => [i, 'Explanation ' + i])) };
    const before = JSON.stringify(source), [item] = prepare([source], { shuffleOptions: false });
    for (let mask = 0; mask < 64; mask++) {
      const answer = options.map((_, i) => i).filter(i => mask & (1 << i));
      const ids = presentation.encode(item, answer);
      assert.deepEqual(canonicalAnswer({ test: plain(item.presentation) }, 'test', plain(ids), true), answer);
      assert.deepEqual(plain(score(item, answer)), plain(score(source, answer)));
    }
    const review = reviewHtml(item, item.correct);
    const ordered = presentation.order(item);
    for (let i = 1; i < ordered.length; i++) assert.ok(review.indexOf(options[ordered[i - 1]]) < review.indexOf(options[ordered[i]]));
    for (let i = 0; i < 6; i++) assert.ok(review.includes(`Synthetic choice ${i} — Explanation ${i}`));
    assert.equal(JSON.stringify(source), before);
  }
});

test('case children randomize without rekeying; practice adapter and historical numeric answers stay canonical', () => {
  const questions = [{ id: 'intro', type: 'intro', stem: 'Scenario' },
    { id: 'child', stem: 'Prompt', options: ['a', 'b', 'c', 'd', 'e', 'f'], answer: [0, 1, 2, 3] }];
  const entries = context.window.ExamAdapters.fromPracticeSet(questions);
  const items = prepare(entries, { shuffleOptions: false });
  assert.equal(items[0].presentation.version, presentation.VERSION);
  const result = context.window.ExamAdapters.toPracticeAnswers(questions, { items, ans: [[0, 1, 2, 3]] });
  assert.deepEqual(plain(result[1]), questions[1].answer);
  assert.equal(score(items[0], result[1]).full, true);
  const historical = { type: 'sata', options: ['a', 'b', 'c'], correct: [0, 2] };
  assert.deepEqual(presentation.order(historical), [0, 1, 2]);
  assert.deepEqual(canonicalAnswer(undefined, 'old', [0, 2]), [0, 2]);
});

test('server decoder rejects numeric, foreign, duplicate and client-remapped identities for new attempts', () => {
  const saved = newPresentations([{ item_id: 'm6', item_type: 'sata' }]);
  for (const answer of [[0, 1], { version: presentation.VERSION, optionIds: ['foreign'] },
    { version: presentation.VERSION, optionIds: [saved.m6.ids[0], saved.m6.ids[0]] },
    { version: presentation.VERSION, optionIds: [saved.m6.ids[0]], order: [1, 0] },
    { version: presentation.VERSION, optionIds: [] }]) assert.throws(() => canonicalAnswer(saved, 'm6', answer));
  assert.deepEqual(canonicalAnswer(saved, 'm6', { version: presentation.VERSION, optionIds: [] }, true), []);
  assert.throws(() => presentation.validate({ ...saved.m6, order: [0, 0] }, 6));
  assert.throws(() => newPresentations([{ item_id: 'missing-count', item_type: 'sata' }]));
});

test('import and author warnings never mutate clinical keys or enforce an answer-count pattern', () => {
  const items = Array.from({ length: 5 }, () => ({ item_type: 'sata', item_data: { options: ['a', 'b', 'c', 'd', 'e'], correct: [0, 1, 2] } }));
  const before = JSON.stringify(items);
  assert.equal(presentation.warnings(items).length, 3);
  assert.equal(JSON.stringify(items), before);
  assert.deepEqual(presentation.warnings([{ type: 'sata' }]), []);
  assert.deepEqual(presentation.warnings([null, 12, [], { item_data: 'invalid' }, { type: 'case', items: [null] }]), []);
  assert.equal(presentation.warnings([{ type: 'case', items: [{ type: 'sata', options: ['a', 'b', 'c'], correct: [0, 1] }] }]).length, 1);
});

test('rendering follows display order but keeps canonical scoring values; no correct styles appear before feedback', () => {
  const [item] = prepare([{ id: 's', type: 'sata', options: ['one', 'two', 'three', 'four'], correct: [0, 1] }]);
  item.presentation.order = [3, 1, 0, 2];
  const exam = Object.create(Exam.prototype);
  Object.assign(exam, { items: [item], i: 0, ans: [[3]], checked: [false], struck: [new Set()] });
  const html = exam.answerUi(item);
  assert.ok(html.indexOf('four') < html.indexOf('one'));
  assert.ok(html.includes(`value="${item.presentation.ids[3]}" checked`));
  assert.match(html, /ex-num">1\./);
  assert.doesNotMatch(html, /correct|incorrect|Explanation/);
});

test('historical review retains canonical labels while new saved presentations retain choice rationales', () => {
  const html = read('shared-progress.html');
  const functions = html.slice(html.indexOf('function formatBowtiePart('), html.indexOf('function renderBowtieOptionsList('));
  const ctx = { OptionPresentation: presentation, esc: text => String(text) };
  runInNewContext(functions, ctx);
  const old = { type: 'sata', options: ['one', 'two', 'three', 'four', 'five', 'six'] };
  assert.match(ctx.formatAnswerDisplay([0, 2], old), /Option A.*one.*Option C.*three/);
  const oldHtml = ctx.renderOptionsList(old, [0, 2], [0, 2]);
  assert.ok(oldHtml.indexOf('one') < oldHtml.indexOf('six'));
  const current = { ...old, presentation: { ...presentation.create(6), order: [5, 0, 3, 1, 4, 2] }, optionRationales: { 0: 'First explanation', 2: 'Third explanation' } };
  assert.match(ctx.formatAnswerDisplay([0, 2], current), /Option B.*one.*Option F.*three/);
  const ordered = ctx.renderOptionsList(current, [0, 2], [0, 2]);
  assert.ok(ordered.indexOf('six') < ordered.indexOf('one'));
  assert.ok(ordered.includes('one — First explanation'));
  assert.ok(ordered.includes('three — Third explanation'));
  const normalized = { window: {} };
  runInNewContext(read('practice-review-data.js'), normalized);
  const [detail] = normalized.window.PracticeReviewData.normalize([{ question_id: 'saved', selected_answer: [0, 2], correct_answer: [0, 2], correct: true, presentation: current.presentation, options: current.options }]);
  assert.deepEqual(detail.presentation, current.presentation);
  assert.deepEqual(detail.options, current.options);
  const init = read('supplemental-practice.html').split('async function init(){')[1];
  assert.ok(init.indexOf('getItem(practiceStorageKey())') < init.indexOf("db.from('student_resources')"), 'refresh resumes before catalog loading');
});

test('a new assigned-practice run never reuses or mutates a previous run presentation', async () => {
  const source = { id: 'synthetic-set', title: 'Synthetic', questions: [{ id: 's', stem: 'Synthetic', options: ['a', 'b', 'c', 'd'], answer: [0, 1, 2] }] };
  const states = [];
  const flow = { sets: [source], canOpenSet: () => true, cleanPersonalLabel: value => value, activeSet: null,
    $: () => ({ classList: { add() {} } }), beginPractice: () => {
      const [item] = prepare(context.window.ExamAdapters.fromPracticeSet(flow.activeSet.questions), { shuffleOptions: false });
      flow.activeSet.questions[0].presentation = item.presentation;
      states.push(item.presentation);
    } };
  const html = read('supplemental-practice.html');
  runInNewContext(html.slice(html.indexOf('async function startSet('), html.indexOf('// The checkpoint includes')), flow);
  await flow.startSet('synthetic-set');
  await flow.startSet('synthetic-set');
  assert.equal(source.questions[0].presentation, undefined);
  assert.notDeepEqual(plain(states[0].ids), plain(states[1].ids));
});

test('cached assets and canonical content are untouched; new entry points share the versioned protocol', () => {
  const scoring = source => source.slice(source.indexOf('function emptyAnswer('), source.indexOf('function reviewHtml('));
  assert.equal(scoring(read('exam-ui-sata.js')), scoring(read('exam-ui.js')), 'shared scoring formulas and answer-completion rules are unchanged');
  for (const page of ['supplemental-practice.html', 'madison-diagnostic.html', 'bianca-nur215.html', 'question-bank-review.html']) {
    assert.match(read(page), /option-presentation\.js\?v=ngn-sata-v1/);
    assert.match(read(page), /exam-ui-ngn\.js\?v=ngn-sata-v1/);
  }
  assert.match(read('diagnostic.html'), /name="nclex-option-protocol" content="sata-order-v1"/);
  assert.match(read('assessment-persistence-sata.js'), /optionProtocol: global\.OptionPresentation\.VERSION/);
});
