const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => readFileSync(join(__dirname, '..', file), 'utf8');
const html = read('madison-consultations.html');
const migration = read('supabase-consultation-no-show-migration.sql');
const changeSource = html.slice(html.indexOf('async function changeAttendanceStatus('), html.indexOf('async function closeDetail('));

function attendance(status, options = {}) {
  const row = {
    id: 'consult-1', status, student_id: 'student-1', consult_intake_id: 'intake-1',
    template: { notes: 'Keep private notes', snapshot: { exam: 'NCLEX-RN' } },
    started_at: null, completed_at: status === 'completed' ? '2026-10-01T12:00:00Z' : null
  };
  const writes = [], notices = [], refreshed = [], filters = [];
  const query = {
    update(patch) { writes.push(patch); return this; },
    eq(field, value) { filters.push([field, value]); return this; },
    select() { return this; },
    async maybeSingle() { return options.result || { data: { id: row.id }, error: null }; }
  };
  const context = {
    current: row, dirty: false, saving: false, saveTimer: null, timerHandle: null,
    clearTimeout() {}, clearInterval() {},
    setSaveState: (...args) => notices.push(args),
    save: async () => { if (options.failedSave) context.dirty = true; },
    db: { from(table) { assert.equal(table, 'consultations'); return query; } },
    loadList: async () => refreshed.push('list'),
    openConsult: async id => refreshed.push(id)
  };
  vm.runInNewContext(changeSource, context);
  return { context, row, writes, notices, refreshed, filters };
}

test('scheduled, in-progress, and completed consultations can become No Show without losing history', async () => {
  for (const status of ['scheduled', 'in_progress', 'completed']) {
    const { context, row, writes, filters, refreshed } = attendance(status);
    const original = JSON.stringify(row);
    await context.changeAttendanceStatus('no_show');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].status, 'no_show');
    assert.equal(writes[0].completed_at, null);
    assert.deepEqual(Object.keys(writes[0]).sort(), ['completed_at', 'status']);
    assert.deepEqual(filters, [['id', row.id], ['status', status]]);
    assert.deepEqual(refreshed, ['list', row.id]);
    assert.equal(JSON.stringify(row), original, 'profile links, notes, and original row remain intact');
  }
});

test('No Show can be corrected to scheduled, in progress, or completed', async () => {
  for (const status of ['scheduled', 'in_progress', 'completed']) {
    const { context, writes, filters } = attendance('no_show');
    await context.changeAttendanceStatus(status);
    assert.equal(writes[0].status, status);
    assert.deepEqual(filters[1], ['status', 'no_show']);
    if (status === 'completed') assert.ok(Number.isFinite(Date.parse(writes[0].completed_at)));
    else assert.equal(writes[0].completed_at, null);
    if (status === 'in_progress') assert.ok(Number.isFinite(Date.parse(writes[0].started_at)));
  }
});

test('failed saves, pending saves, invalid transitions, stale updates, and database errors are explicit', async () => {
  for (const status of ['cancelled', 'rescheduled']) {
    const state = attendance(status);
    await state.context.changeAttendanceStatus('no_show');
    assert.equal(state.writes.length, 0);
    assert.match(state.notices[0][0], /not available/);
  }
  const pending = attendance('in_progress');
  pending.context.saving = true;
  await pending.context.changeAttendanceStatus('no_show');
  assert.equal(pending.writes.length, 0);
  assert.match(pending.notices[0][0], /still saving/);
  const unsaved = attendance('in_progress', { failedSave: true });
  await unsaved.context.changeAttendanceStatus('no_show');
  assert.equal(unsaved.writes.length, 0);
  for (const result of [
    { data: null, error: null },
    { data: null, error: { message: 'Migration required' } }
  ]) {
    const state = attendance('scheduled', { result });
    await state.context.changeAttendanceStatus('no_show');
    assert.equal(state.refreshed.length, 0);
    assert.equal(state.notices[0][1], true);
    assert.match(state.notices[0][0], /changed elsewhere|Migration required/);
  }
});

function renderDetail(status) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', classList: { add() {}, remove() {} },
      addEventListener() {}, querySelectorAll: () => []
    });
    return elements.get(id);
  };
  const context = {
    current: { id: '1', status, template: { notes: 'Preserved note' } },
    isStrat: () => false, CHECKLIST: [], STRAT_CHECKLIST: [], RECS: [],
    esc: value => String(value ?? ''), fmt: () => 'Date', CREDIT_LABEL: {},
    document: { getElementById: get },
    closeDetail() {}, queueSave() {}, toggleTimer() {}, makeDraft() {}, completeConsult() {},
    changeAttendanceStatus() {}
  };
  const source = html.slice(html.indexOf('function renderDetail('), html.indexOf('function collect('));
  vm.runInNewContext(source, context);
  context.renderDetail([{ created_at: 'now', event_type: 'status_changed', details: { from_status: 'completed', to_status: 'no_show' } }]);
  return get('detail-view').innerHTML;
}

