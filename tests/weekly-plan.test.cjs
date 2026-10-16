const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => readFileSync(join(__dirname, '..', file), 'utf8');

function load() {
  const context = { window: {} };
  for (const file of ['category-names.js', 'assessment-platforms.js', 'weekly-plan.js']) vm.runInNewContext(read(file), context);
  return context.window.WeeklyPlan;
}

test('default plan is 3 practice days x 50 questions and 2 spaced CATs', () => {
  const WP = load();
  const p = WP.normalize(WP.DEFAULTS);
  assert.deepEqual([...p.practice_days], ['mon', 'wed', 'fri']);
  assert.equal(p.practice_questions_per_day, 50);
  assert.equal(p.cat_days.length, 2);
  assert.ok(WP.catSpacingOk(p.cat_days));
  assert.equal(p.practice_days.filter(d => p.cat_days.includes(d)).length, 0);
  assert.match(WP.summary(WP.DEFAULTS), /150 Qs\/week/);
});

test('normalize cleans days, counts, platforms, categories and topics', () => {
  const WP = load();
  const p = WP.normalize({
    practice_days: ['FRI', 'monday', 'bogus', 'mon'], practice_questions_per_day: 999,
    practice_platform: ' uworld ', cat_days: ['sun', 'wed'], cat_platform: 'portal question bank',
    focus_categories: ['pharm', 'Safety and Infection Control', 'not a category', 'Pharmacological and Parenteral Therapies'],
    focus_topics: 'Cardiac, cardiac,  Pediatrics ,', plan_notes: '  note  '
  });
  assert.deepEqual([...p.practice_days], ['mon', 'fri']);
  assert.equal(p.practice_questions_per_day, 50);
  assert.equal(p.practice_platform, 'UWorld');
  assert.equal(p.cat_platform, WP.PORTAL);
  assert.deepEqual([...p.cat_days], ['wed', 'sun']);
  assert.deepEqual([...p.focus_categories], ['Safety and Infection Control', 'Pharmacological and Parenteral Therapies']);
  assert.deepEqual([...p.focus_topics], ['Cardiac', 'Pediatrics']);
  assert.equal(p.plan_notes, 'note');
  assert.deepEqual([...WP.normalize({ practice_days: [] }).practice_days], []);
});

test('platforms include Remar and NurseMeg and CAT tasks normalize per day', () => {
  const WP = load();
  const p = WP.normalize({
    cat_platform: 'UWorld',
    cat_assignments: {
      tue: { platform: 'Bootcamp', title: 'Bootcamp CAT assessment', instructions: 'Use CAT mode.' },
      sat: { platform: 'nurse meg', title: '  NurseMeg Readiness  ' },
      sun: { platform: 'remar' },
      bogus: { platform: 'Remar', title: 'Ignored invalid day' }
    }
  });
  assert.ok(WP.PLATFORMS.includes('Remar'));
  assert.ok(WP.PLATFORMS.includes('NurseMeg'));
  assert.deepEqual(JSON.parse(JSON.stringify(p.cat_assignments)), {
    tue: { platform: 'Bootcamp', title: 'Bootcamp CAT assessment', instructions: 'Use CAT mode.' },
    sat: { platform: 'NurseMeg', title: 'NurseMeg Readiness', instructions: '' },
    sun: { platform: 'Remar', title: '', instructions: '' }
  });
  assert.match(WP.summary(p), /Tue: Bootcamp — Bootcamp CAT assessment/);
});

test('CAT spacing flags back-to-back days, including across the week boundary', () => {
  const WP = load();
  assert.equal(WP.catSpacingOk(['tue', 'wed']), false);
  assert.equal(WP.catSpacingOk(['sun', 'mon']), false);
  assert.equal(WP.catSpacingOk(['tue', 'fri']), true);
  assert.equal(WP.catSpacingOk(['sat']), true);
});

test('unchanged CAT defaults normalize without creating phantom customizations', () => {
  const WP = load();
  assert.deepEqual(Object.keys(WP.normalize({
    cat_platform: 'Archer',
    cat_assignments: { tue: { platform: 'Archer', title: '', instructions: '' } }
  }).cat_assignments), []);
});

test('week view marks practice and CAT days', () => {
  const WP = load();
  const week = WP.week(WP.DEFAULTS);
  assert.equal(week.length, 7);
  assert.equal(week.filter(d => d.practice).length, 3);
  assert.deepEqual([...week.filter(d => d.cat).map(d => d.day)], ['tue', 'sat']);
});

