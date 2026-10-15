const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = file => readFileSync(join(__dirname, '..', file), 'utf8');
function load() {
  const context = { window: {} };
  context.globalThis = context;
  vm.createContext(context);
  for (const f of ['category-names.js', 'assessment-platforms.js', 'weekly-review.js']) vm.runInContext(read(f), context);
  return context.window.WeeklyReview;
}
const plain = v => JSON.parse(JSON.stringify(v));

test('calendar week ranges require a Monday and cross month/year boundaries', () => {
  const R = load();
  const w = R.range('2026-12-28');
  assert.deepEqual([w.start, w.end, w.next, w.prev], ['2026-12-28', '2027-01-03', '2027-01-04', '2026-12-21']);
  assert.ok(new Date(w.endAt) - new Date(w.startAt) >= 6.9 * 86400000);
  assert.throws(() => R.range('2026-10-14'), /Monday/);
  assert.throws(() => R.range('2026-02-30'), /valid date/);
});

test('results keep only the selected week, normalize platforms, and sort categories lowest first', () => {
  const R = load(), week = R.range('2026-10-12');
  const out = R.results({
    external: [
      { student_id: 'a', platform: 'uworld', assessment_name: 'CAT 3', taken_at: '2026-10-18', overall_score: 61, category_scores: { 'Pharmacological and Parenteral Therapies': 48, 'Mgmt of Care': 70 }, category_counts: { 'Mgmt of Care': 3 } },
      { student_id: 'a', platform: 'archer', assessment_name: 'Old', taken_at: '2026-10-11', overall_score: 55 },
      { student_id: 'a', platform: 'kaplan', assessment_name: 'Next', taken_at: '2026-10-19', overall_score: 55 },
      { student_id: 'a', platform: 'archer', assessment_name: 'Undated', taken_at: null, created_at: new Date(2026, 9, 14, 9).toISOString() }
    ],
    uploads: [{ id: 'u1', student_id: 'b', platform: 'bootcamp', assessment_type: 'readiness_exam', taken_on: '2026-10-12', overall_score: 72 }],
    uploadCats: [{ assessment_id: 'u1', category: 'Safety and Infection Control', score: 66, total_count: 12 }],
    practice: [{ student_id: 'a', practice_title: 'Assigned practice', score: 38, total_questions: 50, completed_at: new Date(2026, 9, 18, 23, 30).toISOString() }],
    inHouse: [{ student_id: 'b', assessment_title: 'Mock CAT', mode: 'mock', correct_questions: 60, total_questions: 85, completed_at: new Date(2026, 9, 19, 0, 30).toISOString() }]
  }, week);
  assert.deepEqual(plain(out.map(r => r.label)), ['Readiness exam', 'Undated', 'Assigned practice', 'CAT 3']);
  const cat = out.find(r => r.label === 'CAT 3');
  assert.equal(cat.platform, 'UWorld');
  assert.deepEqual(plain(cat.categories), [{ name: 'Pharmacological and Parenteral Therapies', score: 48, n: null }, { name: 'Management of Care', score: 70, n: 3 }]);
  assert.equal(out.find(r => r.label === 'Undated').dateKnown, false);
  assert.equal(out.find(r => r.label === 'Readiness exam').kind, 'assessment');
  assert.deepEqual(plain(out.find(r => r.label === 'Readiness exam').categories), [{ name: 'Safety and Infection Control', score: 66, n: 12 }]);
});

