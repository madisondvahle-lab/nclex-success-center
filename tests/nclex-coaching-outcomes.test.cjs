const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const api = require('../nclex-coaching-outcomes-data.js');
const today = '2026-10-28';
function fixture() {
  return {
    students: [{ id: 'student', name: 'PRIVATE NAME', archived_at: '2026-10-27', email: 'PRIVATE EMAIL' }],
    tracking: [{ student_id: 'student', report_id: 'anonymous-report-id', history_reviewed: true, notes: 'PRIVATE NOTES' }],
    purchases: [{ id: 'purchase', student_id: 'student', package_name: 'NCLEX coaching', purchased_on: '2026-09-01',
      payment_status: 'verified', payment_verified_on: '2026-09-01', payment_reference: 'PRIVATE PAYMENT' }],
    sessions: [{ id: 'session', purchase_id: 'purchase', status: 'completed', completed_on: '2026-09-02', completion_reference: 'PRIVATE ATTENDANCE' }],
    attempts: [{ id: 'attempt', student_id: 'student', attempt_number: 1, test_date: '2026-10-01', result: 'pass', exam_type: 'RN', candidate_type: 'first_time', exam_taken: true }],
    evidence: [{ id: 'evidence', attempt_id: 'attempt', method: 'student_report', supports_attempt: true, observed_result: 'pass',
      exam_date: '2026-10-01', exam_type: 'RN', checked_on: '2026-10-02', source_reference: 'PRIVATE SOURCE',
      storage_path: 'PRIVATE PATH', file_name: 'PRIVATE FILE', checked_by: 'PRIVATE ADMIN' }],
    intakes: [], bookings: []
  };
}
const rows = data => api.buildRows(data, today);
test('known rate includes explicit student reports without claiming independent verification', () => {
  const r = rows(fixture());
  assert.equal(r[0].status, 'pass');
  assert.equal(r[0].verification.level, 'student_reported');
  const s = api.summarize(r);
  assert.equal(s.passRate, 1); assert.equal(s.verificationCoverage, 0);
  assert.equal(s.independentlyChecked, 0);
});
test('zero recorded outcomes and empty cohorts never display a 100% rate', () => {
  const d = fixture(); d.attempts = []; d.evidence = [];
  const s = api.summarize(rows(d));
  assert.equal(s.awaiting, 1); assert.equal(s.passRate, null);
  assert.equal(api.percent(s.passRate), 'Insufficient data');
  assert.equal(api.summarize([]).passRate, null);
});
test('scheduled dates never become tested automatically, and legacy attendance needs explicit review', () => {
  const d = fixture(); d.attempts[0].exam_taken = false; d.attempts[0].result = null;
  assert.equal(api.summarize(rows(d)).tested, 0);
  assert.equal(rows(d)[0].status, 'awaiting_exam');
  d.attempts[0].exam_taken = null; d.attempts[0].result = 'pass';
  assert.equal(rows(d)[0].status, 'review_required');
  assert.equal(api.summarize(rows(d)).known, 0);
});
test('earliest post-coaching failure is never replaced by a later pass or filter', () => {
  const d = fixture();
  d.attempts[0].result = 'fail'; d.evidence[0].observed_result = 'fail';
  d.attempts.push({ ...d.attempts[0], id: 'later', attempt_number: 2, test_date: '2026-10-20', result: 'pass', candidate_type: 'retaker', exam_type: 'PN' });
  d.evidence.push({ ...d.evidence[0], attempt_id: 'later', observed_result: 'pass', exam_date: '2026-10-20', exam_type: 'PN' });
  const r = rows(d);
  assert.equal(r.length, 1); assert.equal(r[0].status, 'fail');
  assert.equal(api.filterRows(r, { from: '2026-10-15' }).length, 0);
  assert.equal(api.filterRows(r, { exam: 'PN' }).length, 0);
  assert.equal(api.filterRows(r, { candidate: 'retaker' }).length, 0);
});
test('pre-coaching attempts remain history; lifetime number identifies a repeat candidate', () => {
  const d = fixture();
  d.attempts.unshift({ ...d.attempts[0], id: 'before', test_date: '2026-08-01', result: 'fail' });
  d.attempts[1].attempt_number = 2; d.attempts[1].candidate_type = 'retaker';
  const r = rows(d)[0];
  assert.equal(r.primary.id, 'attempt'); assert.equal(r.status, 'pass');
});
test('payment verification and completed sessions both required; void and future sessions excluded', () => {
  for (const change of [
    d => { d.purchases[0].payment_status = 'unverified'; },
    d => { d.purchases[0].payment_reference = ''; },
    d => { d.sessions = []; },
    d => { d.sessions[0].status = 'void'; },
    d => { d.sessions[0].completed_on = '2026-11-01'; },
    d => { d.sessions[0].completed_on = '2026-08-31'; }
  ]) {
    const d = fixture(); change(d);
    assert.equal(rows(d)[0].eligible, false);
    assert.equal(api.filterRows(rows(d)).length, 0);
  }
});
test('free/strategy/cancelled/no-show bookings cannot qualify as completed coaching', () => {
  for (const type of ['free_consultation', 'strategy_session', 'tutoring_session']) {
    for (const status of ['completed', 'scheduled', 'cancelled', 'no_show']) {
      const d = fixture(); d.sessions[0].consultation_id = 'booking';
      d.bookings = [{ id: 'booking', student_id: 'student', consult_type: type, status }];
      assert.equal(rows(d)[0].eligible, type === 'tutoring_session' && status === 'completed');
    }
  }
});
test('converted-intake links reuse student identity and do not duplicate records', () => {
  const d = fixture();
  d.intakes = [{ id: 'intake', student_id: 'student' }];
  d.attempts[0].student_id = null; d.attempts[0].consult_intake_id = 'intake';
  d.sessions[0].consultation_id = 'booking';
  d.bookings = [{ id: 'booking', consult_intake_id: 'intake', consult_type: 'tutoring_session', status: 'completed' }];
  assert.equal(rows(d)[0].status, 'pass'); assert.equal(rows(d).length, 1);
});
test('Nursys licensure alone is not proof of an examination attempt', () => {
  const d = fixture();
  Object.assign(d.evidence[0], { method: 'license', identity_checked: true, licensing_board: 'State', license_type: 'RN', supports_attempt: false });
  assert.equal(rows(d)[0].verification.level, 'unverified');
  assert.equal(rows(d)[0].status, 'unknown');
  d.evidence[0].supports_attempt = true;
  assert.equal(rows(d)[0].verification.level, 'independent');
  assert.equal(rows(d)[0].status, 'pass');
  d.evidence[0].identity_checked = false;
  assert.equal(rows(d)[0].verification.level, 'unverified');
});
test('license lookup cannot prove failure; absence stays unknown', () => {
  const d = fixture();
  d.attempts[0].result = 'fail';
  Object.assign(d.evidence[0], { method: 'license', identity_checked: true, licensing_board: 'State', license_type: 'RN', observed_result: 'fail' });
  assert.equal(rows(d)[0].status, 'unknown');
  d.evidence = [];
  assert.equal(rows(d)[0].status, 'unknown');
});
test('Quick Results remain unofficial documentation, never independent', () => {
  const d = fixture(); d.evidence[0].method = 'quick_results';
  assert.equal(rows(d)[0].verification.level, 'documented');
  assert.equal(api.summarize(rows(d)).verificationCoverage, 1);
  assert.match(api.methods.quick_results, /unofficial/);
});
test('changed result/date/type or revoked evidence invalidates previous verification', () => {
  for (const patch of [{ result: 'fail' }, { test_date: '2026-10-02' }, { exam_type: 'PN' }]) {
    const d = fixture(); Object.assign(d.attempts[0], patch);
    assert.equal(rows(d)[0].verification.level, 'unverified');
    assert.equal(rows(d)[0].status, 'unknown');
  }
  const d = fixture(); d.evidence[0].revoked_at = '2026-10-03';
  assert.equal(rows(d)[0].status, 'unknown');
});
test('missing history/classification, duplicate dates/numbers, and same-day ambiguity cannot inflate rates', () => {
  for (const change of [
    d => { d.tracking[0].history_reviewed = false; },
    d => { d.attempts[0].candidate_type = null; },
    d => { d.attempts.push({ ...d.attempts[0], id: 'undated', attempt_number: 2, test_date: null }); },
    d => { d.attempts.push({ ...d.attempts[0], id: 'duplicate-date', attempt_number: 2 }); },
    d => { d.attempts.push({ ...d.attempts[0], id: 'duplicate-number', test_date: '2026-10-10' }); },
    d => { d.attempts.push({ ...d.attempts[0], id: 'same-day', attempt_number: 2, test_date: '2026-09-02' }); }
  ]) {
    const d = fixture(); change(d);
    assert.ok(rows(d)[0].reasons.length);
    assert.equal(api.summarize(rows(d)).known, 0);
  }
});
test('tested population includes unknown, unverified, and pending results', () => {
  const datasets = [fixture(), fixture(), fixture(), fixture()];
  datasets[1].attempts[0].result = 'fail'; datasets[1].evidence[0].observed_result = 'fail';
  datasets[2].attempts[0].result = 'unknown'; datasets[3].attempts[0].result = null;
  const r = datasets.flatMap(rows);
  const s = api.summarize(r);
  assert.equal(s.tested, 4); assert.equal(s.known, 2);
  assert.equal(s.passes, 1); assert.equal(s.failures, 1); assert.equal(s.unknown, 1); assert.equal(s.pending, 1);
  assert.equal(s.passRate, .5);
});
test('extra purchases/sessions do not count a student twice or make later packages change the first attempt', () => {
  const d = fixture();
  d.purchases.push({ ...d.purchases[0], id: 'purchase-2', package_name: 'Later package', purchased_on: '2026-10-02' });
  d.sessions.push({ ...d.sessions[0], id: 'session-2', purchase_id: 'purchase-2', completed_on: '2026-10-03' });
  assert.equal(api.summarize(rows(d)).eligible, 1);
  assert.equal(rows(d)[0].qualifying.length, 1);
  assert.equal(api.filterRows(rows(d), { package: 'Later package' }).length, 0);
});
test('date-filtered exports separate untested students from the tested date cohort', () => {
  const d = fixture(); d.attempts = []; d.evidence = [];
  d.tracking[0].planned_exam_type = 'PN'; d.tracking[0].planned_candidate_type = 'retaker';
  const r = rows(d);
  assert.equal(api.filterRows(r, { exam: 'PN', candidate: 'retaker', from: '2026-10-01' }).length, 1);
  const report = api.reviewerReport(r, { from: '2026-10-01' }, today);
  assert.equal(report.summary.eligible, 0); assert.equal(report.awaitingOrReviewOutsideDateCohort, 1);
  assert.equal(report.students[0].cohortMember, false);
});
test('reviewer JSON/CSV excludes identity, private data, and arbitrary free text', () => {
  const d = fixture(); d.purchases[0].package_name = 'PRIVATE PACKAGE WITH NAME';
  const report = api.reviewerReport(rows(d), { package: 'PRIVATE PACKAGE WITH NAME' }, today);
  for (const content of [JSON.stringify(report), api.csv(report)]) {
    assert.doesNotMatch(content, /PRIVATE/);
    assert.doesNotMatch(content, /"student_id"|"attempt_id"|"checked_by"|"storage_path"/);
    assert.match(content, /anonymous-report-id/);
  }
});
test('invalid dates/ranges fail explicitly; incomplete roster stops reporting', () => {
  assert.equal(api.date('2026-02-30'), false);
  assert.throws(() => api.buildRows(fixture(), 'bad'), /valid reporting date/);
  assert.throws(() => api.filterRows(rows(fixture()), { from: '2026-10-20', to: '2026-10-01' }), /valid examination date range/);
  const d = fixture(); d.students = [];
  assert.throws(() => rows(d), /Reporting has stopped/);
});
test('UI scripts parse; admin entry, private signed access, immutable uploads and authorization are wired', () => {
  const read = file => readFileSync(new URL('../' + file, 'file://' + __filename), 'utf8');
  const js = read('nclex-coaching-outcomes.js');
  new vm.Script(js);
  assert.match(read('madison-admin.html'), /href="madison-coaching-outcomes.html"/);
  assert.match(js, /from\('app_admins'\)/);
  assert.match(js, /createSignedUrl\(e.storage_path, 300\)/);
  assert.match(js, /upsert: false/);
  assert.doesNotMatch(js, /getPublicUrl|functions\.invoke|from\('students'\)\.(?:insert|update)/);
  assert.match(js, /crypto.subtle.digest\('SHA-256'/);
});
