const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = name => readFileSync(join(__dirname, '..', name), 'utf8');

test('capability is advertised only by the updated page with matching loaded modules, on every request', async () => {
  for (const meta of [undefined, 'ngn-cat-v1']) {
    const calls = [];
    const window = {
      document: { querySelector: () => meta ? { content: meta } : null },
      NGNScoring: { VERSION: 'ngn-v1' }, ExamUI: { CLIENT_PROTOCOL: 'ngn-cat-v1' },
    };
    vm.runInNewContext(read('assessment-persistence.js'), { window });
    const supabase = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'test' } } } }) },
      functions: { invoke: async (_name, { body }) => {
        calls.push(body);
        return { data: { attempt: null, abandoned: true } };
      } },
    };
    await window.NCLEX_ASSESSMENT_PERSISTENCE.resumeAttempt({ supabase, assessmentKey: 'diagnostic-mock' });
    await window.NCLEX_ASSESSMENT_PERSISTENCE.abandonAttempt({ supabase, attemptId: 'test' });
    assert.deepEqual(calls.map(body => body.clientProtocol), [meta, meta]);
  }
});

test('missing or mismatched scoring/renderer assets block persistence before authentication or writes', async () => {
  for (const modules of [
    {},
    { NGNScoring: { VERSION: 'old' }, ExamUI: { CLIENT_PROTOCOL: 'ngn-cat-v1' } },
    { NGNScoring: { VERSION: 'ngn-v1' }, ExamUI: {} },
    { NGNScoring: { VERSION: 'ngn-v1' }, ExamUI: { CLIENT_PROTOCOL: 'future' } },
  ]) {
    const window = { document: { querySelector: () => ({ content: 'ngn-cat-v1' }) }, ...modules };
    vm.runInNewContext(read('assessment-persistence.js'), { window });
    const supabase = { auth: { getSession() { throw new Error('must not request a session'); } } };
    await assert.rejects(window.NCLEX_ASSESSMENT_PERSISTENCE.createAttempt({
      supabase, profile: { mode: 'mock' }, sessionKey: 'blocked',
    }), /updated CAT modules could not load/);
  }
});

test('unversioned legacy renderer and author remain byte-identical to production for cached HTML', () => {
  for (const name of ['exam-ui.js', 'ngn-author.js']) {
    // SHA-256 of the deployed 10518df assets, not a dependency on local Git history.
    const hash = require('node:crypto').createHash('sha256').update(read(name)).digest('hex');
    const expected = {
      'exam-ui.js': '338ede74a07577ebd5a8eccb3f8af8bdb5c7fa457ffd92a89edeb4ef479856b8',
      'ngn-author.js': 'ccc71fab39fa5362b7ee77b35e12129d600cb1b410c506b80d3dd66c0af46955',
    };
    assert.equal(hash, expected[name]);
  }
});

test('the server update-required message survives Supabase HTTP error transport', async () => {
  const window = {};
  vm.runInNewContext(read('assessment-persistence.js'), { window });
  const message = 'Refresh the portal and resume; your progress is unchanged.';
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'test' } } } }) },
    functions: { invoke: async () => ({ error: {
      message: 'Edge Function returned a non-2xx status code',
      context: { status: 409, json: async () => ({ error: message }) },
    } }) },
  };
  await assert.rejects(window.NCLEX_ASSESSMENT_PERSISTENCE.resumeAttempt({
    supabase, assessmentKey: 'diagnostic-mock',
  }), { message });
});

test('persistence sends the mode and preserves server-provided interactions on start and resume', async () => {
  const window = {}, calls = [];
  vm.runInNewContext(read('assessment-persistence.js'), { window });
  const currentItem = { id: 'qbank:test:child', type: 'highlight', segments: [{ id: 'finding', t: 'Synthetic finding' }] };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'synthetic' } } } }) },
    functions: { invoke: async (_name, { body }) => {
      calls.push(body);
      return { data: { attempt: { id: 'attempt', checkpoint: { scoringModel: 'in-house-ngn-v1' } }, currentItemId: currentItem.id, currentItem, responses: [] } };
    } },
  };
  const created = await window.NCLEX_ASSESSMENT_PERSISTENCE.createAttempt({ supabase, sessionKey: 'synthetic', profile: { mode: 'mock' } });
  const resumed = await window.NCLEX_ASSESSMENT_PERSISTENCE.resumeAttempt({ supabase, assessmentKey: 'diagnostic-mock' });
  assert.equal(calls[0].mode, 'mock');
  assert.equal(created.currentItem.id, currentItem.id);
  assert.equal(resumed.currentItem.id, currentItem.id);
});

