const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'madison-admin.html'), 'utf8');
const renderer = html.slice(html.indexOf('function renderConsultIntakes('), html.indexOf('async function convertToStudent('));
const mergeRenderer = html.slice(html.indexOf('function renderMergeOptions('), html.indexOf('function updateMergeButton('));

function render(items, accessAvailable = true, showHidden = false, db) {
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
  context.consultIntakes = items;
  context.db = db;
  context.$('show-hidden-prospects').checked = showHidden;
  vm.runInNewContext(renderer + mergeRenderer, context);
  context.renderConsultIntakes(items);
  context.renderMergeOptions(items);
  elements.context = context;
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

test('hidden prospects leave the normal list but remain restorable and mergeable', () => {
  const items = [
    { id: 'hidden', full_name: 'Hidden follow-up', status: 'new_lead', prospect_hidden_at: '2026-10-01T00:00:00Z' },
    { id: 'visible', full_name: 'Current follow-up', status: 'new_lead' }
  ];
  const normal = render(items);
  assert.doesNotMatch(normal.get('consult-intakes').innerHTML, /Hidden follow-up/);
  assert.match(normal.get('consult-intakes').innerHTML, /Current follow-up/);
  assert.match(normal.get('consult-intakes').innerHTML, /Hide from Prospects/);
  assert.match(normal.get('intake-summary').textContent, /^1 prospects.*1 hidden$/);
  assert.match(normal.get('merge-keep').innerHTML, /Hidden follow-up/);
  normal.get('show-hidden-prospects').checked = true;
  normal.get('show-hidden-prospects').onchange();
  assert.match(normal.get('consult-intakes').innerHTML, /Hidden follow-up/);
  assert.match(normal.get('consult-intakes').innerHTML, /Restore to Prospects/);
  assert.doesNotMatch(normal.get('consult-intakes').innerHTML, /Current follow-up/);
  assert.match(render([], true, true).get('consult-intakes').innerHTML, /No hidden prospects/);
});

test('student directory offers login creation for existing profiles without portal accounts', () => {
  assert.match(html, /select\('id,name,email,auth_user_id,portal_stage,student_type,status,archived_at'\)/);
  assert.match(html, /data-create-student-login="\$\{id\}"/);
  assert.match(html, /createStudentLoginForProfile\(student\)/);
  assert.match(html, /student_id:student\.id,password:tempCredential,send_email:true/);
});

test('hide and restore persist only the visibility timestamp', async () => {
  const item = { id: 'test-intake', full_name: 'Test follow-up', status: 'new_lead', email: 'test@example.test' };
  const writes = [];
  const db = {
    from(table) {
      assert.equal(table, 'consult_intakes');
      return { update(values) {
        writes.push(values);
        return { eq(key, id) {
          assert.equal(key, 'id');
          assert.equal(id, item.id);
          return { select: () => ({ single: async () => ({ data: { id, ...values }, error: null }) }) };
        } };
      } };
    }
  };
  const elements = render([item], true, false, db);
  await elements.context.setProspectVisibility(item.id, {});
  assert.deepEqual(Object.keys(writes[0]), ['prospect_hidden_at']);
  assert.ok(Number.isFinite(Date.parse(item.prospect_hidden_at)));
  assert.doesNotMatch(elements.get('consult-intakes').innerHTML, /Test follow-up/);
  await elements.context.setProspectVisibility(item.id, {});
  assert.equal(writes[1].prospect_hidden_at, null);
  assert.match(elements.get('consult-intakes').innerHTML, /Test follow-up/);
  assert.equal(item.status, 'new_lead');
  assert.equal(item.email, 'test@example.test');
});

test('failed visibility writes leave the profile visible and report the error', async () => {
  const item = { id: 'failed', full_name: 'Still visible' };
  const db = { from: () => ({ update: () => ({ eq: () => ({
    select: () => ({ single: async () => ({ error: { message: 'Permission denied' } }) })
  }) }) }) };
  const elements = render([item], true, false, db);
  const button = {};
  await elements.context.setProspectVisibility(item.id, button);
  assert.equal(button.disabled, false);
  assert.equal(item.prospect_hidden_at, undefined);
  assert.match(elements.get('consult-intakes').innerHTML, /Still visible/);
  assert.match(elements.get('intake-action-status').textContent, /Could not update.*Permission denied/);
});
