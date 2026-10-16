const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => readFileSync(join(__dirname, '..', file), 'utf8');
const studentHtml = read('student-dashboard.html');
const tutorHtml = read('shared-progress.html');
const escape = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function element() {
  return {
    innerHTML: '', textContent: '', value: '', dataset: {}, style: {}, disabled: false, files: [],
    classList: { add() {}, remove() {} },
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(name, value) { this[name] = String(value); },
    reset() { this.didReset = true; },
    querySelectorAll(selector) {
      const attr = selector.slice(1, -1);
      this.buttons ||= new Map();
      if (!this.buttons.has(this.innerHTML)) {
        this.buttons.set(this.innerHTML, [...this.innerHTML.matchAll(/<button\b([^>]*)>/g)].map(match => {
          const button = element();
          button.attrs = {};
          for (const [, key, value] of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
            button.attrs[key] = value;
            if (key.startsWith('data-')) button.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
          }
          return button;
        }));
      }
      return this.buttons.get(this.innerHTML).filter(button => Object.hasOwn(button.attrs, attr));
    }
  };
}

function fixture() {
  return {
    external_assessments: [
      { platform: 'UWorld', assessment_name: 'CAT Sep', taken_at: '2026-09-22', overall_score: 60, category_scores: { Safety: 40 } },
      { platform: ' UWORLD ', assessment_name: 'Readiness Sep', taken_at: '2026-09-30', overall_score: 65, category_scores: { Safety: 50 } },
      { platform: 'Uworld', assessment_name: 'CAT Oct', taken_at: '2026-10-09', overall_score: 70, category_scores: { Safety: 60 } },
      ...[1, 2, 3, 4, 5].map(i => ({ platform: 'Archer', assessment_name: `Archer ${i}`, taken_at: `2026-10-0${i}`, overall_score: 50, category_scores: {} }))
    ],
    student_assessment_uploads: [
      { id: 'new', platform: ' uworld\t', assessment_type: 'cat', report_label: 'New CAT', taken_on: '2026-10-14', overall_score: 80 },
      { id: 'qbank', platform: 'UWORLD', assessment_type: 'qbank_report', report_label: 'QBank practice', taken_on: '2026-10-12', overall_score: 55 },
      { id: 'cpr', platform: 'uworld', assessment_type: 'cpr_report', taken_on: '2026-10-13', overall_score: 99 }
    ],
    student_assessment_categories: [{ assessment_id: 'new', category: 'Safety', score: 75 }],
    student_supplemental_practice_results: [{ practice_title: 'Portal practice', completed_at: '2026-10-11', score: 7, total_questions: 10 }]
  };
}

function harness(tables = fixture()) {
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const failures = {};
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'synthetic-user' } } }) },
    from(table) {
      return {
        select() { return this; }, eq() { return this; }, order() { return this; }, in() { return this; },
        limit() { this.dupeCheck = true; return this; },
        insert(rows) { this.rows = rows; return this; },
        async single() {
          tables[table].push({ ...this.rows, id: 'saved' });
          return { data: { id: 'saved' } };
        },
        then(resolve, reject) {
          if (this.rows) tables[table].push(...(Array.isArray(this.rows) ? this.rows : [this.rows]));
          return Promise.resolve({ data: this.dupeCheck ? [] : tables[table], error: this.rows ? null : failures[table] }).then(resolve, reject);
        }
      };
    }
  };
  const context = vm.createContext({
    window: {}, document: { getElementById: $, querySelectorAll: selector => $('cat-body').querySelectorAll(selector) },
    db, text: escape, esc: escape, $, NCLEXCats: { NAMES: ['Safety'], index: name => name === 'Safety' ? 0 : -1 },
    isAdmin: true, student: { id: 'synthetic' }, session: { user: { id: 'synthetic-user' } }, isProgressAssessment: () => true,
    assessmentDate: row => new Date((row.taken_on || row.created_at) + 'T12:00:00'),
    ovPct: value => String(value), confirm: () => true
  });
  vm.runInContext(read('assessment-platforms.js'), context);
  context.AssessmentPlatforms = context.window.AssessmentPlatforms;
  vm.runInContext(studentHtml.slice(studentHtml.indexOf('function initLogCat('), studentHtml.indexOf('// Weekly CAT trend')), context);
  vm.runInContext(studentHtml.slice(studentHtml.indexOf('async function renderCatTrend('), studentHtml.indexOf('// ── Nursing portal')), context);
  vm.runInContext(tutorHtml.slice(tutorHtml.indexOf('const catKindOk='), tutorHtml.indexOf("    $('cat-fields').innerHTML=")), context);
  return { context, $, tables, failures };
}

