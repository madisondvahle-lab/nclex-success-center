const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'madison-admin.html'), 'utf8');
const renderer = html.slice(html.indexOf('function renderConsultIntakes('), html.indexOf('async function convertToStudent('));
const mergeRenderer = html.slice(html.indexOf('function renderMergeOptions('), html.indexOf('function updateMergeButton('));

function render(items, accessAvailable = true) {
  const elements = new Map();
  const context = {
    $: id => {
      if (!elements.has(id)) elements.set(id, { querySelectorAll: () => [] });
      return elements.get(id);
    },
    esc: String,
    prospectDate: () => 'Test date',
    studentAccessAvailable: accessAvailable,
    studentStageById: new Map([['assessment-student', 'assessment'], ['active-student', 'active']]),
    studentAccessById: new Map([['assessment-student', true], ['active-student', true], ['unknown-student', true]]),
    updateMergeButton() {},
    mergeProfiles() {}
  };
  vm.runInNewContext(renderer + mergeRenderer, context);
  context.renderConsultIntakes(items);
  context.renderMergeOptions(items);
  return elements;
}

test('active_student intakes stay out of Prospects regardless of portal stage or access availability', () => {
  const items = [
    { id: 'assessment', student_id: 'assessment-student' },
    { id: 'active', student_id: 'active-student' },
    { id: 'unlinked' }
  ].map(item => Object.freeze({
    ...item,
    full_name: `Hidden ${item.id}`,
    email: 'unchanged@example.test',
    status: 'active_student',
    created_at: new Date().toISOString()
  }));
  const before = JSON.stringify(items);
  for (const available of [true, false]) {
    const elements = render(Object.freeze(items), available);
    assert.doesNotMatch(elements.get('consult-intakes').innerHTML, /Hidden/);
    assert.match(elements.get('intake-summary').textContent, /^0 prospects/);
    for (const id of ['merge-keep', 'merge-source']) {
      for (const item of items) assert.ok(elements.get(id).innerHTML.includes(`value="${item.id}"`));
    }
  }
  assert.equal(JSON.stringify(items), before);
});

test('other Prospect statuses, assessment actions, and shared links are preserved', () => {
  const items = ['new_lead', 'consult_scheduled', 'consult_complete', 'converted', null].map((status, index) => ({
    id: `prospect-${index}`,
    full_name: `Visible prospect ${index}`,
    status,
    created_at: new Date().toISOString()
  }));
  items.push(
    { id: 'assessment', full_name: 'Assessment prospect', student_id: 'assessment-student' },
    { id: 'unknown', full_name: 'Unknown stage prospect', student_id: 'unknown-student' },
    { id: 'roster', full_name: 'Roster client', student_id: 'active-student' }
  );
  const elements = render(items);
  const output = elements.get('consult-intakes').innerHTML;
  for (let index = 0; index < 5; index++) assert.ok(output.includes(`Visible prospect ${index}`));
  assert.match(output, /Assessment prospect/);
  assert.match(output, /href="assessment-dashboard\.html"/);
  assert.match(output, /data-promote="assessment"/);
  assert.match(output, /href="shared-progress\.html\?student=unknown-student"/);
  assert.doesNotMatch(output, /Roster client/);
  assert.match(elements.get('intake-summary').textContent, /^7 prospects · 1 active clients/);
  const unavailable = render(items, false);
  assert.match(unavailable.get('consult-intakes').innerHTML, /Roster client/);
  assert.match(unavailable.get('consult-intakes').innerHTML, /Access status unavailable/);
  assert.match(unavailable.get('intake-summary').textContent, /^8 prospects/);
});

test('admin inline scripts remain valid JavaScript', () => {
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(match[1], { filename: 'madison-admin.html' });
  }
});
