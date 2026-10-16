const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'madison-consultations.html'), 'utf8');

test('consultations list adds only upcoming tutoring sessions for student profiles', () => {
  const helper = html.match(/function excludeStudentConsultations\(items\)\{[\s\S]*?\n    \}/);
  const futureHelper = html.match(/function isFutureTutoringSession\(c\)\{[\s\S]*?\n    \}/);
  assert.ok(helper && futureHelper);
  const context = { Date };
  vm.runInNewContext(`${futureHelper[0]};${helper[0]};this.exclude=excludeStudentConsultations;`, context);
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();
  const visible = context.exclude([
    { id: 'student-consult', student_id: 'student', consult_type: 'free_consultation', status: 'scheduled', scheduled_start: future },
    { id: 'future-tutoring', student_id: 'student', consult_type: 'tutoring_session', status: 'scheduled', scheduled_start: future },
    { id: 'active-tutoring', student_id: 'student', consult_type: 'tutoring_session', status: 'in_progress', scheduled_start: past },
    { id: 'past-tutoring', student_id: 'student', consult_type: 'tutoring_session', status: 'completed', scheduled_start: past },
    { id: 'prospect-consult', student_id: null, consult_type: 'free_consultation', status: 'scheduled', scheduled_start: future }
  ]);
  assert.deepEqual(Array.from(visible, consultation => consultation.id), ['future-tutoring', 'active-tutoring', 'prospect-consult']);
  assert.match(html, /Private notes for this session/);
  assert.match(html, /session_notes:document\.getElementById\('session-notes'\)\.value/);
  assert.match(html, /\.in\('status',\['scheduled','in_progress'\]\)/);
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
