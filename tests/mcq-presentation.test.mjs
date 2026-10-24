import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import { canonicalAnswer, newPresentations, presentation } from '../supabase/functions/_shared/sata-presentation.mjs';
import { selectCurrent, currentInteraction } from '../supabase/functions/_shared/diagnostic-ngn.mjs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const context = {
  window: {},
  document: { querySelector: () => ({ content: 'sata-order-v1' }) },
  crypto: webcrypto,
  console,
  sessionStorage: { getItem: () => null, setItem() {} },
};
for (const file of ['option-presentation.js', 'ngn-scoring.js', 'exam-ui-ngn.js']) runInNewContext(read(file), context);
context.window.NGNScoring = context.NGNScoring;
const ui = context.window.ExamUI;
const permutations = values => values.length < 2 ? [values] : values.flatMap((value, index) =>
  permutations(values.filter((_, other) => other !== index)).map(rest => [value, ...rest]));
const plain = value => JSON.parse(JSON.stringify(value));

test('all 24 MCQ presentations preserve answer mapping, scoring and answer-specific rationales', () => {
  const options = ['Option A', 'Option B', 'Option C', 'Option D'];
  for (let correct = 0; correct < options.length; correct++) {
    for (const order of permutations([0, 1, 2, 3])) {
      const item = {
        id: `mcq-${correct}`, type: 'mcq', stem: 'Synthetic question',
        options, correct: [correct],
        optionRationales: Object.fromEntries(options.map((_, index) => [String.fromCharCode(97 + index), `Rationale ${index}`])),
        presentation: { version: presentation.VERSION, order, ids: options.map((_, index) => `id-${index}`) },
      };
      const displayed = order.map(index => item.options[index]);
      const correctDisplay = order.indexOf(correct);
      const submitted = presentation.encode(item, [correct]);
      assert.deepEqual(canonicalAnswer({ [item.id]: plain(item.presentation) }, item.id, plain(submitted)), [correct]);
      assert.equal(ui.score(item, correct).full, true);
      for (let position = 0; position < order.length; position++) {
        const canonical = presentation.indexes(item.presentation, [item.presentation.ids[order[position]]])[0];
        assert.equal(ui.score(item, canonical).full, order[position] === correct);
      }
      const exam = Object.create(ui.Exam.prototype);
      Object.assign(exam, { items: [item], i: 0, ans: [correct], checked: [false], struck: [new Set()] });
      const html = exam.answerUi(item);
      displayed.forEach((text, position) => {
        assert.ok(html.indexOf(text) >= 0);
        assert.ok(html.includes(`value="${item.presentation.ids[order[position]]}"`));
        assert.ok(html.includes(`>${position + 1}.</span>`));
      });
      const review = ui.reviewHtml(item, correct);
      for (let index = 0; index < options.length; index++) {
        assert.ok(review.includes(`${options[index]} — Rationale ${index}`));
      }
    }
  }
});

test('CAT creates server-owned MCQ maps only for opted-in clients and retains legacy numeric responses', () => {
  const keys = [
    { item_id: 'legacy', item_type: 'mcq' },
    { item_id: 'm6', item_type: 'sata' },
  ];
  const legacy = newPresentations(keys);
  assert.equal(legacy.legacy, undefined);
  assert.ok(legacy.m6);
  const optedIn = newPresentations(keys, true);
  assert.equal(optedIn.legacy.order.length, 4);
  assert.ok(optedIn.m6);
  assert.deepEqual(canonicalAnswer(undefined, 'legacy', 2), 2);
  const response = { version: presentation.VERSION, optionIds: [optedIn.legacy.ids[2]] };
  assert.deepEqual(canonicalAnswer(optedIn, 'legacy', response), [2]);
  assert.throws(() => canonicalAnswer(optedIn, 'legacy', 2), /saved option identities/);
});

