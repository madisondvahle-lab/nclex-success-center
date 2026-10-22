const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'diagnostic.html'), 'utf8');
const counter = html.slice(html.indexOf('  const caseItemCount ='), html.indexOf('  const correctSoFar ='));
const mcq = { id: 'synthetic-mcq', type: 'mcq' };
const legacyCase = { id: 'synthetic-case', type: 'casestudy', questions: [{}, {}, {}] };
const number = (total, submitted, q = mcq) =>
  vm.runInNewContext(`${counter}\nqNum;`, { history: Array(total), submitted, q });

test('traditional question number advances on navigation, not submission', () => {
  for (const type of ['mcq', 'sata', 'bowtie']) {
    assert.equal(number(0, false, { type }), 1);
    assert.equal(number(1, true, { type }), 1);
    assert.equal(number(1, false, { type }), 2);
  }
});

test('legacy grouped case retains its displayed starting number and range after submission', () => {
  assert.equal(number(4, false, legacyCase), 5);
  assert.equal(number(7, true, legacyCase), 5);
  assert.equal(number(7, true, legacyCase) + legacyCase.questions.length - 1, 7);
  assert.equal(number(7, false), 8);
});

test('final feedback never displays a nonexistent next question', () => {
  for (const limit of [5, 45, 85, 150]) assert.equal(number(limit, true), limit);
  assert.equal(number(150, true, legacyCase), 148);
});

test('successful submission saves the complete response history without advancing the displayed item', async () => {
  const source = html.slice(html.indexOf('  async function handleSubmit()'), html.indexOf('  async function handleSaveExit()'));
  for (const q of [mcq, legacyCase]) {
    const count = q.type === 'casestudy' ? 3 : 1;
    const responses = Array.from({ length: 4 + count }, (_, i) => ({ item_id: `synthetic-${i}` }));
    let savedHistory, submitted = false, displayedItem = q;
    const calls = [];
    const context = {
      q, attempt: { id: 'attempt', revision: 2, checkpoint: {} },
      persistenceState: { status: 'ready' }, selected: [0], btState: {}, csAnswers: {},
      sharedInteraction: false, ngnAnswer: undefined,
      isAnswered: () => true, assessmentDb: () => ({}), examTimerCheckpoint: () => null,
      NCLEX_ASSESSMENT_PERSISTENCE: { recordResponse: async body => {
        calls.push(body);
        return { responses, nextItemId: 'synthetic-next', checkpointRevision: 3, abilityEstimate: 0.5 };
      } },
      restoreResponseHistory: rows => rows,
      setHistory: rows => { savedHistory = rows; },
      setSubmitted: value => { submitted = value; },
      setCurrentQ: value => { displayedItem = value; },
      setAttempt: update => update(context.attempt),
      setAbility() {}, setSubmissionResult() {}, setPersistenceState() {},
    };
    vm.runInNewContext(source, context);
    await context.handleSubmit();
    assert.equal(calls.length, 1);
    assert.equal(savedHistory, responses);
    assert.equal(submitted, true);
    assert.equal(displayedItem, q);
    assert.equal(number(savedHistory.length, submitted, q), 5);
    assert.equal(calls[0].expectedRevision, 2);
    assert.equal(calls[0].itemId, q.id);
  }
});

test('completion uses server result and saved history without selecting a next question', () => {
  const source = html.slice(html.indexOf('  function handleNext()'), html.indexOf('  const caseItemCount ='));
  const responses = Array.from({ length: 7 }, (_, i) => ({ item_id: `synthetic-${i}` }));
  let finished;
  const context = {
    submitted: true, submissionResult: { completed: true, responses, result: 'PASS', abilityEstimate: 0.7 },
    ability: 0.5, attempt: { id: 'synthetic-attempt' }, restoreResponseHistory: rows => rows,
    setHistory: rows => assert.equal(rows, responses),
    finishSession: (...args) => { finished = args; },
    setCurrentQ() { throw new Error('Completed assessment must not advance'); },
  };
  vm.runInNewContext(source, context);
  context.handleNext();
  assert.deepEqual(finished, [responses, 'PASS', 0.7, 'synthetic-attempt']);
});
