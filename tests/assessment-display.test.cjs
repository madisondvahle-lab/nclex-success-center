const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = name => readFileSync(join(__dirname, '..', name), 'utf8');
const window = {};
vm.runInNewContext(read('assessment-display.js'), { window, URLSearchParams });
const display = window.AssessmentDisplay;
const html = read('diagnostic.html');

test('all five supported entry URLs select their internal mode; unknown inputs select practice', () => {
  for (const mode of Object.keys(display.modes)) assert.equal(display.entryMode(`?mode=${mode}`), mode);
  for (const query of ['', '?mode=unknown', '?mode=MOCK', '?mode=__proto__', '?mode=constructor']) {
    assert.equal(display.entryMode(query), 'practice');
  }
  assert.equal(display.entryMode('?mode=mock&assignment=example'), 'mock');
  assert.match(html, /useState\(\(\) => ASSESSMENT_DISPLAY.entryMode\(window.location.search\)\)/);
});

test('saved PASS/FAIL are relabeled, never recalculated from a percent or ability', () => {
  assert.equal(display.classification('nclex', 'PASS').label, 'Above Study Benchmark');
  assert.equal(display.classification('nclex', 'FAIL').label, 'Below Study Benchmark');
  assert.equal(display.classification('mock', 'PASS').label, 'PASS');
  assert.equal(display.classification('mock', 'FAIL').label, 'FAIL');
  for (const mode of ['nclex', 'mock']) {
    for (const result of [null, undefined, '', 'INCONCLUSIVE', 'unknown']) {
      assert.equal(display.classification(mode, result).label, 'Insufficient Evidence');
      assert.equal(display.classification(mode, result).outcome, null);
    }
    for (const result of ['PASS', 'FAIL']) assert.equal(display.classification(mode, result).outcome, result);
  }
  for (const mode of ['practice', 'remediation', 'assessment']) {
    assert.equal(display.classification(mode, 'PASS'), null);
  }
  assert.doesNotMatch(html.slice(html.indexOf('function ResultsScreen'), html.indexOf('function CATInteraction')), /pct>=75\)\)/);
});

test('historical baseline attempts stored with practice mode retain baseline display identity', () => {
  const saved = { mode: 'practice', assessment_key: 'readiness-assessment', result: null };
  assert.equal(display.modeForAttempt(saved), 'assessment');
  assert.equal(display.label(display.modeForAttempt(saved)), 'Initial Baseline Assessment');
  assert.deepEqual(saved, { mode: 'practice', assessment_key: 'readiness-assessment', result: null });
});

test('activity history displays new names without mutating stored titles, modes or scores', () => {
  const history = read('shared-progress.html');
  const card = { querySelectorAll: () => [] };
  const document = {
    getElementById: () => null,
    createElement: () => card,
    querySelector: () => ({ insertBefore() {}, lastElementChild: {} })
  };
  const context = {
    AssessmentDisplay: display, document, isAdmin: false,
    esc: value => String(value), fmtDateTime: value => value
  };
  vm.runInNewContext(history.slice(history.indexOf('    function renderPortalActivity('), history.indexOf('    async function openReport(')), context);
  const attempts = Object.keys(display.modes).map((mode, i) => ({
    id: `synthetic-${i}`, mode: mode === 'assessment' ? 'practice' : mode,
    assessment_key: mode === 'assessment' ? 'readiness-assessment' : `diagnostic-${mode}`,
    assessment_title: 'Historical stored title', result: 'PASS',
    status: 'completed', completed_at: '2026-10-01', total_questions: 10, correct_questions: 7
  }));
  const before = JSON.stringify(attempts);
  context.renderPortalActivity(attempts, [], null, null);
  for (const mode of Object.keys(display.modes)) assert.ok(card.innerHTML.includes(display.label(mode)));
  assert.ok(card.innerHTML.includes('7/10 correct · 70%'));
  assert.equal(JSON.stringify(attempts), before);
});

test('completion copy uses recorded reasons and does not invent a legacy reason', () => {
  assert.match(display.completionMessage({ reason: 'insufficient-items' }), /no further eligible questions/);
  assert.match(display.completionMessage({ reason: 'confidence-rule' }), /coverage and evidence requirements/);
  for (const mode of ['nclex', 'mock']) {
    assert.match(display.completionMessage({ mode, reason: 'item-limit-or-fixed-length' }), /question limit/);
    assert.match(display.completionMessage({ mode, total: 20, target: 45 }), /does not identify/);
  }
  for (const mode of ['practice', 'remediation', 'assessment']) {
    assert.match(display.completionMessage({ mode, total: 85, target: 85 }), /planned length/);
  }
});

test('baseline access and CAT/NGN protocol guards remain in place', () => {
  assert.match(html, /const ASSESSMENT_ONLY = new URLSearchParams\(window.location.search\).get\('mode'\) === 'assessment'/);
  assert.match(html, /if \(ASSESSMENT_ONLY && student.portal_stage !== 'assessment'\) \{ location.replace\('student-dashboard.html'\); return; \}/);
  for (const protocol of ['ngn-cat-v1', 'sata-order-v1', 'ngn-v1']) assert.ok(html.includes(protocol));
  const server = read('supabase/functions/diagnostic-assessment/index.ts');
  assert.match(server, /mode === 'assessment' && context.student.portal_stage !== 'assessment'/);
});

test('completion metadata is forwarded for display, not submitted as a scoring input', () => {
  assert.match(html, /reason:submissionResult\?\.completionReason \|\| null/);
  assert.match(html, /setFinalCompletionInfo\(completionInfo\)/);
  assert.doesNotMatch(read('assessment-persistence.js'), /AssessmentDisplay|completionInfo/);
});

test('mode cards and result panels have responsive layouts and accessible selection', () => {
  assert.match(html, /aria-pressed=\{mode===m.val\}/);
  assert.match(html, /@media \(max-width: 540px\)/);
  assert.match(html, /\.mode-options \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /not an official NCLEX result or a validated prediction of passing/);
  assert.match(html, /does not automatically target every question missed/);
});
