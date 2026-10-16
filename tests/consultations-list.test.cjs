const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'madison-consultations.html'), 'utf8');

test('consultations list excludes student profiles but keeps prospects', () => {
  const helper = html.match(/function excludeStudentConsultations\(items\)\{[\s\S]*?\n    \}/);
  assert.ok(helper);
  const context = {};
  vm.runInNewContext(`${helper[0]};this.exclude=excludeStudentConsultations;`, context);
  const visible = context.exclude([
    { id: 'student-consult', student_id: 'student' },
    { id: 'eric-consult', student_id: 'eric' },
    { id: 'prospect-consult', student_id: null }
  ]);
  assert.deepEqual(Array.from(visible, consultation => consultation.id), ['prospect-consult']);
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});

test('tutoring sessions page keeps session notes separate and admin-only', () => {
  const page = readFileSync(join(__dirname, '..', 'madison-tutoring-sessions.html'), 'utf8');
  assert.match(page, /consult_type'\s*,\s*'tutoring_session|consult_type", "tutoring_session/);
  assert.match(page, /session_notes/);
  assert.match(page, /app_admins/);
  assert.match(page, /scheduled_start/);
  assert.match(page, /status==='in_progress'[\s\S]*?status==='scheduled'&&session\.scheduled_start[\s\S]*?>new Date\(\)/);
  assert.match(page, /\.eq\('status',current\.status\)/);
  assert.match(readFileSync(join(__dirname, '..', 'madison-admin.html'), 'utf8'), /href="madison-tutoring-sessions\.html">Tutoring sessions/);
  assert.doesNotMatch(html, /Open session notes|Private notes for this session/);
  for (const match of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
