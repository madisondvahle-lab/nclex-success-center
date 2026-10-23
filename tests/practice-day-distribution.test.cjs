const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => readFileSync(join(__dirname, '..', file), 'utf8');

function load() {
  const context = { window: {}, Date };
  for (const file of ['category-names.js', 'assessment-platforms.js', 'weekly-plan.js', 'study-calendar.js']) {
    vm.runInNewContext(read(file), context, { filename: file });
  }
  return context.window;
}
const plain = value => JSON.parse(JSON.stringify(value));
const SAFETY = { platform: 'UWorld', total: 50, mixed: 35, targets: [{ kind: 'category', name: 'Safety and Infection Control', count: 15 }] };
const PLAN = {
  practice_days: ['mon', 'wed', 'fri'], practice_questions_per_day: 50, practice_platform: 'UWorld',
  cat_days: ['tue', 'sat'], cat_platform: 'UWorld', focus_categories: ['Physiological Adaptation'],
  practice_day_assignments: { wed: SAFETY, sun: SAFETY }
};

test('normalize keeps per-day distributions only for practice days and leaves other days on the plan default', () => {
  const { WeeklyPlan: WP } = load();
  const p = WP.normalize(PLAN);
  assert.deepEqual(Object.keys(p.practice_day_assignments), ['wed']);
  assert.deepEqual(plain(p.practice_day_assignments.wed), SAFETY);
  const week = WP.week(PLAN);
  assert.equal(week.find(d => d.day === 'mon').custom, null);
  assert.equal(week.find(d => d.day === 'wed').custom.total, 50);
  assert.equal(WP.practiceTotal(p), 150);
  assert.match(WP.summary(PLAN), /Custom days: Wed: 50 Qs \(35 mixed \+ 15 Safety and Infection Control\)/);
  assert.deepEqual(plain(WP.normalize({ ...PLAN, practice_day_assignments: null }).practice_day_assignments), {});
  assert.equal(WP.normalize({ ...PLAN, practice_day_assignments: { wed: { mixed: 10, total: 10 } } }).practice_day_assignments.wed.platform, 'UWorld',
    'Missing day platform falls back to the plan practice platform');
});

test('distribution validation requires counts to add up and mirrors the SQL rules', () => {
  const { WeeklyPlan: WP } = load();
  const check = item => WP.distributionError(WP.dayDistribution(item, 'UWorld'));
  assert.equal(check(SAFETY), '');
  assert.equal(check({ total: 50, mixed: 30, targets: [
    { kind: 'category', name: 'Management of Care', count: 10 },
    { kind: 'category', name: 'pharmacological and parenteral therapies', count: 10 }] }), '');
  assert.match(check({ total: 50, mixed: 30, targets: [{ kind: 'category', name: 'Management of Care', count: 10 }] }), /add up to 40, but the day total is 50/);
  assert.match(check({ total: 20, mixed: 0, targets: [{ kind: 'category', name: 'Cardiac', count: 20 }] }), /not an NCLEX/);
  assert.match(check({ total: 20, mixed: 10, targets: [{ kind: 'topic', name: 'Cardiac', count: 5 }, { kind: 'topic', name: 'cardiac', count: 5 }] }), /more than once/);
  assert.match(check({ total: 10, mixed: 0, targets: [{ kind: 'topic', name: '', count: 10 }] }), /Choose a category or enter a topic/);
  assert.match(check({ total: 10, mixed: 10, targets: [{ kind: 'topic', name: 'X', count: 0 }] }), /whole-number count/);
  assert.match(check({ total: 0, mixed: 0 }), /Total questions/);
  assert.match(check({ total: 10, mixed: 2.5 }), /Mixed questions/);
  const many = Array.from({ length: 9 }, (_, i) => ({ kind: 'topic', name: 'T' + i, count: 1 }));
  assert.match(check({ total: 9, mixed: 0, targets: many }), /up to 8/);
  assert.equal(WP.assigned(WP.dayDistribution({ total: 50, mixed: 30, targets: [{ kind: 'topic', name: 'X', count: 'bad' }] })), 30);
});

test('student description lists mixed and targeted counts, the remediation focus, and manual external setup', () => {
  const { WeeklyPlan: WP } = load();
  const info = WP.describe(WP.dayDistribution(SAFETY));
  assert.equal(info.heading, 'UWorld Practice, 50 Questions');
  assert.deepEqual(plain(info.lines), ['35 Mixed NCLEX Questions (all client-needs categories)', '15 Safety and Infection Control Questions']);
  assert.equal(info.focus, 'Safety and Infection Control');
  assert.match(info.setup, /Set this up yourself in UWorld/);
  assert.match(info.setup, /does not create or configure tests in UWorld/);
  const portal = WP.describe(WP.dayDistribution({ ...SAFETY, platform: 'Portal Question Bank' }));
  assert.match(portal.setup, /Open the assignment in the portal/);
  assert.doesNotMatch(portal.setup, /does not create/);
});