test('platform identity normalizes only case and whitespace, with canonical known labels', () => {
  const { context: { AssessmentPlatforms: platforms } } = harness();
  for (const value of ['UWorld', 'Uworld', 'uworld', ' UWORLD\t']) {
    assert.equal(platforms.key(value), 'uworld');
    assert.equal(platforms.name(value), 'UWorld');
  }
  for (const [value, label] of [['ATI', 'ATI'], ['hesi', 'HESI'], ['ARCHER', 'Archer'], ['kaplan', 'Kaplan'], ['BOOTCAMP', 'Bootcamp']]) {
    assert.equal(platforms.name(value), label);
  }
  assert.equal(platforms.key(' My \t Platform '), platforms.key('my platform'));
  assert.notEqual(platforms.key('My Platform'), platforms.key('MyPlatform'));
  assert.notEqual(platforms.key('My Platform'), platforms.key('My-Platform'));
  assert.equal(platforms.name('constructor'), 'constructor');
  assert.equal(platforms.name('  '), 'Assessment');
});

test('student saved-platform trend includes all four dates and the correct latest categories, without mutating records', async () => {
  const { context, $, tables } = harness();
  const before = JSON.stringify(tables);
  context.window.__studentTrendSeries = 'practice';
  await context.renderCatTrend(context.student, 'uworld');
  assert.equal($('cat-trend-label').textContent, 'UWorld');
  assert.equal(context.window.__studentTrendSeries, 'both');
  const chips = $('cat-trend-body').querySelectorAll('[data-trend-platform]');
  assert.deepEqual(chips.map(b => b.dataset.trendPlatform).sort(), ['archer', 'uworld']);
  assert.match($('cat-trend-body').innerHTML, /data-trend-platform="uworld" aria-selected="true">UWorld/);
  const view = $('cat-trend-view');
  assert.equal((view.innerHTML.match(/fill="var\(--teal\)"><title>/g) || []).length, 4);
  assert.equal((view.innerHTML.match(/fill="#a94f67"><title>/g) || []).length, 2);
  for (const date of ['Sep 22', 'Sep 30', 'Oct 9', 'Oct 14']) assert.ok(view.innerHTML.includes(date));
  assert.match(view.innerHTML, /80%<\/strong> latest CAT/);
  assert.match(view.innerHTML, /Safety/);
  assert.match(view.innerHTML, /75%/);
  assert.match(view.innerHTML, /▲ 15/);
  assert.doesNotMatch(view.innerHTML, /99%/);
  assert.equal(JSON.stringify(tables), before);

  const series = $('cat-trend-body').querySelectorAll('[data-trend-series]');
  series.find(b => b.dataset.trendSeries === 'practice').listeners.click();
  assert.doesNotMatch(view.innerHTML, /fill="var\(--teal\)"><title>|Latest CAT categories/);
  series.find(b => b.dataset.trendSeries === 'cat').listeners.click();
  assert.doesNotMatch(view.innerHTML, /fill="#a94f67"><title>/);
  chips.find(b => b.dataset.trendPlatform === 'archer').listeners.click();
  assert.equal($('cat-trend-label').textContent, 'Archer');
  await context.renderCatTrend(context.student);
  assert.equal($('cat-trend-label').textContent, 'Archer');
});