test('MCQ review keeps legacy letter-keyed rationale association and canonical answer positions', () => {
  const item = {
    id: 'legacy-keys', type: 'mcq', options: ['A', 'B', 'C', 'D'], correct: [2],
    presentation: { version: presentation.VERSION, order: [2, 0, 3, 1], ids: ['a', 'b', 'c', 'd'] },
    optionRationales: { A: 'Legacy A', b: 'Legacy B', C: 'Legacy C', d: 'Legacy D' },
  };
  const html = ui.reviewHtml(item, 2);
  assert.ok(html.includes('C — Legacy C'));
  assert.ok(html.includes('A — Legacy A'));
  assert.ok(html.includes('B — Legacy B'));
  assert.ok(html.includes('D — Legacy D'));
  assert.ok(html.indexOf('C — Legacy C') < html.indexOf('A — Legacy A'));
});

test('student-only pathways use persistent maps without rewriting canonical option arrays', () => {
  const page = read('diagnostic.html');
  assert.match(page, /nclex-mcq-option-protocol/);
  assert.match(page, /OptionPresentation\.encode\(q, selected\)/);
  assert.match(page, /OptionPresentation\.encode\(q, ngnAnswer\)/);
  const adapter = read('exam-adapters.js');
  assert.match(adapter, /a === null \? undefined : a/);
  const renderer = read('exam-ui-ngn.js');
  assert.match(renderer, /optionOrder\(it\)\.map\(\(i, position\) => this\.optRow\('r', i, it\.options\[i\]/);
  assert.match(renderer, /OptionPresentation\.validate\(it\.presentation, it\.options\.length\)/);
});

test('published CAT MCQ banks remain four-option canonical items', () => {
  const bankContext = { window: {} };
  runInNewContext(read('diagnostic-question-bank.js'), bankContext);
  for (const bank of Object.values(bankContext.window.DIAGNOSTIC_BANKS)) {
    for (const item of bank) {
      if (item.type === 'mcq') assert.equal(item.options.length, 4, item.id);
      for (const child of item.questions || []) if (child.type === 'mcq') assert.equal(child.options.length, 4, child.qid);
    }
  }
});

test('each new run creates a fresh presentation even if the source object carries an old order', () => {
  const previous = presentation.create(4);
  const bank = [{ id: 'new-run', type: 'mcq', options: ['a', 'b', 'c', 'd'], correct: [1], presentation: previous }];
  const [first] = ui.prepare(bank, { shuffleOptions: false });
  const [second] = ui.prepare(bank, { shuffleOptions: false });
  assert.notDeepEqual(plain(first.presentation.ids), plain(previous.ids));
  assert.notDeepEqual(plain(second.presentation.ids), plain(first.presentation.ids));
  assert.deepEqual(bank[0].options, ['a', 'b', 'c', 'd']);
  assert.deepEqual(bank[0].presentation, previous);
});

test('NGN CAT maps MCQ interaction options only for clients with the MCQ capability', () => {
  const key = { item_id: 'case', ngn_entry: { kind: 'case', id: 'case', items: [
    { id: 'mcq-child', type: 'mcq', options: ['a', 'b', 'c', 'd'], correct: [2] },
    { id: 'sata-child', type: 'sata', options: ['a', 'b', 'c'], correct: [1] },
  ] } };
  const sataOnly = selectCurrent({ optionProtocol: presentation.VERSION }, key);
  assert.deepEqual(Object.keys(sataOnly.current.presentations), ['case:sata-child']);
  const optedIn = selectCurrent({ optionProtocol: presentation.VERSION, mcqOptionProtocol: 'mcq-order-v1' }, key);
  assert.deepEqual(Object.keys(optedIn.current.presentations).sort(), ['case:mcq-child', 'case:sata-child']);
  const question = currentInteraction({ ngnState: optedIn });
  assert.equal(question.id, 'case:mcq-child');
  assert.equal(question.presentation.order.length, 4);
});
