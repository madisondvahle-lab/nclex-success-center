/* Admin weekly review queue helpers. Reports recorded facts only; it never infers clinical
   readiness or links a result to a specific assignment. */
(function () {
  'use strict';
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parse(value) {
    const d = new Date(String(value) + 'T12:00:00');
    if (!Number.isFinite(d.getTime()) || iso(d) !== value) throw new Error('Choose a valid date.');
    return d;
  }
  function addDays(value, n) {
    const d = parse(value);
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  function localDay(timestamp) {
    const d = new Date(timestamp);
    return Number.isFinite(d.getTime()) ? iso(d) : '';
  }
  function midnight(value) {
    const d = parse(value);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  // Calendar week Monday–Sunday in the tutor's local time zone.
  function range(monday) {
    if (parse(monday).getDay() !== 1) throw new Error('Choose a Monday.');
    const end = addDays(monday, 6), next = addDays(monday, 7);
    return { start: monday, end, next, prev: addDays(monday, -7), startAt: midnight(monday), endAt: midnight(next) };
  }
  const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const platformName = (v, fallback) => (globalThis.window && window.AssessmentPlatforms ? window.AssessmentPlatforms.name(v, fallback) : String(v || '').trim() || fallback);
  const catName = v => (globalThis.window && window.NCLEXCats ? window.NCLEXCats.canon(v) : v);
  const TYPE = { cat: 'CAT', readiness_exam: 'Readiness exam', qbank_report: 'Qbank report', cpr_report: 'CPR report', other: 'Report' };

  function categoryList(scores, counts) {
    if (!scores || typeof scores !== 'object') return [];
    return Object.keys(scores).map(k => ({ name: catName(k), score: num(scores[k]), n: num(counts && counts[k]) }))
      .filter(c => c.score !== null).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  }
  // Normalize every recorded result source into one shape, keeping only the selected week.
  function results(data, week) {
    const out = [];
    const keep = (item, recordedDate, fallbackTimestamp) => {
      item.dateKnown = !!recordedDate;
      item.date = recordedDate || localDay(fallbackTimestamp);
      if (item.date && item.date >= week.start && item.date <= week.end) out.push(item);
    };
    (data.external || []).forEach(r => keep({
      student_id: r.student_id, source: 'Logged score', kind: 'assessment', platform: platformName(r.platform, 'Assessment'),
      label: r.assessment_name || 'CAT / readiness', overall: num(r.overall_score), categories: categoryList(r.category_scores, r.category_counts)
    }, r.taken_at, r.created_at));
    const cats = {};
    (data.uploadCats || []).forEach(c => {
      const e = cats[c.assessment_id] || (cats[c.assessment_id] = { s: {}, n: {} });
      e.s[c.category] = c.score;
      e.n[c.category] = c.total_count;
    });
    (data.uploads || []).forEach(r => keep({
      student_id: r.student_id, source: 'Uploaded report',
      kind: r.assessment_type === 'cat' || r.assessment_type === 'readiness_exam' ? 'assessment' : r.assessment_type === 'qbank_report' ? 'practice' : 'other',
      platform: platformName(r.platform, 'Other'), label: r.report_label || TYPE[r.assessment_type] || 'Report',
      overall: num(r.overall_score), categories: categoryList(cats[r.id] && cats[r.id].s, cats[r.id] && cats[r.id].n)
    }, r.taken_on, r.created_at));
    (data.practice || []).forEach(r => keep({
      student_id: r.student_id, source: 'Portal practice', kind: 'practice', platform: 'Portal Question Bank', label: r.practice_title || 'Practice set',
      correct: num(r.score), total: num(r.total_questions), categories: []
    }, localDay(r.completed_at), null));
    (data.inHouse || []).forEach(r => keep({
      student_id: r.student_id, source: 'Portal assessment', kind: r.mode === 'mock' || r.mode === 'nclex' ? 'assessment' : 'practice',
      platform: 'Portal Question Bank', label: r.assessment_title || 'Portal assessment', correct: num(r.correct_questions), total: num(r.total_questions), categories: []
    }, localDay(r.completed_at), null));
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  }

  function rows(students, plans, data, week, today, failed) {
    const all = results(data, week);
    const resources = (data.resources || []).filter(r => r.assignment_kind === 'practice' || r.assignment_kind === 'cat');
    const unavailable = !!(failed && failed.length);
    return students.map(s => {
      // Weekly plans and assignment generation are NCLEX-only (generate_weekly_assignments skips nursing_student).
      const nursing = s.student_type === 'nursing_student';
      const plan = nursing ? null : plans.get(s.id) || null;
      const work = resources.filter(r => r.student_id === s.id && r.assignment_week === week.start).sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)));
      const next = resources.filter(r => r.student_id === s.id && r.assignment_week === week.next);
      const practice = work.filter(r => r.assignment_kind === 'practice'), cats = work.filter(r => r.assignment_kind === 'cat');
      const mine = all.filter(r => r.student_id === s.id);
      const assessments = mine.filter(r => r.kind === 'assessment').length;
      const counts = {
        practice: practice.length, practiceDone: practice.filter(r => r.completed_at).length,
        questions: practice.reduce((n, r) => n + Number(r.assignment_details && r.assignment_details.question_count || 0), 0),
        questionsDone: practice.filter(r => r.completed_at).reduce((n, r) => n + Number(r.assignment_details && r.assignment_details.question_count || 0), 0),
        cats: cats.length, catsDone: cats.filter(r => r.completed_at).length,
        overdue: work.filter(r => !r.completed_at && r.due_on && r.due_on < today).length,
        next: next.length
      };
      const flags = [];
      const focus = plan ? (plan.focus_categories || []).length + (plan.focus_topics || []).length : 0;
      if (nursing) {
        if (counts.overdue) flags.push(counts.overdue + ' overdue (not marked complete)');
      } else if (!plan) flags.push('No weekly plan');
      else {
        if (!work.length) flags.push('No assignments generated for this week');
        if (counts.overdue) flags.push(counts.overdue + ' overdue (not marked complete)');
        if (!focus) flags.push('No focus categories or topics');
        if (!unavailable && counts.catsDone > assessments) flags.push(counts.catsDone + ' CAT' + (counts.catsDone === 1 ? '' : 's') + ' marked complete; ' + assessments + ' CAT/readiness score' + (assessments === 1 ? '' : 's') + ' recorded');
      }
      const status = nursing ? 'nursing' : !plan ? 'no-plan' : counts.next ? 'assigned' : 'review';
      return { student: s, nursing, plan, status, flags, counts, work, results: mine, resultsUnavailable: unavailable, focusUpdated: plan && plan.focus_updated_at || null };
    }).sort((a, b) => {
      const rank = { review: 0, 'no-plan': 1, assigned: 2, nursing: 3 };
      return rank[a.status] - rank[b.status] || String(a.focusUpdated || '').localeCompare(String(b.focusUpdated || '')) || String(a.student.name).localeCompare(String(b.student.name));
    });
  }
  window.WeeklyReview = { range, results, rows, localDay, addDays };
})();
