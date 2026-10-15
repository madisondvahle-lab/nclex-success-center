(function () {
  'use strict';
  function date(value) {
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value + 'T12:00:00');
    if (!Number.isFinite(d.getTime())) throw new Error('Choose a valid date.');
    return d;
  }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function monday(value = new Date()) {
    const d = date(value);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return iso(d);
  }
  function progress(resources, week = monday()) {
    const items = resources.filter(r => r.assignment_week === week);
    const completed = items.filter(r => r.completed_at);
    return {
      count: items.length, done: completed.length,
      questions: items.filter(r => r.assignment_kind === 'practice').reduce((n, r) => n + Number(r.assignment_details?.question_count || 0), 0),
      questionsDone: completed.filter(r => r.assignment_kind === 'practice').reduce((n, r) => n + Number(r.assignment_details?.question_count || 0), 0),
      cats: items.filter(r => r.assignment_kind === 'cat').length,
      catsDone: completed.filter(r => r.assignment_kind === 'cat').length
    };
  }
  window.WeeklyAssignments = { monday, progress };
})();