test('queue rows count self-reported work, flag gaps factually, and order the queue', () => {
  const R = load(), week = R.range('2026-10-12');
  const students = [{ id: 'a', name: 'Ava' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cy' }, { id: 'd', name: 'Di' }];
  const plans = new Map([
    ['a', { focus_categories: ['Management of Care'], focus_updated_at: '2026-10-01T00:00:00Z' }],
    ['b', { focus_categories: [], focus_topics: [] }],
    ['d', { focus_categories: ['Psychosocial Integrity'], focus_updated_at: '2026-09-01T00:00:00Z' }]
  ]);
  const p = (id, s, due, done, n = 50) => ({ student_id: s, assignment_week: '2026-10-12', assignment_kind: 'practice', due_on: due, completed_at: done ? due : null, assignment_details: { question_count: n }, id });
  const c = (id, s, due, done) => ({ student_id: s, assignment_week: '2026-10-12', assignment_kind: 'cat', due_on: due, completed_at: done ? due : null, id });
  const data = {
    resources: [
      p(1, 'a', '2026-10-12', true), p(2, 'a', '2026-10-14', false), p(3, 'a', '2026-10-16', false),
      c(4, 'a', '2026-10-13', true), c(5, 'a', '2026-10-17', false),
      { student_id: 'd', assignment_week: '2026-10-19', assignment_kind: 'practice', due_on: '2026-10-19', id: 6 }
    ],
    external: []
  };
  const rows = R.rows(students, plans, data, week, '2026-10-15', []);
  assert.deepEqual(plain(rows.map(r => [r.student.id, r.status])), [['b', 'review'], ['a', 'review'], ['c', 'no-plan'], ['d', 'assigned']]);
  const a = rows.find(r => r.student.id === 'a');
  assert.deepEqual(plain(a.counts), { practice: 3, practiceDone: 1, questions: 150, questionsDone: 50, cats: 2, catsDone: 1, overdue: 1, next: 0 });
  assert.deepEqual(plain(a.flags), ['1 overdue (not marked complete)', '1 CAT marked complete; 0 CAT/readiness scores recorded']);
  assert.deepEqual(plain(rows.find(r => r.student.id === 'b').flags), ['No assignments generated for this week', 'No focus categories or topics']);
  assert.deepEqual(plain(rows.find(r => r.student.id === 'c').flags), ['No weekly plan']);
  const unavailable = R.rows(students, plans, data, week, '2026-10-15', ['logged scores']).find(r => r.student.id === 'a');
  assert.equal(unavailable.resultsUnavailable, true);
  assert.ok(!unavailable.flags.some(f => f.includes('CAT marked complete')));
});

test('nursing students appear read-only with their own work and results, never as plan or generation candidates', () => {
  const R = load(), week = R.range('2026-10-12');
  const students = [{ id: 'n', name: 'Nia', student_type: 'nursing_student' }, { id: 'x', name: 'Xan', student_type: 'nclex' }, { id: 'm', name: 'Mo', student_type: 'nursing_student' }];
  const plans = new Map([['n', { focus_categories: ['Pharmacological and Parenteral Therapies'] }], ['x', { focus_categories: ['Management of Care'] }]]);
  const data = {
    resources: [
      { id: 1, student_id: 'n', assignment_week: '2026-10-12', assignment_kind: 'practice', due_on: '2026-10-13', completed_at: null, assignment_details: { question_count: 20 } },
      { id: 2, student_id: 'n', assignment_week: '2026-10-19', assignment_kind: 'practice', due_on: '2026-10-19', completed_at: null }
    ],
    practice: [{ student_id: 'm', practice_title: 'Cardiac', score: 8, total_questions: 10, completed_at: '2026-10-14T15:00:00Z' }]
  };
  const rows = R.rows(students, plans, data, week, '2026-10-15', []);
  assert.deepEqual(plain(rows.map(r => [r.student.id, r.status, r.nursing])), [['x', 'review', false], ['m', 'nursing', true], ['n', 'nursing', true]]);
  const n = rows.find(r => r.student.id === 'n'), m = rows.find(r => r.student.id === 'm');
  assert.equal(n.plan, null, 'a stray plan row must not make a nursing student assignable');
  assert.deepEqual(plain(n.counts), { practice: 1, practiceDone: 0, questions: 20, questionsDone: 0, cats: 0, catsDone: 0, overdue: 1, next: 1 });
  assert.deepEqual(plain(n.flags), ['1 overdue (not marked complete)']);
  assert.deepEqual(plain(m.flags), []);
  assert.equal(m.results.length, 1);
  const html = read('madison-study-plans.html');
  assert.match(html, /nursingStudents=\(st\.data\|\|\[\]\)\.filter\(s=>s\.student_type==='nursing_student'\)/);
  assert.match(html, /students\.concat\(nursingStudents\)/);
  assert.match(html, /r\.nursing\?'':`<button[^`]*data-edit=/);
  assert.match(html, /aren’t available for nursing students/);
  assert.match(html, /<option value="nursing">/);
});

test('weekly plans page wires the review queue and its inline scripts compile', () => {
  const html = read('madison-study-plans.html');
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  assert.match(html, /<script src="weekly-review.js"><\/script>/);
  assert.ok(html.indexOf('id="review"') < html.indexOf('id="editor-panel"'));
  assert.match(html, /already-generated assignments keep/i);
  assert.match(html, /runGenerate\(week,id\)/);
});
