const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = join(__dirname, '..');
const source = readFileSync(join(root, 'student-nav.js'), 'utf8');

function navigation(nursing, visibleIds) {
  const elements = new Map();
  for (const id of [...visibleIds, 'portal-nursing', 'nav-label-practice', 'portal-user-role', 'main-content']) {
    const classes = new Set(id === 'portal-nursing' && !nursing ? ['hidden'] : []);
    elements.set(id, {
      id,
      textContent: '',
      classList: {
        contains: name => classes.has(name),
        toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }
      },
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
  const after = navigation(true, ['class-schedule-card', 'resources-nursing-card', 'performance-nursing-card']);
  assert.equal(after.nav.sectionTarget('lectures').id, 'resources-nursing-card');
  assert.equal(after.nav.sectionTarget('performance').id, 'performance-nursing-card');
});

test('incoming section hashes focus visible role-specific content and honor reduced motion', () => {
  const { nav, elements, history } = navigation(false, ['modules-nclex-card']);
  nav.handleInitialHash('#modules');
  const target = elements.get('modules-nclex-card');
  assert.equal(target.focused, true);
  assert.equal(target.scrolled.behavior, 'auto');
  assert.equal(history.url, '#modules');
  assert.equal(elements.get('main-content').classList.contains('library-view'), true);
});

test('library opens separately and closes for dashboard, performance, calendar, and empty hashes', () => {
  for (const nursing of [false, true]) {
    const moduleId = nursing ? 'resources-nursing-card' : 'modules-nclex-card';
    const { nav, elements } = navigation(nursing, [moduleId, 'study-calendar', 'log-cat-card', 'performance-nursing-card']);
    const main = elements.get('main-content');
    for (const destination of ['', '#study-calendar', '#performance', '#previous-tests']) {
      nav.handleInitialHash('#modules');
      assert.equal(main.classList.contains('library-view'), true);
      nav.handleInitialHash(destination);
      assert.equal(main.classList.contains('library-view'), false);
    }
    nav.setSectionView('dashboard');
    assert.equal(main.classList.contains('library-view'), false);
  }
});

test('inline student scripts remain valid JavaScript', () => {
  for (const file of ['student-dashboard.html', 'supplemental-practice.html']) {
    const html = readFileSync(join(root, file), 'utf8');
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      new vm.Script(match[1], { filename: file });
    }
  }
});

test('dashboard retains calendar and class modules while keeping general study resources in the library', () => {
  const html = readFileSync(join(root, 'student-dashboard.html'), 'utf8');
  assert.doesNotMatch(html, /assigned-work-nclex|id="resources-nclex"|assignment-reminders|View assigned work/);
  assert.match(html, /id="study-calendar"/);
  assert.match(html, /#main-content:not\(\.library-view\) :is\(\.modules,\.graphics-library\)\{display:none!important\}/);
  assert.match(html, /class="card graphics-library" id="gfx-card"/);
  assert.match(html, /class="card nursing-support graphics-library" id="gfxn-card"/);
  assert.match(html, /insertBefore\(activePortal\.querySelector\('\.hero'\), document\.getElementById\('study-calendar'\)\)/);
  assert.match(html, /id="modules-nclex-card"/);
  assert.match(html, /id="modules-nursing-card"/);
  const cards = [...html.matchAll(/<article class="([^"]+)" id="([^"]+)">([\s\S]*?)<\/article>/g)];
  const assigned = cards.find(card => card[2] === 'modules-nursing-card');
  const resources = cards.find(card => card[2] === 'resources-nursing-card');
  assert.ok(assigned);
  assert.ok(resources);
  assert.ok(assigned[1].split(' ').includes('course-modules'));
  assert.ok(!assigned[1].split(' ').includes('modules'), 'class modules must not be hidden by the library-only CSS');
  assert.match(assigned[3], /Assigned modules/);
  assert.match(assigned[3], /id="modules-nursing"/);
  assert.ok(resources[1].split(' ').includes('modules'), 'study resources stay library-only');
  assert.match(resources[3], /id="resources-nursing"/);
  assert.match(resources[3], /id="modules-nursing-general"/);
  assert.ok(html.indexOf('id="modules-nursing-card"') < html.indexOf('id="student-uploads-card"'));
});

test('Learning Library retains study resources without practice sets or private uploads', () => {
  const html = readFileSync(join(root, 'student-dashboard.html'), 'utf8');
  const renderer = html.slice(html.indexOf('function renderLibraryResources('), html.indexOf('function studentResourceText('));
  const work = { innerHTML: '', querySelectorAll: () => [] };
  const library = { innerHTML: '', hidden: true };
  const context = {
    document: { getElementById: id => id === 'work' ? work : library },
    text: String,
    studentResourceText: String,
    bindWeeklyCompletion: () => {}
  };
  vm.runInNewContext(renderer, context);
  const resources = [
    { title: 'Assigned practice', resource_type: 'practice_set', url: 'supplemental-practice.html?set=assigned' },
    { title: 'Weekly questions', assignment_kind: 'practice', resource_type: 'practice_set', assignment_week: '2026-10-12' },
    { title: 'Weekly CAT', assignment_kind: 'cat', resource_type: 'practice_set', assignment_week: '2026-10-12', url: 'diagnostic.html?mode=mock' },
    { title: 'Assigned guide', resource_type: 'study_guide', url: 'module1-guide.html' },
    { title: 'CAT results', resource_type: 'cat_results' },
    { title: 'Private upload', resource_type: 'student_upload', url: 'student/file.pdf' }
  ];
  context.renderLibraryResources(resources, 'library');
  assert.match(library.innerHTML, /Assigned guide/);
  assert.doesNotMatch(library.innerHTML, /Assigned practice|Weekly questions|Weekly CAT|CAT results|Private upload/);
  assert.equal(library.hidden, false);
});
