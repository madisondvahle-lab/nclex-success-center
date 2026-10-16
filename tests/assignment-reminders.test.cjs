const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');
const read = file => readFileSync(join(__dirname, '..', file), 'utf8');
function helpers() {
  const context = { window: {}, URL };
  vm.runInNewContext(read('weekly-assignments.js'), context);
  return context.window.WeeklyAssignments;
}
const row = (id, due_on, assignment_kind = 'practice', completed_at = null) => ({
  id, due_on, assignment_kind, completed_at, assignment_week: '2026-10-12'
});
test('reminders use actual incomplete dated assignments, including old overdue work and only the next future CAT date', () => {
  const W = helpers();
  const resources = [
    row('later-cat', '2026-10-20', 'cat'), row('done', '2026-10-12', 'practice', 'saved'),
    row('tomorrow', '2026-10-15'), row('today', '2026-10-14'), row('old', '2026-10-01'),
    row('future-practice', '2026-10-16'), row('next-cat', '2026-10-17', 'cat'),
    row('overdue-cat', '2026-10-13', 'cat'),
    { id: 'template', practice_days: ['wed'], cat_days: ['sat'] },
    { id: 'legacy', due_on: '2026-10-14', resource_type: 'practice_set' }
  ];
  const result = W.reminders(resources, '2026-10-14');
  assert.deepEqual(Array.from(result.items, r => [r.item.id, r.label]), [
    ['old', 'Overdue'], ['overdue-cat', 'Overdue'], ['today', 'Due today'],
    ['tomorrow', 'Due tomorrow'], ['next-cat', 'Next CAT']
  ]);
  resources.find(r => r.id === 'next-cat').completed_at = 'saved';
  assert.equal(W.reminders(resources, '2026-10-14').items.at(-1).item.id, 'later-cat');
});
test('empty, completed, future-only, and malformed dates stay distinct without rolling invalid dates', () => {
  const W = helpers();
  assert.equal(W.reminders([], '2026-10-14').count, 0);
  assert.equal(W.reminders([row('done', '2026-10-12', 'cat', 'saved')], '2026-10-14').pending, 0);
  assert.equal(W.reminders([row('future', '2026-11-01')], '2026-10-14').items.length, 0);
  const invalid = W.reminders([row('bad', '2026-02-30'), row('none', null)], '2026-10-14');
  assert.equal(invalid.invalid, 2);
  assert.equal(invalid.items.length, 0);
  assert.throws(() => W.monday('2026-02-30'), /valid date/);
});
test('local calendar dates survive UTC offsets, midnight, DST and year rollover', () => {
  const script = `
    const vm = require('node:vm'), fs = require('node:fs');
    const context = { window: {} }; vm.runInNewContext(fs.readFileSync('weekly-assignments.js','utf8'), context);
    const W = context.window.WeeklyAssignments;
    // Construct Date in the helper realm so instanceof follows browser semantics.
    context.nowText = '2026-12-31T23:55:00';
    vm.runInNewContext('window.result = window.WeeklyAssignments.reminders([{id:"next",assignment_week:"2026-12-28",assignment_kind:"practice",due_on:"2027-01-01"}], new Date(nowText))', context);
    console.log(JSON.stringify([context.window.result.items[0].label, W.reminders([{id:'dst',assignment_week:'2026-03-02',assignment_kind:'practice',due_on:'2026-03-09'}], '2026-03-08').items[0].label, W.reminders([{id:'date',assignment_week:'2026-10-12',assignment_kind:'practice',due_on:'2026-10-14'}], '2026-10-14').items[0].date]));
  `;
  for (const TZ of ['America/Los_Angeles', 'Pacific/Kiritimati', 'America/New_York']) {
    const result = JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: join(__dirname, '..'), env: { ...process.env, TZ }, encoding: 'utf8' }));
    assert.deepEqual(result, ['Due tomorrow', 'Due tomorrow', 'Wed, Oct 14, 2026'], TZ);
  }
});
test('action URLs reject executable schemes but retain stored assignment links', () => {
  const W = helpers(), base = 'https://portal.studywithmadison.com/student-dashboard.html';
  assert.equal(W.actionUrl('supplemental-practice.html?assignment=one', base), 'https://portal.studywithmadison.com/supplemental-practice.html?assignment=one');
  for (const url of ['', null, 'javascript:alert(1)', 'data:text/html,bad']) assert.equal(W.actionUrl(url, base), '');
});
test('both roles render visible empty/error states, escape assignment content, and refresh from the same student-scoped query', async () => {
  const html = read('student-dashboard.html');
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  assert.match(html, /window\.addEventListener\('focus', refreshAssignmentReminders\)/);
  assert.match(html, /event\.persisted/);
  assert.match(html, /if \(!document\.hidden\) refreshAssignmentReminders/);
  let output = '', queryStudent, response = { data: [], error: null };
  const hostClasses = new Set();
  const host = {
    set innerHTML(value) { output = value; }, get innerHTML() { return output; },
    classList: {
      toggle(name, force) { if (force) hostClasses.add(name); else hostClasses.delete(name); },
      contains(name) { return hostClasses.has(name); }
    },
    querySelector: () => ({ addEventListener() {} }), querySelectorAll: () => []
  };
  const context = {
    document: { getElementById: id => id.startsWith('assignment-reminders-') ? host : { innerHTML: '', querySelectorAll: () => [] } }, location: { href: 'https://portal.studywithmadison.com/student-dashboard.html' },
    WeeklyAssignments: helpers(), text: v => String(v ?? '').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    studentResourceText: v => String(v).replaceAll('<', '&lt;'),
    db: { from: table => { assert.equal(table, 'student_resources'); return { select: () => ({ eq: (field, id) => {
      assert.equal(field, 'student_id'); queryStudent = id;
      return { order: async () => response };
    } }) }; } }, renderThisWeek: async () => {}
  };
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('let assignmentState ='), html.indexOf('function studentResourceText(')), context);
  for (const role of ['nclex', 'nursing']) {
    vm.runInContext(`assignmentState = { role: '${role}', student: { id: 'own-student' }, resources: [], busy: false }; renderAssignmentReminders();`, context);
    assert.match(output, /No dated practice or CAT assignments/);
    assert.equal(host.classList.contains('is-quiet'), true);
    response = { data: [row('done', '2026-10-14', 'practice', 'saved')], error: null };
    await context.refreshAssignmentReminders();
    assert.equal(queryStudent, 'own-student');
    assert.match(output, /All assigned practice and CATs are marked complete/);
    assert.equal(host.classList.contains('is-quiet'), true);
    response = { data: null, error: { message: 'Unavailable' } };
    await context.refreshAssignmentReminders();
    assert.match(output, /Could not load assignment reminders/);
    assert.equal(host.classList.contains('is-quiet'), false);
    assert.doesNotMatch(output, /All assigned practice/);
    response = { data: [{ ...row('unsafe', '2020-01-01'), title: '<img src=x onerror=bad>', url: 'javascript:bad()' }], error: null };
    await context.refreshAssignmentReminders();
    assert.match(output, /&lt;img/);
    assert.equal(host.classList.contains('is-quiet'), false);
    assert.doesNotMatch(output, /href="javascript:/);
    assert.match(output, /Assignment link unavailable/);
    response = { data: [], error: null };
    await context.refreshAssignmentReminders();
    assert.match(output, /No dated practice or CAT assignments/);
  }
  context.db.from = () => { throw new Error('Offline'); };
  const failure = await context.fetchStudentResources('own-student');
  assert.equal(failure.error.message, 'Offline');
});