test('No Show has a distinct badge, read-only preserved notes, correction controls, and status history', () => {
  const rendered = renderDetail('no_show');
  assert.match(html, /\.label\.no_show\{background:#fff0cc;color:#754b00\}/);
  assert.match(rendered, /class="label no_show">no show/);
  assert.match(rendered, /data-top="notes" disabled>Preserved note/);
  assert.match(rendered, /id="correct-status"/);
  for (const status of ['scheduled', 'in_progress', 'completed']) {
    assert.match(rendered, new RegExp(`<option value="${status}">`));
    assert.match(renderDetail(status), /id="no-show"/);
  }
  assert.match(rendered, /completed → no show/);
  assert.match(rendered, /id="draft" type="button" disabled/);
  assert.doesNotMatch(rendered, /id="complete"/);
});

test('No Show stays in past history, not the upcoming list', async () => {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { querySelectorAll: () => [] });
    return elements.get(id);
  };
  const context = {
    document: { getElementById: get },
    db: { from: () => ({ select: () => ({ order: async () => ({
      data: ['scheduled', 'completed', 'cancelled', 'no_show'].map(status => ({
        id: status, status, invitee_name: status, consult_type: 'free_consultation'
      })), error: null
    }) }) }) },
    excludeStudentConsultations: rows => rows, profileNames: async () => new Map(),
    esc: String, fmt: () => 'Date', TYPE_LABEL: {}, isStrat: () => false
  };
  vm.runInNewContext(html.slice(html.indexOf('async function loadList('), html.indexOf('function excludeStudentConsultations(')), context);
  await context.loadList();
  const [upcoming, history] = get('list').innerHTML.split('<details');
  assert.doesNotMatch(upcoming, /label no_show/);
  assert.match(upcoming, /View \/ mark No Show/);
  assert.match(history, /Past and cancelled consultations \(3\)/);
  assert.match(history, /label no_show/);
});

test('restarting a corrected scheduled consultation does not overwrite existing notes', async () => {
  const original = { notes: 'Existing notes', snapshot: { exam: 'NCLEX-PN' }, custom: { keep: true } };
  let patch;
  const context = {
    consults: [{ id: '1', template: original }], prefill: async () => ({ exam: 'NCLEX-RN' }),
    db: { from: () => ({
      update(value) { patch = value; return this; }, eq() { return this; }, select() { return this; },
      maybeSingle: async () => ({ data: { id: '1' }, error: null })
    }) },
    loadList: async () => {}, openConsult() {}
  };
  vm.runInNewContext(html.slice(html.indexOf('async function startConsult('), html.indexOf('async function openConsult(')), context);
  await context.startConsult('1');
  assert.equal(patch.template.notes, original.notes);
  assert.equal(patch.template.snapshot, original.snapshot);
  assert.equal(patch.template.custom, original.custom);
});

test('migration extends statuses without rewriting existing records or access policies', () => {
  assert.match(migration, /CHECK \(status IN \('scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled', 'no_show'\)\)/);
  assert.match(migration, /BEFORE UPDATE OF status ON public\.consultations/);
  assert.match(migration, /NEW\.completed_at := NULL/);
  assert.match(migration, /INSERT INTO public\.consultation_events/);
  assert.match(migration, /'previous_completed_at', OLD\.completed_at/);
  assert.match(migration, /'changed_by', auth\.uid\(\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION/);
  assert.doesNotMatch(migration.slice(0, migration.indexOf('-- Recheck attendance')), /(?:UPDATE|DELETE FROM) public\.consultations|(?:DROP|CREATE) POLICY|DISABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /(?:DROP|CREATE) POLICY|DISABLE ROW LEVEL SECURITY/);
  assert.equal((migration.match(/AND status <> 'no_show'/g) || []).length, 2);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.claim_followup\(uuid, text\) FROM PUBLIC, anon, authenticated/);
});

test('existing count, tutoring availability, calendar, and follow-up filters exclude No Show', () => {
  const admin = read('madison-admin.html');
  assert.match(admin, /select\('id',\{count:'exact',head:true\}\)\.eq\('status','scheduled'\)/);
  const tutoring = read('madison-tutoring-sessions.html');
  assert.match(tutoring, /\.in\('status',\['scheduled','in_progress'\]\)/);
  const context = {};
  vm.runInNewContext(tutoring.slice(tutoring.indexOf('function isAvailable('), tutoring.indexOf('async function loadSessions(')), context);
  for (const status of ['no_show', 'completed', 'cancelled']) {
    assert.equal(context.isAvailable({ status, scheduled_start: '2099-01-01' }), false);
  }
  assert.match(read('supabase-admin-appointment-calendar-migration.sql'), /WHERE c\.status = 'scheduled'/);
  assert.match(read('supabase/functions/send-strategy-followups/index.ts'), /\.in\("status", \["scheduled", "in_progress", "completed"\]\)/);
});
