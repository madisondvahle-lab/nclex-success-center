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
