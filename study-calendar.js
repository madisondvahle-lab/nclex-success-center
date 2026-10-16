(function () {
  'use strict';

  const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function parseDate(value) {
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }

  function monthKey(value) {
    const date = parseDate(value);
    if (!date) throw new Error('Choose a valid calendar month.');
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthGrid(value) {
    const key = monthKey(`${value}-01`);
    const [year, month] = key.split('-').map(Number);
    const first = new Date(year, month - 1, 1);
    first.setDate(first.getDate() - (first.getDay() + 6) % 7);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(first);
      date.setDate(first.getDate() + index);
      return isoDate(date);
    });
  }

  function visibleRange(value) {
    const dates = monthGrid(value);
    const end = parseDate(dates[dates.length - 1]);
    end.setDate(end.getDate() + 1);
    return { start: dates[0], end: isoDate(end), dates };
  }

  function addEvent(events, date, event) {
    if (!events.has(date)) events.set(date, []);
    events.get(date).push(event);
  }

  function buildEvents(options) {
    const month = monthKey(`${options.month}-01`);
    const range = visibleRange(month);
    const dates = new Set(range.dates);
    const events = new Map();

    if (options.isNursing) {
      (options.schedules || []).forEach(schedule => {
        if (dates.has(schedule.next_exam_date)) {
          addEvent(events, schedule.next_exam_date, {
            type: 'exam', label: `${schedule.class_code || schedule.class_name} exam`,
            detail: schedule.class_name || schedule.class_code || 'Class exam'
          });
        }
      });
      const hasScheduledExam = (options.schedules || []).some(schedule => schedule.next_exam_date);
      if (!hasScheduledExam && dates.has(options.studentExamDate)) {
        addEvent(events, options.studentExamDate, { type: 'exam', label: 'Next class exam', detail: 'Class exam' });
      }
    } else if (dates.has(options.examDate)) {
      addEvent(events, options.examDate, { type: 'exam', label: 'NCLEX target date', detail: 'Target NCLEX date' });
    }

    const assignments = options.resources || [];
    assignments.forEach(resource => {
      if (!dates.has(resource.due_on)) return;
      addEvent(events, resource.due_on, {
        type: 'assignment',
        kind: resource.assignment_kind || resource.resource_type || 'assignment',
        label: resource.title || 'Assigned work',
        detail: resource.assignment_details?.platform || resource.note || '',
        completed: Boolean(resource.completed_at),
        url: resource.url || ''
      });
    });

    if (!options.isNursing && options.plan && typeof options.plan === 'object') {
      const plan = window.WeeklyPlan.normalize(options.plan);
      const today = isoDate(options.today instanceof Date ? options.today : new Date());
      range.dates.forEach(date => {
        if (date < today || (options.examDate && date >= options.examDate)) return;
        const day = weekdays[new Date(`${date}T12:00:00`).getDay()];
        const actualKinds = new Set(assignments.filter(item => item.due_on === date).map(item => item.assignment_kind));
        if (plan.practice_days.includes(day) && !actualKinds.has('practice')) {
          addEvent(events, date, {
            type: 'plan', kind: 'practice',
            label: `${plan.practice_questions_per_day} practice questions`,
            detail: [plan.practice_platform, ...plan.focus_categories].join(' · ')
          });
        }
        if (plan.cat_days.includes(day) && !actualKinds.has('cat')) {
          addEvent(events, date, { type: 'plan', kind: 'cat', label: 'CAT / readiness exam', detail: plan.cat_platform });
        }
      });
    }

    (options.consultations || []).forEach(consultation => {
      const start = new Date(consultation.scheduled_start);
      if (!Number.isFinite(start.getTime())) return;
      const date = isoDate(start);
      if (!dates.has(date)) return;
      addEvent(events, date, {
        type: 'consultation',
        label: consultation.consult_type === 'strategy_session' ? 'Strategy session' : 'Tutoring session',
        detail: start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      });
    });

    const priority = { exam: 0, consultation: 1, assignment: 2, plan: 3 };
    events.forEach(items => items.sort((a, b) => priority[a.type] - priority[b.type] || a.label.localeCompare(b.label)));
    return { dates: range.dates, events, start: range.start, end: range.end };
  }

  window.StudyCalendar = { isoDate, monthKey, monthGrid, visibleRange, buildEvents };
})();
