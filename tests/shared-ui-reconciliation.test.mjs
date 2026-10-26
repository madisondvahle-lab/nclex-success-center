import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function load({ declared = true, helper = true, helperVersion, helperRationale = true, engine = 'exam-ui-ngn.js', storage = new Map() } = {}) {
  const events = new Map();
  const context = {
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
    document: {
      querySelector: () => declared ? { content: 'sata-order-v1' } : null,
      querySelectorAll: () => [], removeEventListener() {}
    },
    crypto: webcrypto, console, queueMicrotask: fn => fn(), setInterval: () => 1, clearInterval() {},
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  };
  if (helper) runInNewContext(read('option-presentation.js'), context);
  if (helperVersion) context.window.OptionPresentation.VERSION = helperVersion;
  if (helper && !helperRationale) delete context.window.OptionPresentation.rationale;
  runInNewContext(read('ngn-scoring.js'), context);
  context.window.NGNScoring = context.NGNScoring;
  runInNewContext(read(engine), context);
  return { context, api: context.window.ExamUI, storage, events };
}
function mount(api, opts) {
  const { Exam } = api;
  Exam.prototype.build = function () {
    this.app = { addEventListener() {} };
    this.main = { querySelectorAll: () => [] };
  };
  Exam.prototype.show = function (i) { this.i = i; };
  return new Exam({ innerHTML: '', querySelector: () => null }, opts);
}
const sata = (correct = [0, 2, 4]) => ({
  id: 'synthetic', type: 'sata', scoringVersion: 'ngn-v1', options: ['one', 'two', 'three', 'four', 'five', 'six'],
  correct, optionRationales: { 0: 'First explanation', 2: 'Third explanation' }
});

test('combined source exposes separate capability without changing NGN client/scoring identity', () => {
  const { api, context } = load();
  assert.equal(api.CLIENT_PROTOCOL, 'ngn-cat-v1');
  assert.equal(api.OPTION_PROTOCOL, 'sata-order-v1');
  assert.equal(context.window.NGNScoring.VERSION, 'ngn-v1');
  assert.throws(() => load({ helper: false }), /answer presentation module could not load/);
  assert.throws(() => load({ helperVersion: 'stale' }), /answer presentation module could not load/);
  assert.throws(() => load({ helperRationale: false }), /answer presentation module could not load/);
  assert.doesNotThrow(() => load({ declared: false, helper: false }));
  const source = read('exam-ui-ngn.js');
  assert.match(source, /return scoring\(\)\.score\(it, a\)/);
  assert.doesNotMatch(source, /function partial|function plusMinus/);
});

test('NGN-only pages ignore SATA helper, presentation metadata, and storage options', () => {
  const storage = new Map([['old', 'not-json']]);
  const { api, events } = load({ declared: false, storage });
  const original = sata();
  const [item] = api.prepare([original], { shuffleOptions: false });
  assert.equal(item.presentation, undefined);
  assert.deepEqual(plain(item.options), original.options);
  let checkpoints = 0;
  const exam = mount(api, { items: [item], showTimer: false, storageKey: 'old', onCheckpoint: () => checkpoints++ });
  assert.equal(exam.persist(), true);
  assert.equal(checkpoints, 0);
  assert.equal(events.size, 0);
  assert.equal(storage.get('old'), 'not-json');
  const supplied = { ...item, presentation: { ids: ['bad'], order: [5, 4, 3, 2, 1, 0] } };
  exam.items = [supplied];
  const html = exam.answerUi(supplied);
  assert.ok(html.indexOf('one') < html.indexOf('six'));
  assert.match(html, /value="0"/);
  exam.onChange({ target: { name: 'opt', value: '4', checked: true } });
  assert.deepEqual(plain(exam.ans[0]), [4]);
});

test('combined preparation randomizes identities/order without mutating canonical choices or 3/4/5-answer keys', () => {
  const { api } = load();
  for (const correct of [[0, 2, 4], [0, 1, 3, 5], [0, 1, 2, 4, 5]]) {
    const original = sata(correct), before = plain(original), orders = new Set(), ids = new Set();
    for (let n = 0; n < 24; n++) {
      const [item] = api.prepare([original], { shuffleOptions: true });
      assert.deepEqual(plain(item.options), before.options);
      assert.deepEqual(plain(item.correct), before.correct);
      assert.deepEqual(plain(api.score(item, correct)), plain(api.score(original, correct)));
      assert.equal(api.score(item, correct).score, 1);
      orders.add(item.presentation.order.join(','));
      ids.add(item.presentation.ids[0]);
    }
    assert.ok(orders.size > 1);
    assert.equal(ids.size, 24);
    assert.deepEqual(original, before);
  }
});