test('student trend shows category-only SimpleNursing results without inventing an overall score', async () => {
  for (const source of ['external_assessments', 'student_assessment_uploads']) {
    const tables = fixture();
    tables.external_assessments = source === 'external_assessments'
      ? [{ platform: 'SimpleNursing', assessment_name: 'CAT', taken_at: '2026-10-12', overall_score: null, category_scores: { Safety: 72 } }]
      : [];
    tables.student_assessment_uploads = source === 'student_assessment_uploads'
      ? [{ id: 'simple-nursing', platform: 'SimpleNursing', assessment_type: 'cat', report_label: 'CAT', taken_on: '2026-10-12', overall_score: null }]
      : [];
    tables.student_assessment_categories = source === 'student_assessment_uploads'
      ? [{ assessment_id: 'simple-nursing', category: 'Safety', score: 72 }]
      : [];
    tables.student_supplemental_practice_results = [];
    const { context, $ } = harness(tables);
    await context.renderCatTrend(context.student, 'simplenursing');
    const view = $('cat-trend-view').innerHTML;
    assert.equal($('cat-trend-label').textContent, 'SimpleNursing');
    assert.match(view, /No overall score to chart in this view yet/);
    assert.match(view, /Latest CAT categories · Oct 12 \(SimpleNursing\)/);
    assert.match(view, /Safety/);
    assert.match(view, /72%/);
    assert.doesNotMatch(view, />72%<\/strong> latest CAT/);
  }
});

test('student save awaits the refreshed saved platform and preserves save success on refresh failure', async () => {
  for (const failure of [null, 'external_assessments', 'student_assessment_uploads', 'student_assessment_categories']) {
    const { context, $, failures, tables } = harness();
    const fields = { '[data-c="0"]': { value: '88' }, '[data-n="0"]': { value: '10' } };
    $('lc-form').querySelector = selector => fields[selector];
    context.initLogCat(context.student);
    $('lc-platform').value = 'uworld';
    $('lc-overall').value = '85';
    $('lc-label').value = 'Saved exam';
    $('lc-date').value = '2026-10-15';
    if (failure) failures[failure] = { message: 'Synthetic refresh failure' };
    await $('lc-form').listeners.submit({ preventDefault() {} });
    assert.equal(tables.student_assessment_uploads.filter(row => row.id === 'saved').length, 1);
    assert.equal($('lc-save').disabled, false);
    if (failure) {
      assert.match($('lc-status').textContent, /^Saved, but your trend could not be refreshed:/);
      assert.match($('lc-status').textContent, /do not save the exam again/);
    } else {
      assert.equal($('lc-status').textContent, 'Saved. Your trend has been updated.');
      assert.equal($('cat-trend-label').textContent, 'UWorld');
      assert.match($('cat-trend-view').innerHTML, /85%<\/strong> latest CAT/);
      assert.match($('cat-trend-view').innerHTML, /88%/);
      assert.match($('cat-trend-view').innerHTML, /Oct 15/);
    }
  }
});

test('tutor chart combines mixed-case sources, retains categories and supports platform/series filters', () => {
  const { context, $, tables } = harness();
  const uploads = [
    ...tables.external_assessments.map((row, i) => ({ ...row, id: `history:${i}`, report_label: row.assessment_name, taken_on: row.taken_at, assessment_type: 'cat' })),
    ...tables.student_assessment_uploads
  ];
  const cats = [
    ...tables.student_assessment_categories,
    { assessment_id: 'history:0', category: 'Safety', score: 40 }
  ];
  const before = JSON.stringify({ uploads, cats });
  const draw = () => context.renderCatCard(uploads, cats, [], tables.student_supplemental_practice_results);
  draw();
  assert.equal($('cat-card').style.display, 'block');
  const body = $('cat-body');
  const chips = body.querySelectorAll('[data-catplat]');
  assert.deepEqual(chips.map(b => b.dataset.catplat).sort(), ['all', 'platform:archer', 'platform:uworld']);
  assert.equal(context.window.__catPlat, 'all');
  assert.match(body.innerHTML, /80%<\/b> latest \(UWorld · New CAT\)/);
  assert.match(body.innerHTML, /Sep 22/);
  assert.match(body.innerHTML, /Oct 14/);
  assert.match(body.innerHTML, /<td>40<\/td>/);
  assert.match(body.innerHTML, /<td>75<\/td>/);
  assert.equal((body.innerHTML.match(/fill="#0067a8"><title>/g) || []).length, 9);
  assert.equal((body.innerHTML.match(/fill="#a94f67"><title>/g) || []).length, 2);
  chips.find(b => b.dataset.catplat === 'platform:archer').onclick();
  assert.doesNotMatch(body.innerHTML, /New CAT: 80%/);
  body.querySelectorAll('[data-trend-series]').find(b => b.dataset.trendSeries === 'practice').onclick();
  assert.doesNotMatch(body.innerHTML, /fill="#0067a8"><title>/);
  body.querySelectorAll('[data-trend-series]').find(b => b.dataset.trendSeries === 'cat').onclick();
  assert.doesNotMatch(body.innerHTML, /fill="#a94f67"><title>/);
  assert.equal(JSON.stringify({ uploads, cats }), before);
});