test('student history retains server-scored NGN credit, versions, rationales and child IDs', () => {
  const html = read('diagnostic.html');
  const source = html.slice(html.indexOf('function restoreResponseHistory('), html.indexOf('function itemProbability('));
  const context = { QUESTION_BANK: [], REMEDIATION_BANK: [] };
  vm.runInNewContext(source, context);
  const response = {
    item_id: 'qbank:test:child', sourceId: 'qbank:test', question_type: 'highlight',
    selected_answer: ['finding'], is_correct: false, scoringModel: 'in-house-ngn-v1', scoringVersion: 'ngn-v1',
    interaction: { prompt: 'Synthetic prompt', rationale: 'Synthetic rationale' },
    credit: { earned: 1, max: 2 }, contentVersion: 'hash', caseIndex: 1, caseLength: 6,
  };
  const record = context.restoreResponseHistory([response])[0];
  assert.equal(record.id, response.item_id);
  assert.equal(record.sourceId, response.sourceId);
  assert.equal(record.stem, response.interaction.prompt);
  assert.equal(record.credit.earned, 1);
  assert.equal(record.scoringModel, 'in-house-ngn-v1');
  assert.equal(record.contentVersion, 'hash');
  assert.equal(record.caseLength, 6);
});

test('local pause checkpoints preserve the current scoring version and legacy defaults', () => {
  const html = read('diagnostic.html');
  const source = html.slice(html.indexOf('function readinessCheckpoint('), html.indexOf('function restoreResponseHistory('));
  const context = {};
  vm.runInNewContext(source, context);
  assert.equal(context.readinessCheckpoint({}).assessmentVersion, 'in-house-core-v1');
  const checkpoint = context.readinessCheckpoint({ schemaVersion: 4, assessmentVersion: 'in-house-ngn-v1' });
  assert.equal(checkpoint.schemaVersion, 4);
  assert.equal(checkpoint.assessmentVersion, 'in-house-ngn-v1');
});

test('tutor review renders stored NGN response details without a legacy-bank lookup or binary-only answer formatter', () => {
  const window = {};
  const context = { window };
  vm.runInNewContext(read('ngn-scoring.js'), context);
  window.NGNScoring = context.NGNScoring;
  vm.runInNewContext(read('exam-ui-ngn.js'), context);
  const html = read('shared-progress.html');
  const source = html.slice(html.indexOf('function renderAttemptReviewHtml('), html.indexOf('async function loadAndRenderPracticeReview('));
  const responses = [{
    item_id: 'qbank:test:child', selected_answer: ['finding'], is_correct: true, question_type: 'highlight',
    scoringModel: 'in-house-ngn-v1', scoringVersion: 'ngn-v1', contentVersion: 'hash', caseIndex: 0, caseLength: 6,
    credit: { earned: 1, max: 1, rule: 'plus-minus' }, rationale: 'Synthetic rationale',
    interaction: { type: 'highlight', prompt: 'Synthetic prompt', segments: [{ id: 'finding', t: 'Synthetic finding', correct: true }] },
  }];
  Object.assign(context, {
    ExamUI: window.ExamUI, attemptResponsesCache: new Map([['attempt', { responses, filter: 'all', isSwmCat: false }]]),
    esc: window.ExamUI.esc, NCLEXCats: { canon: value => value },
    getRationaleText: value => value,
    findAuthoritativeItem() { throw new Error('NGN review must use the stored snapshot'); },
    formatAnswerDisplay() { throw new Error('Legacy formatter cannot interpret an NGN answer'); },
  });
  vm.runInNewContext(source, context);
  const container = { querySelectorAll: () => [] };
  context.renderAttemptReviewHtml('attempt', container);
  assert.match(container.innerHTML, /1\/1 points/);
  assert.match(container.innerHTML, /Synthetic prompt/);
  assert.match(container.innerHTML, /Synthetic finding/);
  assert.match(container.innerHTML, /Synthetic rationale/);
  assert.match(container.innerHTML, /Content version: hash/);
  assert.match(container.innerHTML, /in-house-ngn-v1/);
  delete window.ExamUI;
  context.renderAttemptReviewHtml('attempt', container);
  assert.match(container.innerHTML, /updated question-review modules could not load/);
  assert.doesNotMatch(container.innerHTML, /1\/1 points/);
});

test('new renderer refuses unavailable or mismatched scoring instead of silently changing scoring rules', () => {
  for (const scorer of [undefined, { VERSION: 'old' }]) {
    const window = { NGNScoring: scorer };
    vm.runInNewContext(read('exam-ui-ngn.js'), { window });
    assert.throws(() => window.ExamUI.score({ type: 'mcq', correct: 0 }, 0), /scoring module could not load/);
    assert.throws(() => window.ExamUI.isAnswered({ scoringVersion: 'ngn-v1' }, []), /scoring module could not load/);
  }
});

test('changed non-JSX HTML scripts parse and every shared renderer page loads the scoring dependency first', () => {
  for (const name of ['shared-progress.html', 'question-bank-review.html']) {
    for (const match of read(name).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  }
  for (const name of ['diagnostic.html', 'shared-progress.html', 'question-bank-review.html', 'supplemental-practice.html', 'bianca-nur215.html', 'madison-diagnostic.html']) {
    const html = read(name);
    const scorer = html.indexOf('src="ngn-scoring.js?v=ngn-cat-v1"');
    assert.ok(scorer >= 0 && scorer < html.indexOf('src="exam-ui-ngn.js?v=ngn-cat-v1"'), name);
  }
});
