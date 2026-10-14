const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const source = readFileSync(join(root, 'student-nav.js'), 'utf8');

function navigation(nursing, visibleIds) {
  const elements = new Map();
  for (const id of [...visibleIds, 'portal-nursing', 'nav-label-practice', 'portal-user-role']) {
    elements.set(id, {
      id,
      textContent: '',
      classList: { contains: name => name === 'hidden' && !nursing },
      getClientRects: () => visibleIds.includes(id) ? [{}] : [],
      scrollIntoView(options) { this.scrolled = options; },
      setAttribute() {},
      focus() { this.focused = true; }
    });
  }
  const context = {
    window: { matchMedia: () => ({ matches: true }) },
    document: {
      getElementById: id => elements.get(id),
      querySelectorAll: () => []
    },
    history: { replaceState(_state, _title, url) { this.url = url; } }
  };
  vm.runInNewContext(source, context);
  return { nav: context.window.StudentNav, elements, history: context.history };
}

test('Question Bank keeps both account types on the existing student practice route', () => {
  for (const file of ['student-dashboard.html', 'supplemental-practice.html']) {
    const html = readFileSync(join(root, file), 'utf8');
    assert.match(html, /id="nav-item-practice" href="supplemental-practice\.html"/);
    assert.match(html, /portal-nav-heading">Question Bank</);
    assert.doesNotMatch(html, /href="question-bank-review\.html/);
    const markup = html.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/g, '');
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${file} must have unique element IDs`);
  }
});

test('practice labels preserve course-specific vs NCLEX workflows', () => {
  for (const [type, label, role] of [
    ['nursing_student', 'Exam Prep', 'Nursing Student'],
    ['nclex', 'Create practice', 'NCLEX Prep'],
    [undefined, 'Create practice', 'NCLEX Prep']
  ]) {
    const { nav, elements } = navigation(type === 'nursing_student', []);
    nav.updateStudent({ name: 'Test Student', student_type: type }, false);
    assert.equal(elements.get('nav-label-practice').textContent, label);
    assert.equal(elements.get('portal-user-role').textContent, role);
  }
});

test('NCLEX sections resolve to visible cards, not the hidden nursing portal', () => {
  const { nav } = navigation(false, ['modules-nclex-card', 'cat-trend-card', 'log-cat-card']);
  assert.equal(nav.sectionTarget('lectures').id, 'modules-nclex-card');
  assert.equal(nav.sectionTarget('previous-tests').id, 'cat-trend-card');
  assert.equal(nav.sectionTarget('performance').id, 'cat-trend-card');
});

test('students without CAT results reach the existing log card', () => {
  const { nav } = navigation(false, ['log-cat-card']);
  assert.equal(nav.sectionTarget('previous-tests').id, 'log-cat-card');
  assert.equal(nav.sectionTarget('performance').id, 'log-cat-card');
});

test('nursing section links respect class-selection visibility', () => {
  const before = navigation(true, ['class-schedule-card']);
  for (const name of ['lectures', 'previous-tests', 'performance']) {
    assert.equal(before.nav.sectionTarget(name).id, 'class-schedule-card');
  }
  const after = navigation(true, ['class-schedule-card', 'modules-nursing-card', 'performance-nursing-card']);
  assert.equal(after.nav.sectionTarget('lectures').id, 'modules-nursing-card');
  assert.equal(after.nav.sectionTarget('performance').id, 'performance-nursing-card');
});

test('incoming section hashes focus visible role-specific content and honor reduced motion', () => {
  const { nav, elements, history } = navigation(false, ['modules-nclex-card']);
  nav.handleInitialHash('#modules');
  const target = elements.get('modules-nclex-card');
  assert.equal(target.focused, true);
  assert.equal(target.scrolled.behavior, 'auto');
  assert.equal(history.url, '#modules');
});

test('inline student scripts remain valid JavaScript', () => {
  for (const file of ['student-dashboard.html', 'supplemental-practice.html']) {
    const html = readFileSync(join(root, file), 'utf8');
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      new vm.Script(match[1], { filename: file });
    }
  }
});

test('NCLEX assigned work shows practice sets as well as study resources', () => {
  const html = readFileSync(join(root, 'student-dashboard.html'), 'utf8');
  const renderer = html.slice(html.indexOf('function renderResources('), html.indexOf('function studentResourceText('));
  const container = { innerHTML: '' };
  const context = {
    document: { getElementById: () => container },
    text: String,
    studentResourceText: String
  };
  vm.runInNewContext(renderer, context);
  context.renderResources([
    { title: 'Assigned practice', resource_type: 'practice_set', url: 'supplemental-practice.html?set=assigned' },
    { title: 'Assigned guide', resource_type: 'study_guide', url: 'module1-guide.html' },
    { title: 'Private upload', resource_type: 'student_upload', url: 'student/file.pdf' }
  ], 'resources-nclex');
  assert.match(container.innerHTML, /Assigned practice/);
  assert.match(container.innerHTML, /Open assigned set/);
  assert.match(container.innerHTML, /Assigned guide/);
  assert.doesNotMatch(container.innerHTML, /Private upload/);
});