test('tutor CAT trend combines completed portal CATs with outside platforms in date order', () => {
  const { context, $ } = harness();
  const uploads = [
    { id: 'outside-1', platform: 'Archer', assessment_type: 'cat', taken_on: '2026-10-01', overall_score: 60, report_label: 'CAT 1' },
    { id: 'practice-report', platform: 'Archer', assessment_type: 'qbank_report', taken_on: '2026-10-14', overall_score: 99, report_label: 'Practice' }
  ];
  const attempts = [
    { id: 'mock-1', mode: 'mock', status: 'completed', completed_at: '2026-10-15', total_questions: 100, correct_questions: 65 },
    { id: 'core-1', mode: 'nclex', status: 'completed', completed_at: '2026-10-10', total_questions: 45, correct_questions: 30 },
    { id: 'readiness-1', assessment_key: 'readiness-assessment', mode: 'practice', status: 'completed', completed_at: '2026-10-12', total_questions: 85, correct_questions: 50 },
    { id: 'unfinished', mode: 'mock', status: 'in_progress', completed_at: '2026-10-16', total_questions: 100, correct_questions: 99 }
  ];

  context.renderCatCard(uploads, [], [], [], null, attempts);
  const html = $('cat-body').innerHTML;
  assert.equal(context.window.__catPlat, 'all');
  assert.match(html, /65%<\/b> latest \(SWM-CAT\) · <span[^>]*>▲ \+6 pts<\/span> since previous/);
  assert.match(html, /data-catplat="platform:swm-cat">SWM-CAT/);
  assert.match(html, /data-catplat="platform:core-safe cat">Core-Safe CAT/);
  assert.match(html, /data-catplat="platform:readiness assessment">Readiness Assessment/);
  assert.equal((html.match(/fill="#0067a8"><title>/g) || []).length, 4);
  assert.doesNotMatch(html, /unfinished|SWM-CAT: 99%|NaN|Invalid Date/);
  assert.match(html, /SWM-CAT: 65%/);
  assert.match(html, /All platforms are shown together in date order/);
});

test('admin progress trend shows the latest assessment category snapshot', () => {
  const { context, $ } = harness();
  context.date = value => value;
  vm.runInContext(tutorHtml.slice(tutorHtml.indexOf('    function renderTrend('), tutorHtml.indexOf('    function renderRecentAssessments(')), context);
  const categories = [
    ['Management of Care', 67],
    ['Safety and Infection Control', 33],
    ['Health Promotion and Maintenance', 74],
    ['Psychosocial Integrity', 83],
    ['Basic Care and Comfort', 36],
    ['Pharmacological and Parenteral Therapies', 53],
    ['Reduction of Risk Potential', 86],
    ['Physiological Adaptation', 62]
  ].map(([category, score]) => ({ assessment_id: 'cat-1014', category, score }));

  context.renderTrend([
    { id: 'cat-1014', assessment_type: 'cat', report_label: 'UWORLD (1014) CAT', taken_on: '2026-10-14', overall_score: 65 }
  ], categories);

  const trend = $('progress-trend').innerHTML;
  assert.match(trend, /Latest CAT sections/);
  assert.match(trend, /65%/);
  for (const [category, score] of categories.map(({ category, score }) => [category, score])) {
    assert.ok(trend.includes(category), `missing category ${category}`);
    assert.match(trend, new RegExp(`<strong>${score}%<\\/strong>`));
  }
});

