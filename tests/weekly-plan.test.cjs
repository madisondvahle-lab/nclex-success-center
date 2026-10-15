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

test('CAT spacing flags back-to-back days, including across the week boundary', () => {
  const WP = load();
  assert.equal(WP.catSpacingOk(['tue', 'wed']), false);
  assert.equal(WP.catSpacingOk(['sun', 'mon']), false);
  assert.equal(WP.catSpacingOk(['tue', 'fri']), true);
  assert.equal(WP.catSpacingOk(['sat']), true);
});

test('week view marks practice and CAT days', () => {
  const WP = load();
  const week = WP.week(WP.DEFAULTS);
  assert.equal(week.length, 7);
  assert.equal(week.filter(d => d.practice).length, 3);
  assert.deepEqual([...week.filter(d => d.cat).map(d => d.day)], ['tue', 'sat']);
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
  assert.match(student, /id="weekly-plan-card"[^>]*hidden/);
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
