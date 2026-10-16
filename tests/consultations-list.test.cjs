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