test('unknown platforms remain distinct except for case/whitespace, including a platform called All', async () => {
  const tables = fixture();
  tables.external_assessments = ['My Platform', ' MY \t PLATFORM ', 'MyPlatform', 'All'].map(platform => ({
    platform, assessment_name: 'CAT', overall_score: 60, taken_at: '2026-10-10'
  }));
  tables.student_assessment_uploads = [];
  const { context, $ } = harness(tables);
  await context.renderCatTrend(context.student);
  assert.deepEqual($('cat-trend-body').querySelectorAll('[data-trend-platform]').map(b => b.dataset.trendPlatform).sort(),
    ['all', 'my platform', 'myplatform']);
  const uploads = tables.external_assessments.map(row => ({ ...row, taken_on: row.taken_at }));
  context.renderCatCard(uploads, [], [], []);
  const chips = $('cat-body').querySelectorAll('[data-catplat]');
  assert.deepEqual(chips.map(b => b.dataset.catplat).sort(),
    ['all', 'platform:all', 'platform:my platform', 'platform:myplatform']);
  assert.equal(($('cat-body').innerHTML.match(/fill="#0067a8"><title>/g) || []).length, 4);
  chips.find(b => b.dataset.catplat === 'all').onclick();
  assert.equal(($('cat-body').innerHTML.match(/fill="#0067a8"><title>/g) || []).length, 4);
});

test('tutor saves select the saved platform for new entries and existing uploads', async () => {
  const { context, $, tables } = harness();
  context.currentUploads = [{ id: 'new', platform: ' uworld ' }];
  context.window.__trendSeries = 'practice';
  context.window.__catPlat = 'platform:archer';
  let refreshed = false;
  context.loadStudent = () => { refreshed = true; };
  const filters = [];
  context.db.from = table => {
    let operation = null, value = null;
    const query = {
      select() { return this; },
      eq(key, match) { filters.push([key, match]); return this; },
      insert(rows) { operation = 'insert'; value = rows; return this; },
      update(patch) { operation = 'update'; value = patch; return this; },
      async single() {
        if (operation === 'insert') {
          const row = { ...value, id: 'saved' };
          tables[table].push(row);
          return { data: { id: row.id }, error: null };
        }
        return { data: { report_path: null }, error: null };
      },
      then(resolve) {
        if (operation === 'update') Object.assign(tables[table].find(row => row.id === 'new'), value);
        return Promise.resolve({ data: null, error: null }).then(resolve);
      }
    };
    return query;
  };
  // Only the save handler is needed; the rest of the tutor page initializes unrelated panels.
  vm.runInContext(tutorHtml.slice(tutorHtml.indexOf("    $('cat-form').addEventListener('submit'"), tutorHtml.indexOf('    async function loadStudent(')), context);
  $('cat-overall').value = '82';
  $('cat-date').value = '2026-10-15';
  $('cat-platform').value = 'UWorld';
  $('cat-name').value = 'CAT';
  for (const target of ['', 'new']) {
    $('cat-target').value = target;
    await $('cat-form').listeners.submit({ preventDefault() {} });
    assert.equal(context.window.__catPlat, 'all');
    assert.equal(context.window.__trendSeries, 'both');
    assert.equal($('cat-msg').textContent, 'Exam record saved.');
  }
  assert.equal(tables.student_assessment_uploads.find(row => row.id === 'saved').platform, 'UWorld');
  assert.equal(tables.student_assessment_uploads.find(row => row.id === 'new').platform, 'UWorld');
  assert.ok(filters.some(([key, value]) => key === 'student_id' && value === 'synthetic'));
  assert.equal(refreshed, true);
});

