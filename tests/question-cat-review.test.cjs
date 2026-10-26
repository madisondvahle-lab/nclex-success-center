const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'question-bank-review.html'), 'utf8');
const source = html.slice(html.indexOf('function openCatReview('), html.indexOf('function needsRevisionApproval('));

function harness(question) {
  const fields = [{ disabled: false }, { disabled: false, cat: true }];
  const submit = {}, intro = {}, demand = {};
  let opened = false, scrolled = false, alerted = false;
  const panel = {
    contains: field => !!field.cat,
    scrollIntoView() { scrolled = true; }
  };
  const form = {
    querySelector: selector => ({
      '#cat-approval-action': { closest: () => panel },
      '.intro': intro,
      'button[type="submit"]': submit,
      '#cat-demand': { focus() { demand.focused = true; } }
    })[selector],
    querySelectorAll: () => fields
  };
  const context = {
    live: [question], $: () => form,
    openEdit(id) { assert.equal(id, question.id); opened = true; },
    alert() { alerted = true; }
  };
  vm.runInNewContext(source, context);
  context.openCatReview(question.id);
  return { form, fields, submit, intro, demand, opened, scrolled, alerted };
}

test('direct review opens saved published MCQ/SATA with content editing disabled', () => {
  for (const item_type of ['mcq', 'sata', null]) {
    const h = harness({ id: 'test', active: true, item_type });
    assert.equal(h.opened, true);
    assert.equal(h.fields[0].disabled, true);
    assert.equal(h.fields[1].disabled, false);
    assert.equal(h.submit.hidden, true);
    assert.equal(h.scrolled, true);
    assert.equal(h.demand.focused, true);
    let prevented = false;
    h.form.onsubmit({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.match(h.intro.textContent, /cannot save content changes/);
  }
});

test('unpublished and NGN questions cannot enter direct CAT review', () => {
  for (const question of [
    { active: false, item_type: 'mcq' },
    { active: true, item_type: 'matrix' },
    { active: true, item_type: 'sata', item_data: { schemaVersion: 1 } }
  ]) {
    const h = harness({ id: 'test', ...question });
    assert.equal(h.opened, false);
    assert.equal(h.alerted, true);
  }
});

test('row shortcut is wired and metadata stays outside the CAT action panel', () => {
  assert.match(html, /review\.textContent='Review for CAT'/);
  assert.match(html, /review\.addEventListener\('click',\(\)=>openCatReview\(question\.id\)\)/);
  assert.match(html, /button\.after\(review\)/);
  assert.match(html, /querySelector\(':scope > \.buttons'\)\.before\(metadata\)/);
  assert.match(html, /querySelector\(':scope > \.buttons'\)\.before\(fields\)/);
});
