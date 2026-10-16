const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => readFileSync(join(__dirname, '..', file), 'utf8');

function loadCalendar() {
  const context = { window: {} };
  for (const file of ['category-names.js', 'assessment-platforms.js', 'weekly-plan.js', 'study-calendar.js']) {
    vm.runInNewContext(read(file), context, { filename: file });
  }
  return context.window.StudyCalendar;
}

test('month grid is six Monday-first weeks and its query range covers every visible date', () => {
  const calendar = loadCalendar();
  const range = calendar.visibleRange('2026-10');
  assert.equal(range.dates.length, 42);
  assert.equal(range.start, '2026-09-28');
  assert.equal(range.end, '2026-11-09');
  assert.equal(range.dates.at(-1), '2026-11-08');
  assert.equal(new Set(range.dates).size, 42);
});

test('NCLEX plan repeats to the target date and dated assignments replace matching plan days', () => {
  const calendar = loadCalendar();
  const result = calendar.buildEvents({
    month: '2026-10', today: new Date(2026, 9, 15), examDate: '2026-10-20',
    plan: {
      practice_days: ['mon', 'wed', 'fri'], practice_questions_per_day: 40,
      practice_platform: 'Archer', cat_days: ['tue', 'sat'], cat_platform: 'UWorld',
      focus_categories: ['Management of Care']
    },
    resources: [
      { due_on: '2026-10-16', title: 'Assigned practice', assignment_kind: 'practice', assignment_details: { platform: 'Archer' } },
      { due_on: '2026-10-17', title: 'Assigned CAT', assignment_kind: 'cat', completed_at: '2026-10-17T15:00:00Z' }
    ],
    consultations: [{ scheduled_start: '2026-10-19T16:30:00Z', consult_type: 'strategy_session' }]
  });
  assert.ok(result.events.get('2026-10-15') === undefined);
  assert.equal(result.events.get('2026-10-16').filter(item => item.type === 'plan').length, 0);
  assert.equal(result.events.get('2026-10-16').filter(item => item.type === 'assignment').length, 1);
  assert.equal(result.events.get('2026-10-17').filter(item => item.type === 'plan').length, 0);
  assert.equal(result.events.get('2026-10-17').find(item => item.type === 'assignment').completed, true);
  assert.equal(result.events.get('2026-10-19').find(item => item.type === 'plan').label, '40 practice questions');
  assert.equal(result.events.get('2026-10-19').find(item => item.type === 'consultation').label, 'Strategy session');
  assert.equal(result.events.get('2026-10-20').find(item => item.type === 'exam').label, 'NCLEX target date');
  assert.equal(result.events.get('2026-10-20').some(item => item.type === 'plan'), false);
  assert.equal(result.events.get('2026-10-21'), undefined);
});

test('nursing calendar uses class-specific exams and assigned work without NCLEX plan dates', () => {
  const calendar = loadCalendar();
  const result = calendar.buildEvents({
    month: '2026-10', today: new Date(2026, 9, 1), isNursing: true,
    studentExamDate: '2026-10-30',
    schedules: [{ class_code: 'NUR 312', class_name: 'NUR 312', next_exam_date: '2026-10-22' }],
    plan: { practice_days: ['mon'], cat_days: ['tue'] },
    resources: [{ due_on: '2026-10-18', title: 'Exam prep set', resource_type: 'practice_set' }]
  });
  assert.equal(result.events.get('2026-10-22')[0].label, 'NUR 312 exam');
  assert.equal(result.events.get('2026-10-18')[0].label, 'Exam prep set');
  assert.equal(result.events.get('2026-10-30'), undefined);
  assert.equal([...result.events.values()].flat().some(item => item.type === 'plan'), false);
});

test('student calendar excludes initial consults and labels tutoring appointments explicitly', () => {
  const calendar = loadCalendar();
  const result = calendar.buildEvents({
    month: '2026-10', today: new Date(2026, 9, 1),
    consultations: [
      { scheduled_start: '2026-10-12T16:00:00Z', consult_type: 'free_consultation' },
      { scheduled_start: '2026-10-13T16:00:00Z', consult_type: 'tutoring_session' }
    ]
  });
  assert.equal(result.events.get('2026-10-12'), undefined);
  assert.equal(result.events.get('2026-10-13')[0].label, 'Tutoring session');
});

test('student consultation endpoint is authenticated and returns only calendar-safe fields', () => {
  const sql = read('supabase-student-calendar-consultations-migration.sql');
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /s\.auth_user_id = auth\.uid\(\)/);
  assert.match(sql, /c\.status = 'scheduled'/);
  assert.match(sql, /p_end > p_start \+ interval '62 days'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION .* FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION .* TO authenticated/);
  assert.doesNotMatch(sql, /invitee_email|invitee_name|calendly_answers/);
});

test('student appointment migration excludes initial consults without exposing invitee details', () => {
  const sql = read('supabase-admin-appointment-calendar-migration.sql');
  assert.match(sql, /'free_consultation', 'strategy_session', 'tutoring_session'/);
  assert.match(sql, /c\.consult_type <> 'free_consultation'/);
  assert.match(sql, /s\.auth_user_id = auth\.uid\(\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION .* FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION .* TO authenticated/);
  assert.doesNotMatch(sql, /invitee_email|invitee_name|calendly_answers/);
});

test('dashboard wires NCLEX date entry, nursing schedule link, and calendar query safely', () => {
  const html = read('student-dashboard.html');
  assert.ok(html.indexOf('id="study-calendar"') < html.indexOf('id="portal-nclex"'));
  assert.ok(html.indexOf('id="study-calendar"') < html.indexOf('id="portal-nursing"'));
  assert.match(html, /<script src="study-calendar\.js"><\/script>/);
  assert.match(html, /Next NCLEX attempt date/);
  assert.match(html, /class exam dates in <a href="#class-schedule-card">Class schedule/);
  assert.match(html, /get_my_scheduled_consultations/);
  assert.match(html, /if \(state\.isPreview\) \{\s+const intakes = await db\.from\('consult_intakes'\)\.select\('id'\)\.eq\('student_id', state\.student\.id\)/);
  assert.match(html, /select\('id,scheduled_start,scheduled_end,consult_type'\)/);
  assert.doesNotMatch(html, /Staff preview does not show private student sessions/);
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});

test('admin appointment calendar uses the existing shared month-grid helpers and recognizes tutoring bookings', () => {
  const html = read('madison-admin.html');
  const webhook = read('supabase/functions/calendly-webhook/index.ts');
  assert.match(html, /<script src="study-calendar\.js"><\/script>/);
  assert.ok(html.indexOf('id="appointment-calendar"') < html.indexOf('id="directory"'));
  assert.match(html, /id="appointments-grid"/);
  assert.match(html, /tutoring_session:'Tutoring session'/);
  assert.match(webhook, /CALENDLY_TUTORING_EVENT_TYPE_URI/);
  assert.match(webhook, /eventType === tutoringType\) consultType = "tutoring_session"/);
  assert.match(webhook, /eventName === "60-Min Single Tutoring Session"/);
  assert.match(webhook, /eventName === "Legacy Student \| 60-Min Tutoring"/);
  assert.match(webhook, /eventName === "NCLEX Strategy Consult Session"/);
  assert.match(webhook, /free\.\*consult\|consult\.\*free\|15\.\*consult/i);
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
