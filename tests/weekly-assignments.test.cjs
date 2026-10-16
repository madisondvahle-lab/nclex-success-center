const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = file => readFileSync(join(__dirname, '..', file), 'utf8');
function helpers() {
  const context = { window: {} };
  vm.runInNewContext(read('weekly-assignments.js'), context);
  return context.window.WeeklyAssignments;
}
test('assignment weeks start Monday across month/year boundaries', () => {
  const W = helpers();
  assert.equal(W.monday('2027-01-03'), '2026-12-28');
  assert.equal(W.monday('2026-10-12'), '2026-10-12');
  assert.equal(W.monday('2026-10-18'), '2026-10-12');
  assert.throws(() => W.monday('not-date'), /valid date/);
});
test('weekly progress counts completion once and separates practice from CATs', () => {
  const W = helpers();
  const rows = [
    { assignment_week: '2026-10-12', assignment_kind: 'practice', assignment_details: { question_count: 50 }, completed_at: '2026-10-13' },
    { assignment_week: '2026-10-12', assignment_kind: 'practice', assignment_details: { question_count: 50 } },
    { assignment_week: '2026-10-12', assignment_kind: 'cat', completed_at: '2026-10-14' },
    { assignment_week: '2026-10-05', assignment_kind: 'practice', assignment_details: { question_count: 100 }, completed_at: '2026-10-06' },
    { resource_type: 'practice_set', completed_at: '2026-10-14' }
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(W.progress(rows, '2026-10-12'))),
    { count: 3, done: 2, questions: 100, questionsDone: 50, cats: 1, catsDone: 1 });
});
test('removed dashboard assignment panels do not retain completion controls', () => {
  assert.doesNotMatch(read('student-dashboard.html'), /data-weekly-complete|set_weekly_assignment_complete/);
  assert.match(read('supplemental-practice.html'), /set_weekly_assignment_complete/);
});
test('portal assignments require exact stored active question set and preserve assignment identity', () => {
  const page = read('supplemental-practice.html');
  for (const m of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
  const loader = page.slice(page.indexOf('async function buildWeeklyAssignment('), page.indexOf('async function buildMixedReview('));
  assert.match(loader, /\.eq\('student_id',student\.id\)/);
  assert.match(loader, /\.in\('id',ids\)\.eq\('active',true\)\.eq\('item_type','mcq'\)/);
  assert.match(loader, /bank\.length!==ids\.length/);
  assert.match(loader, /assignmentId:id/);
  assert.match(page, /if\(!result.error&&activeSet.assignmentId\)/);
});
test('migration reuses resources, keeps generation admin-only, and restricts student completion', () => {
  const sql = read('supabase-weekly-assignments-migration.sql');
  assert.doesNotMatch(sql, /CREATE TABLE|DISABLE ROW LEVEL SECURITY|UPDATE public\.questions/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS student_resources_weekly_slot/);
  assert.match(sql, /IF NOT public\.is_app_admin\(\) THEN RAISE EXCEPTION/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /count\(DISTINCT d\).*NOT \(d = ANY\(p\.cat_days\)\)\) < 3/);
  assert.match(sql, /b\.active = true AND b\.item_type = 'mcq'/);
  assert.match(sql, /s\.auth_user_id = auth\.uid\(\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.set_weekly_assignment_complete\(uuid, boolean\) FROM PUBLIC, anon/);
  assert.doesNotMatch(sql, /CREATE POLICY.*UPDATE/i);
  const admin = read('madison-study-plans.html');
  assert.match(admin, /WP\.meetsPracticeMinimum\(selectedPlan\)/);
  assert.match(admin, /WP\.practiceOnlyDays\(selectedPlan\)/);
});
