const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'admin-gmail.js'), 'utf8');

test('Gmail integration parses as JavaScript and requests read-only access to unread attachments', () => {
  assert.doesNotThrow(() => new vm.Script(source, { filename: 'admin-gmail.js' }));
  assert.match(source, /gmail\.readonly/);
  assert.match(source, /is:unread has:attachment/);
  assert.doesNotMatch(source, /gmail\.modify|localStorage|sessionStorage/);
});