test('generated distribution assignments are recognized; ordinary and tampered ones are not', () => {
  const { WeeklyPlan: WP } = load();
  const resource = { assignment_details: { platform: 'Archer', question_count: 50, distribution: { mixed: 35, targets: SAFETY.targets } } };
  assert.equal(WP.assignmentDistribution(resource).platform, 'Archer');
  assert.equal(WP.assignmentDistribution({ assignment_details: { platform: 'UWorld', question_count: 50 } }), null);
  assert.equal(WP.assignmentDistribution({ assignment_details: { platform: 'UWorld', question_count: 40, distribution: { mixed: 35, targets: SAFETY.targets } } }), null);
});

test('calendar shows the custom day breakdown and assigned distributions while other days keep the default', () => {
  const { StudyCalendar } = load();
  const result = StudyCalendar.buildEvents({
    month: '2026-10', today: new Date(2026, 9, 12), examDate: '2026-10-30', plan: PLAN,
    resources: [{ due_on: '2026-10-16', title: 'Archer Practice: 50 questions', assignment_kind: 'practice', url: '',
      assignment_details: { platform: 'Archer', question_count: 50, distribution: { mixed: 30, targets: [
        { kind: 'category', name: 'Management of Care', count: 10 }, { kind: 'topic', name: 'Isolation', count: 10 }] } } }]
  });
  const monday = result.events.get('2026-10-12').find(e => e.kind === 'practice');
  assert.equal(monday.label, '50 practice questions');
  assert.equal(monday.lines, undefined);
  const wed = result.events.get('2026-10-14').find(e => e.kind === 'practice');
  assert.equal(wed.detail, 'UWorld');
  assert.deepEqual(plain(wed.lines), ['35 Mixed NCLEX Questions (all client-needs categories)', '15 Safety and Infection Control Questions']);
  assert.equal(wed.focus, 'Safety and Infection Control');
  const fri = result.events.get('2026-10-16');
  assert.equal(fri.length, 1, 'The dated assignment replaces the recurring plan day');
  assert.equal(fri[0].label, 'Archer Practice, 50 Questions');
  assert.equal(fri[0].focus, 'Management of Care, Isolation');
  assert.match(fri[0].setup, /does not create or configure tests in Archer/);
});

test('admin editor wires per-day customization, upcoming retargeting, and revision history', () => {
  const html = read('madison-study-plans.html');
  assert.match(html, /PLAN_COLS='[^']*practice_day_assignments/);
  assert.match(html, /id="custom-days"/);
  assert.match(html, /db\.rpc\('update_weekly_practice_assignment',\{p_resource:rid,p_config:cfg,p_expected_details:r\.assignment_details,p_reason:reason\}\)/);
  assert.match(html, /\.eq\('assignment_kind','practice'\)\.is\('completed_at',null\)\.gte\('due_on',todayIso\(\)\)/);
  assert.match(html, /from\('student_assignment_revisions'\)\.insert/);
  assert.match(html, /WP\.distributionError\(v\.practice_day_assignments\[d\]\)/, 'Save blocks invalid custom days');
  assert.match(html, /data-retarget=/);
  for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(code));
  const dash = read('student-dashboard.html');
  assert.match(dash, /Remediation Focus:/);
  assert.match(dash, /WeeklyPlan\.practiceTotal\(p\)/);
  assert.doesNotMatch(dash, /student_assignment_revisions/, 'Students never load the admin-only reason history');
  for (const [, code] of dash.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new vm.Script(code));
});

test('distribution migration is additive, keeps reasons admin-only, and limits retargeting to incomplete practice', () => {
  const sql = read('supabase-practice-day-distribution-migration.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS practice_day_assignments jsonb NOT NULL DEFAULT '\{\}'/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|TRUNCATE public\.|DELETE FROM public\./i);
  assert.match(sql, /ALTER TABLE public\.student_assignment_revisions ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE UPDATE, DELETE, TRUNCATE ON public\.student_assignment_revisions FROM authenticated/);
  assert.doesNotMatch(sql, /ON public\.student_assignment_revisions FOR (UPDATE|DELETE|ALL)/);
  for (const fn of ['weekly_question_category\\(text\\)', 'practice_distribution_error\\(jsonb\\)', 'practice_distribution_snapshot\\(uuid, text, jsonb, text\\)']) {
    assert.match(sql, new RegExp('REVOKE ALL ON FUNCTION public\\.' + fn + ' FROM PUBLIC, anon, authenticated'));
  }
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.update_weekly_practice_assignment\(uuid, jsonb, jsonb, text\) FROM PUBLIC, anon/);
  const rpc = sql.slice(sql.indexOf('FUNCTION public.update_weekly_practice_assignment'));
  assert.match(rpc, /is_app_admin\(\)/);
  assert.match(rpc, /Completed assignments/);
  assert.match(rpc, /Past assignments/);
  assert.match(rpc, /This assignment changed/);
});