test('case children create a fresh SATA presentation per standalone run and preserve NGN metadata', () => {
  const { api, context } = load();
  const child = sata(), previous = context.OptionPresentation.create(6);
  child.presentation = previous;
  const original = { id: 'case', kind: 'case', title: 'Synthetic', scenario: 'Synthetic', category: 'test', items: [child] };
  const [item] = api.prepare([original]);
  assert.notDeepEqual(plain(item.presentation.ids), plain(previous.ids));
  assert.equal(item.scoringVersion, 'ngn-v1');
  assert.equal(item.case.id, 'case');
  assert.equal(item.caseIndex, 0);
  assert.equal(item.ngn, true);
  const exam = mount(api, { items: [item], answer: [0, 2, 4], readOnly: true, showTimer: false });
  assert.deepEqual(plain(exam.ans[0]), [0, 2, 4]);
  assert.deepEqual(plain(exam.items[0].presentation), plain(item.presentation));
  exam.onChange({ target: { name: 'opt', value: item.presentation.ids[1], checked: true } });
  assert.deepEqual(plain(exam.ans[0]), [0, 2, 4]);
});

test('display, response callbacks, strike-outs and rationales use canonical identity behind shuffled positions', () => {
  const { api } = load();
  const [item] = api.prepare([sata()]);
  item.presentation.order = [5, 2, 0, 4, 1, 3];
  let answer;
  const exam = mount(api, { items: [item], showTimer: false, onAnswer: value => { answer = plain(value); } });
  exam.struck[0].add(2);
  const html = exam.answerUi(item);
  assert.ok(html.indexOf('six') < html.indexOf('one'));
  assert.match(html, /ex-num">1\./);
  assert.ok(html.includes(`value="${item.presentation.ids[5]}"`));
  assert.doesNotMatch(html, /First explanation|Third explanation|correct answer/);
  exam.onChange({ target: { name: 'opt', value: item.presentation.ids[2], checked: true } });
  assert.deepEqual(answer, [2]);
  assert.equal(exam.struck[0].has(2), false);
  assert.throws(() => exam.onChange({ target: { name: 'opt', value: 'unknown', checked: true } }), /invalid option identity/);
  const review = api.reviewHtml(item, [2]);
  assert.ok(review.indexOf('six') < review.indexOf('one'));
  assert.match(review, /one — First explanation/);
  assert.match(review, /three — Third explanation/);
});

test('SATA-only engine snapshots resume unchanged with saved settings and case-child order', () => {
  const standalone = load({ engine: 'exam-ui-sata.js' });
  const [child] = standalone.api.prepare([{ kind: 'case', id: 'case', title: 'Synthetic', items: [sata()] }]);
  const old = mount(standalone.api, { items: [child], instant: true, showTimer: false, noFeedback: true });
  old.ans[0] = [0, 2, 4]; old.struck[0].add(3); old.marked[0] = true;
  old.notes = 'Synthetic notes'; old.elapsed = 29; old.time[0] = 29; old.checked[0] = true;
  old.tab = { case: 'labs' };
  const snapshot = plain(old.snapshot()), storage = new Map([['practice', JSON.stringify(snapshot)]]);
  const { api, events } = load({ storage });
  let checkpoints = 0;
  const resumed = mount(api, { items: [sata()], storageKey: 'practice', instant: false, showTimer: true, noFeedback: false, onCheckpoint: () => checkpoints++ });
  assert.deepEqual(plain(resumed.snapshot()), snapshot);
  assert.equal(resumed.struck[0].has(3), true);
  assert.equal(resumed.o.instant, true);
  assert.equal(resumed.o.showTimer, false);
  assert.equal(resumed.o.noFeedback, true);
  assert.equal(checkpoints, 1);
  assert.ok(events.has('pagehide'));
  events.get('pagehide')();
  assert.equal(checkpoints, 2);
  let result;
  resumed.o.onFinish = value => { result = value; };
  resumed.finish(false);
  assert.deepEqual(plain(result.items[0].presentation), snapshot.items[0].presentation);
  assert.deepEqual(plain(result.ans[0]), [0, 2, 4]);
  assert.equal(storage.has('practice'), false);
  assert.equal(events.size, 0);
});

test('combined review retains existing lowercase, uppercase and numeric canonical rationale keys', () => {
  const { api } = load();
  for (const optionRationales of [{ a: 'Canonical first', c: 'Canonical third' }, { A: 'Canonical first', C: 'Canonical third' },
    { 0: 'Canonical first', 2: 'Canonical third' }]) {
    const [item] = api.prepare([{ ...sata(), optionRationales }]);
    item.presentation.order = [5, 2, 0, 4, 1, 3];
    const review = api.reviewHtml(item, [2]);
    assert.match(review, /one — Canonical first/);
    assert.match(review, /three — Canonical third/);
    assert.ok(review.indexOf('three — Canonical third') < review.indexOf('one — Canonical first'));
    assert.deepEqual(item.optionRationales, optionRationales);
  }
});

test('invalid saved presentation fails instead of silently reshuffling a resumed answer', () => {
  const { api } = load();
  const exam = mount(api, { items: [sata()], showTimer: false });
  const snapshot = plain(exam.snapshot());
  snapshot.items[0].presentation.order = [0, 0, 2, 3, 4, 5];
  assert.throws(() => mount(api, { items: snapshot.items, resume: snapshot, showTimer: false }), /Invalid saved answer presentation/);
});

test('failed checkpoints are reported and prevent an apparently successful save', () => {
  const { api, context } = load();
  const exam = mount(api, { items: [sata()], showTimer: false });
  let alert;
  context.document.createElement = () => ({ setAttribute() {} });
  exam.root.prepend = value => { alert = value; };
  exam.o.onCheckpoint = () => { throw new Error('Storage unavailable'); };
  assert.equal(exam.persist(), false);
  assert.match(alert.textContent, /Practice could not be saved.*Storage unavailable/);
  assert.equal(exam.done, false);
});

test('owned combined pages opt in, use cache-safe versioned assets, and reject stale capability', () => {
  for (const page of ['bianca-nur215.html', 'madison-diagnostic.html', 'question-bank-review.html', 'supplemental-practice.html']) {
    const html = read(page);
    assert.doesNotMatch(html, /^(?:<<<<<<<|=======|>>>>>>>)/m);
    assert.match(html, /name="nclex-option-protocol" content="sata-order-v1"/);
    assert.match(html, /name="nclex-mcq-option-protocol" content="mcq-order-v1"/);
    assert.match(html, /option-presentation\.js\?v=mcq-order-v1/);
    assert.match(html, /ngn-scoring\.js\?v=mcq-order-v1/);
    assert.match(html, /exam-ui-ngn\.js\?v=mcq-order-v1/);
    assert.doesNotMatch(html, /src="exam-ui-sata\.js/);
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
    for (const script of scripts) new Script(script, { filename: page });
    const guard = scripts.find(script => script.includes('OPTION_PROTOCOL'));
    assert.ok(guard);
    const stale = { window: { ExamUI: { CLIENT_PROTOCOL: 'ngn-cat-v1' }, OptionPresentation: { VERSION: 'sata-order-v1' } } };
    assert.throws(() => runInNewContext(guard, stale), /assessment modules could not load/);
    assert.equal(stale.window.ExamUI, undefined, 'a later page script cannot start the stale engine');
    assert.throws(() => runInNewContext(guard, { window: { ExamUI: { CLIENT_PROTOCOL: 'ngn-cat-v1', OPTION_PROTOCOL: 'sata-order-v1' } } }), /assessment modules could not load/);
  }
  assert.match(read('question-bank-review.html'), /ngn-author-ngn\.js\?v=clinical-record-practice-v1/);
  assert.match(read('question-bank-review.html'), /OptionPresentation\.warnings\(items\)/);
  assert.match(read('ngn-author-ngn.js'), /OptionPresentation\?\.warnings/);
  assert.match(read('ngn-author-ngn.js'), /scoringVersion: 'ngn-v1'/);
  assert.match(read('supplemental-practice.html'), /onCheckpoint:snapshot=>sessionStorage\.setItem/);
});
