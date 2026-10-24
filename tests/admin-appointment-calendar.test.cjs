const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'madison-admin.html'), 'utf8');
const source = html.slice(html.indexOf('const appointmentKind='), html.indexOf('async function loadAppointmentCalendar('));

function render(events, date = '2026-10-20') {
  const elements = new Map();
  const context = {
    $: id => {
      if (!elements.has(id)) elements.set(id, { querySelectorAll: () => [] });
      return elements.get(id);
    },
    esc: String,
    StudyCalendar: {
      isoDate: () => '2026-10-01',
      visibleRange: () => ({ dates: [date] })
    },
    appointmentMonth: '2026-10',
    appointmentSelectedDate: date,
    appointmentsByDate: new Map([[date, events]])
  };
  vm.runInNewContext(source + ';renderAppointmentCalendar();', context);
  return { grid: elements.get('appointments-grid').innerHTML, agenda: elements.get('appointments-agenda').innerHTML };
}

const types = ['free_consultation', 'strategy_session', 'tutoring_session', 'free_consultation', 'tutoring_session'];
const events = types.map((consult_type, index) => ({
  name: `Person ${index + 1}`,
  time: `${index + 9}:00 AM`,
  consult_type,
  label: { free_consultation: 'Initial consult', strategy_session: 'Strategy session', tutoring_session: 'Tutoring session' }[consult_type],
  url: '#'
}));

test('calendar cell shows the full meeting count and explicit overflow', () => {
  const { grid } = render(events);
  assert.match(grid, /class="admin-calendar-count"[^>]*>5<\/span>/);
  assert.equal((grid.match(/class="admin-calendar-chip /g) || []).length, 2);
  assert.match(grid, />\+3 more</);
  assert.match(grid, /5 appointments: .*Person 5/);
});

test('chips carry visible type labels and type classes', () => {
  const { grid } = render(events);
  assert.match(grid, /admin-calendar-chip free"[^>]*><b>Consult<\/b>/);
  assert.match(grid, /admin-calendar-chip strategy"[^>]*><b>Strategy<\/b>/);
});

test('selected-date agenda lists every person with labeled types', () => {
  const { agenda } = render(events);
  assert.match(agenda, /5 appointments<\/h3>/);
  for (const event of events) assert.ok(agenda.includes(event.name));
  assert.equal((agenda.match(/class="admin-agenda-type /g) || []).length, 5);
  assert.match(agenda, /admin-agenda-type tutoring">Tutoring session/);
});

test('no overflow note when all appointments fit', () => {
  const { grid } = render(events.slice(0, 2));
  assert.doesNotMatch(grid, /more</);
});

test('calendar resolves converted intakes and opens the right appointment workflow', async () => {
  const loader = html.slice(html.indexOf('async function loadAppointmentCalendar('), html.indexOf('function changeAppointmentMonth('));
  const bookings = [
    { id: 'tutor/1', consult_type: 'tutoring_session', student_id: 'student' },
    { id: 'converted', consult_type: 'strategy_session', student_id: null, consult_intakes: { student_id: 'converted-student' } },
    { id: 'direct', consult_type: 'free_consultation', student_id: 'direct-student', consult_intakes: { student_id: 'other' } },
    { id: 'prospect', consult_type: 'free_consultation', student_id: null, consult_intakes: null }
  ].map(booking => ({ ...booking, invitee_name: booking.id, scheduled_start: '2099-10-20T12:00:00Z' }));
  const elements = new Map();
  const query = {
    select(fields) { assert.match(fields, /consult_intakes\(student_id\)/); return this; },
    eq() { return this; }, gte() { return this; }, lt() { return this; },
    async order() { return { data: bookings, error: null }; }
  };
  const context = {
    appointmentRequest: 0, appointmentMonth: '2099-10', appointmentSelectedDate: '2099-10-20',
    StudyCalendar: { visibleRange: () => ({ start: '2099-10-01', end: '2099-11-01' }), isoDate: () => '2099-10-20' },
    db: { from(table) { assert.equal(table, 'consultations'); return query; } },
    $: id => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); },
    consultationType: type => type,
    renderAppointmentCalendar() {}
  };
  vm.runInNewContext(loader, context);
  await context.loadAppointmentCalendar();
  const events = context.appointmentsByDate.get('2099-10-20');
  assert.deepEqual(Array.from(events, event => event.url), [
    'madison-tutoring-sessions.html?session=tutor%2F1',
    'shared-progress.html?student=converted-student',
    'shared-progress.html?student=direct-student',
    'madison-consultations.html?consultation=prospect'
  ]);
  assert.equal(events.length, bookings.length);
});
