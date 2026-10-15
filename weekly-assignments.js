(function () {
  'use strict';
  function date(value) {
    const d = value instanceof Date ? new Date(value.getTime()) : new Date(value + 'T12:00:00');
    if (!Number.isFinite(d.getTime()) || (!(value instanceof Date) && iso(d) !== value)) throw new Error('Choose a valid date.');
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
  function reminders(resources, now = new Date()) {
    const today = iso(date(now));
    const next = date(today);
    next.setDate(next.getDate() + 1);
    const tomorrow = iso(next);
    const pending = resources.filter(r => r.assignment_week && ['practice', 'cat'].includes(r.assignment_kind) && !r.completed_at);
    const invalid = pending.filter(r => {
      try { date(r.due_on); return false; } catch { return true; }
    });
    const dated = pending.filter(r => !invalid.includes(r)).sort((a, b) => a.due_on.localeCompare(b.due_on) || String(a.id).localeCompare(String(b.id)));
    const nextCat = dated.find(r => r.assignment_kind === 'cat' && r.due_on > today)?.due_on;
    return {
      count: resources.filter(r => r.assignment_week && ['practice', 'cat'].includes(r.assignment_kind)).length,
      pending: pending.length,
      invalid: invalid.length,
      items: dated.filter(r => r.due_on <= tomorrow || (r.assignment_kind === 'cat' && r.due_on === nextCat)).map(item => ({
        item,
        label: item.due_on < today ? 'Overdue' : item.due_on === today ? 'Due today' : item.due_on === tomorrow ? 'Due tomorrow' : 'Next CAT',
        overdue: item.due_on < today,
        date: date(item.due_on).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      }))
    };
  }
  function actionUrl(value, base) {
    if (!value) return '';
    try {
      const url = new URL(value, base);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }
  window.WeeklyAssignments = { monday, progress, reminders, actionUrl };
})();
