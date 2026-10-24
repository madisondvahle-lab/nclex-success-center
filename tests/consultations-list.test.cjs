const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'madison-consultations.html'), 'utf8');

test('consultations list uses current intake links and keeps only prospect consultation types', () => {
  const helper = html.match(/function excludeStudentConsultations\(items\)\{[\s\S]*?\n    \}/);
  assert.ok(helper);
  const context = {};
  vm.runInNewContext(`${helper[0]};this.exclude=excludeStudentConsultations;`, context);
  const visible = context.exclude([
    { id: 'student-consult', student_id: 'student', consult_type: 'free_consultation' },
    { id: 'converted-consult', student_id: null, consult_intakes: { student_id: 'active-student' }, consult_type: 'strategy_session' },
    { id: 'prospect-tutoring', student_id: null, consult_type: 'tutoring_session' },
    { id: 'student-tutoring', student_id: 'student', consult_type: 'tutoring_session' },
    { id: 'unknown-type', student_id: null, consult_type: 'unknown' },
    { id: 'prospect-consult', student_id: null, consult_intakes: { student_id: null }, consult_type: 'free_consultation' },
    { id: 'prospect-strategy', student_id: null, consult_type: 'strategy_session' }
  ]);
  assert.deepEqual(Array.from(visible, consultation => consultation.id), ['prospect-consult', 'prospect-strategy']);
  assert.match(html, /select\('\*,consult_intakes\(student_id\)'\)/);
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});

test('legacy tutoring consultation links redirect without opening or modifying a consult', async () => {
  const source = html.slice(html.indexOf('async function openConsult('), html.indexOf('function renderDetail('));
  const redirects = [];
  const context = {
    db: { from(table) {
      assert.equal(table, 'consultations');
      return { select: () => ({ eq: () => ({ single: async () => ({
        data: { consult_type: 'tutoring_session' }, error: null
      }) }) }) };
    } },
    location: { replace: url => redirects.push(url) },
    renderDetail() { assert.fail('Tutoring must not render a consultation template'); }
  };
  vm.runInNewContext(source, context);
  await context.openConsult('session/1');
  assert.deepEqual(redirects, ['madison-tutoring-sessions.html?session=session%2F1']);
});

test('separate appointments and their existing content are not merged or changed by filtering', () => {
  const helper = html.match(/function excludeStudentConsultations\(items\)\{[\s\S]*?\n    \}/);
  const context = {};
  vm.runInNewContext(helper[0], context);
  const rows = ['one', 'two'].map(id => Object.freeze({
    id, invitee_email: 'prospect@example.test', consult_type: 'free_consultation',
    student_id: null, template: Object.freeze({ notes: id })
  }));
  const result = context.excludeStudentConsultations(Object.freeze(rows));
  assert.equal(result.length, 2);
  assert.equal(result[0], rows[0]);
  assert.equal(result[1], rows[1]);
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

test('session deep links open only available sessions and preserve load errors', async () => {
  const page = readFileSync(join(__dirname, '..', 'madison-tutoring-sessions.html'), 'utf8');
  const source = page.slice(page.indexOf('async function init('), page.indexOf('function isAvailable('));
  for (const scenario of [
    { loaded: true, sessions: [{ id: 'available' }], requested: 'available', opened: ['available'] },
    { loaded: true, sessions: [], requested: 'past', opened: [], notice: /not upcoming or in progress/ },
    { loaded: false, sessions: [], requested: 'available', opened: [], notice: /Tutoring sessions could not load/ }
  ]) {
    const elements = new Map();
    const opened = [];
    const context = {
      URLSearchParams,
      location: { search: '?session=' + scenario.requested },
      sessions: scenario.sessions,
      $: id => {
        if (!elements.has(id)) elements.set(id, {
          addEventListener() {}, classList: { add() {}, remove() {} }
        });
        return elements.get(id);
      },
      db: {
        auth: { getSession: async () => ({ data: { session: { user: { id: 'admin' } } } }) },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: 'admin' } }) }) }) })
      },
      closeSession() {}, saveNotes() {},
      loadSessions: async () => {
        if (!scenario.loaded) context.$('session-list-status').textContent = 'Tutoring sessions could not load.';
        return scenario.loaded;
      },
      openSession: id => opened.push(id)
    };
    vm.runInNewContext(source, context);
    await context.init();
    assert.deepEqual(opened, scenario.opened);
    if (scenario.notice) assert.match(elements.get('session-list-status').textContent, scenario.notice);
  }
});