test('student day changes preserve workload, separate practice from CATs, and space CATs across weeks', () => {
  const WP = load();
  assert.equal(WP.dayChangeError(WP.DEFAULTS, ['tue', 'thu', 'sun'], ['mon', 'fri']), '');
  assert.match(WP.dayChangeError(WP.DEFAULTS, ['tue'], ['mon', 'fri']), /3 practice days and 2 CAT days/);
  assert.match(WP.dayChangeError(WP.DEFAULTS, ['mon', 'wed', 'fri'], ['mon', 'sat']), /separate days/);
  assert.match(WP.dayChangeError(WP.DEFAULTS, ['tue', 'thu', 'fri'], ['sun', 'mon']), /between CAT/);
  assert.match(WP.dayChangeError(WP.DEFAULTS, ['mon', 'mon', 'fri'], ['tue', 'sat']), /only once/);
  assert.match(WP.dayChangeError(WP.DEFAULTS, ['mon', 'bad', 'fri'], ['tue', 'sat']), /valid days/);
  assert.match(WP.dayChangeError(WP.DEFAULTS, null, []), /valid days/);
  assert.equal(WP.dayChangeError({ practice_days: [], cat_days: [] }, [], []), '');
});

test('student schedule RPC changes only owner days and checks stale edits without broad update access', () => {
  const sql = read('supabase-student-study-days-migration.sql');
  assert.match(sql, /s\.auth_user_id = auth\.uid\(\) AND s\.archived_at IS NULL/);
  assert.match(sql, /student_type IS DISTINCT FROM 'nursing_student'/);
  assert.match(sql, /FOR UPDATE OF sp/);
  assert.match(sql, /updated_at IS DISTINCT FROM p_expected_updated_at/);
  assert.match(sql, /cardinality\(practice\) <> cardinality\(saved\.practice_days\)/);
  assert.match(sql, /IF practice && cats/);
  assert.match(sql, /SET practice_days = practice, cat_days = cats, updated_at = clock_timestamp\(\)/);
  assert.match(sql, /FROM PUBLIC, anon/);
  assert.doesNotMatch(sql, /CREATE POLICY|UPDATE public\.student_resources|SET (focus|practice_questions|practice_platform|cat_platform)/i);
  const page = read('student-dashboard.html');
  assert.doesNotMatch(page, /Ready to practice\?|roadmap-nclex|daily-priorities-nclex|What matters now/);
  assert.match(page, /assignmentState\?\.isPreview/);
  assert.match(page, /studyCalendarState\.plan = data/);
});

test('migration extends the existing RLS-protected plan table additively', () => {
  const sql = read('supabase-weekly-study-plan-migration.sql');
  assert.match(sql, /ALTER TABLE student_study_plans\s+ADD COLUMN IF NOT EXISTS/);
  assert.doesNotMatch(sql, /CREATE TABLE/i);
  assert.doesNotMatch(sql, /DROP (TABLE|COLUMN)/i);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FOR ALL TO authenticated USING \(public\.is_app_admin\(\)\) WITH CHECK \(public\.is_app_admin\(\)\)/);
  assert.match(sql, /FOR SELECT TO authenticated USING \(\s*EXISTS \(SELECT 1 FROM students WHERE students\.id = student_study_plans\.student_id AND students\.auth_user_id = auth\.uid\(\)\)/);
  assert.match(sql, /REVOKE ALL ON student_study_plans FROM anon/);
});

test('coach page and student dashboard load the helper, gate admin, and parse', () => {
  const admin = read('madison-study-plans.html');
  const student = read('student-dashboard.html');
  for (const html of [admin, student]) {
    assert.match(html, /<script src="weekly-plan\.js"><\/script>/);
    for (const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
  }
  assert.match(admin, /from\('app_admins'\)/);
  assert.match(admin, /onConflict:'student_id'/);
  assert.match(admin, /cat_assignments/);
  assert.match(student, /id="weekly-plan-card"[^>]*hidden/);
  assert.match(student, /cat\.title/);
  assert.doesNotMatch(student, /from\('student_study_plans'\)\.(upsert|insert|update|delete)/);
});

test('admin sidebars link to the weekly plans page', () => {
  for (const file of ['madison-assignments.html', 'madison-admin.html', 'shared-progress.html', 'assessment-history-admin.html']) {
    assert.match(read(file), /href="madison-study-plans\.html"/, file);
  }
});

test('practice minimum counts only practice days without a CAT, on any weekday or weekend', () => {
  const WP = load();
  assert.equal(WP.meetsPracticeMinimum(WP.DEFAULTS), true);
  assert.equal(WP.meetsPracticeMinimum({ practice_days: ['fri', 'sat', 'sun'], cat_days: ['tue', 'thu'] }), true);
  assert.equal(WP.meetsPracticeMinimum({ practice_days: ['mon', 'wed', 'sat'], cat_days: ['wed', 'sat'] }), false);
  assert.deepEqual([...WP.practiceOnlyDays({ practice_days: ['mon', 'wed', 'sat', 'sun'], cat_days: ['sat'] })], ['mon', 'wed', 'sun']);
});