test('tutor CAT entry saves scores and an optional private report together', async () => {
  const { context, $, tables } = harness();
  const file = { name: 'carla-cat.pdf', type: 'application/pdf', size: 100 };
  const scoreInputs = [{ dataset: { cat: '0' }, value: '74' }];
  const countInputs = [{ dataset: { n: '0' }, value: '18' }];
  context.document.querySelectorAll = selector => selector === '[data-cat]' ? scoreInputs : selector === '[data-n]' ? countInputs : [];
  context.crypto = { randomUUID: () => 'synthetic-file-id' };
  let uploadedPath = null;
  context.db.storage = { from: () => ({
    async upload(path, uploaded) { uploadedPath = path; assert.equal(uploaded, file); return { error: null }; },
    async remove() { return { error: null }; }
  }) };
  context.loadStudent = async () => {};
  context.db.from = table => {
    let rows;
    return {
      insert(value) { rows = value; return this; },
      select() { return this; },
      async single() {
        if (table === 'student_assessment_uploads') {
          tables[table].push({ ...rows, id: 'saved' });
          return { data: { id: 'saved' }, error: null };
        }
        tables[table].push(...rows);
        return { data: null, error: null };
      },
      then(resolve) {
        tables[table].push(...rows);
        return Promise.resolve({ data: null, error: null }).then(resolve);
      }
    };
  };
  vm.runInContext(tutorHtml.slice(tutorHtml.indexOf("    $('cat-form').addEventListener('submit'"), tutorHtml.indexOf('    async function loadStudent(')), context);
  $('cat-report-file').files = [file];
  $('cat-platform').value = 'Bootcamp';
  $('cat-name').value = 'CAT Readiness Exam 1';
  $('cat-date').value = '2026-10-16';
  $('cat-overall').value = '70.3';
  await $('cat-form').listeners.submit({ preventDefault() {} });
  const savedUpload = tables.student_assessment_uploads.find(row => row.report_filename === file.name);
  assert.equal(savedUpload.platform, 'Bootcamp');
  assert.equal(savedUpload.overall_score, 70.3);
  assert.equal(savedUpload.taken_on, '2026-10-16');
  assert.equal(savedUpload.report_path, uploadedPath);
  assert.equal(JSON.stringify(tables.student_assessment_categories.at(-1)), JSON.stringify({
    assessment_id: 'saved',
    category: 'Safety',
    score: 74,
    total_count: 18
  }));
  assert.match(tutorHtml, /Attach report \(optional\)/);
  assert.doesNotMatch(tutorHtml, /<option value="cat">CAT<\/option>/);
  assert.doesNotMatch(tutorHtml, /<option value="readiness_exam">Readiness exam<\/option>/);
});

test('admin can recover scores from an existing private CAT report', async () => {
  const { context, tables } = harness();
  const upload = {
    id: 'older-cat', platform: 'uworld', assessment_type: 'cat',
    report_path: 'synthetic/report.pdf', report_filename: 'older-cat.pdf',
    report_mime_type: 'application/pdf', overall_score: null, taken_on: null
  };
  tables.student_assessment_uploads.push(upload);
  context.currentUploads = [upload];
  context.File = class {
    constructor(parts, name, options) { this.name = name; this.type = options.type; }
  };
  context.db.storage = { from: () => ({ download: async () => ({ data: { type: 'application/pdf' }, error: null }) }) };
  context.AssessmentImport = {
    readFile: async file => {
      assert.equal(file.name, 'older-cat.pdf');
      return { overall: 71, date: '2026-10-12', cats: { 'Safety and Infection Control': 59 }, counts: { 'Safety and Infection Control': 20 } };
    }
  };
  context.confirm = () => true;
  context.loadStudent = async () => {};
  context.db.from = table => {
    if (table === 'student_assessment_categories') return { insert: async rows => { tables[table].push(...rows); return { error: null }; } };
    if (table === 'student_assessment_uploads') return { update: patch => ({ eq: async (_column, id) => { Object.assign(tables[table].find(row => row.id === id), patch); return { error: null }; } }) };
    throw new Error(`Unexpected table ${table}`);
  };
  const functionStart = tutorHtml.indexOf('    async function readTimelineScores(');
  vm.runInContext(tutorHtml.slice(functionStart, tutorHtml.indexOf('    async function deleteReport(', functionStart)), context);
  const status = { textContent: '' };
  const button = { disabled: false, closest: () => ({ querySelector: () => status }) };

  await context.readTimelineScores(upload.id, button);
  assert.equal(upload.overall_score, 71);
  assert.equal(upload.taken_on, '2026-10-12');
  assert.equal(tables.student_assessment_categories.at(-1).assessment_id, upload.id);
  assert.equal(tables.student_assessment_categories.at(-1).total_count, 20);
  assert.equal(button.disabled, false);
});

test('both dashboards load the shared helper and inline scripts parse', () => {
  for (const html of [studentHtml, tutorHtml]) {
    assert.match(html, /<script src="assessment-platforms\.js"><\/script>/);
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  }
});
