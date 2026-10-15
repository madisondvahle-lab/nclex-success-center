const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'madison-graphics.html'), 'utf8');
const css = readFileSync(join(__dirname, '..', 'admin-shell.css'), 'utf8');

test('graphics layout uses the existing shared admin shell classes', () => {
  for (const name of ['sidebar-nav', 'sidebar-caption', 'sidebar-sign-out', 'topbar-context', 'topbar-actions', 'dashboard', 'dashboard-heading', 'metric']) {
    assert.match(html, new RegExp(`class="${name}"`));
    assert.ok(css.includes(`.${name}`), `${name} must have shared styles`);
  }
  assert.match(html, /href="madison-graphics\.html" aria-current="page"/);
  assert.doesNotMatch(html, /class="(?:sidebar-group|sidebar-label|admin-sign-out|admin-content|admin-context|admin-actions|metric-card|metric-value)"/);
});

test('graphics workflow controls keep their unique IDs and scripts parse', () => {
  const markup = html.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g, '');
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['files', 'drop', 'up-system', 'up-cat', 'up-tags', 'grid', 'q', 'edit-form', 'a-go', 'sign-out']) {
    assert.ok(ids.includes(id), `${id} must remain available`);
  }
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    new vm.Script(match[1], { filename: 'madison-graphics.html' });
  }
});
