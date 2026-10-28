// Synthetic local browser data only. This transport never contacts Supabase.
(function () {
  const config = window.__HISTORY_TEST__ || {};
  const failedSource = new URLSearchParams(location.search).get('failSource');
  if (failedSource) config.failSource = failedSource;
  const student = { id: 'synthetic-student', auth_user_id: 'synthetic-user', name: 'Test Student',
    portal_stage: 'active', student_type: config.nursing ? 'nursing_student' : 'nclex', course_name: 'Synthetic course' };
  const calls = window.__historyCalls = [];
  const detail = (id, selected, correct, extra = {}) => ({ question_id: id, stem: 'Synthetic prompt ' + id,
    options: ['Alpha', 'Beta', 'Gamma'], selected_answer: selected, correct_answer: correct,
    correct: JSON.stringify(selected) === JSON.stringify(correct), rationale: 'Synthetic rationale ' + id,
    category: 'Management of Care', topic: 'Synthetic topic', ...extra });
  const details = [
    detail('00000000-0000-4000-8000-000000000001', 0, 0),
    detail('q1', 0, 2, { question_no: 42, presentation: { version: 'sata-order-v1', order: [2, 0, 1], ids: ['a', 'b', 'c'] } }),
    detail('q2', [0], [0, 1], { credit: { earned: 1, max: 2, score: 0.5 } }),
    detail('q3', [], [0]),
    detail('q4', '5', '5', { interaction: { type: 'fill', correct: 5, stem: 'Synthetic calculation',
      rationale: 'Synthetic calculation rationale', tabs: [
        { label: 'Saved notes', columns: ['Finding'], entries: [{ at: '2026-10-27T08:00', cells: ['Saved clinical record'] }] }
      ] } })
  ];
  const tables = {
    students: [student], app_admins: [], student_resources: [], modules: [],
    questions: [{ id: '00000000-0000-4000-8000-000000000001', question_no: 123 }],
    question_set_items: [{ set_key: 'synthetic-set', legacy_id: 'q2', question: { question_no: 456 } }],
    student_supplemental_practice_results: [
      ...Array.from({ length: 21 }, (_, i) => ({ id: 'p' + i, student_id: student.id, practice_key: 'synthetic-set', practice_title: i === 0 ? 'Synthetic practice test' : i === 1 ? 'Older score-only test' : 'Synthetic older test ' + i,
        score: 2, total_questions: 5, completed_at: new Date(Date.UTC(2026, 9, 27 - i, 12)).toISOString(), answer_details: i === 0 ? details : [] })),
      { id: 'private-other', student_id: 'another-student', practice_title: 'Other student private test', completed_at: '2026-10-28', answer_details: [] }
    ],
    in_house_assessment_attempts: [
      { id: 'cat', student_id: student.id, assessment_title: 'Synthetic mock CAT', status: 'completed', mode: 'mock',
        result: 'PASS', correct_questions: 1, total_questions: 1, completed_at: '2026-10-27T13:00:00Z' },
      { id: 'unfinished', student_id: student.id, assessment_title: 'Unfinished test', status: 'in_progress' }
    ],
    external_assessments: [{ id: 'external', student_id: student.id, assessment_name: 'Synthetic external CAT', platform: 'Archer', overall_score: 70, taken_at: '2026-10-25' }]
  };
  const db = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'synthetic-user' } } } }), signOut: async () => ({ error: null }) },
    rpc: async () => ({ data: [], error: null }),
    functions: { invoke: async (name, args) => {
      calls.push({ name, ...args });
      if (config.failReview) return { error: { message: 'Synthetic review failure' } };
      return { data: { responses: [detail('qbank:00000000-0000-4000-8000-000000000001', 0, 0)] } };
    } },
    from(table) {
      const filters = [], sorts = [];
      let fields = '*', single = false, start = 0, end = Infinity;
      const query = {
        select(value) { fields = value; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        in(key, values) { filters.push([key, values]); return query; },
        order(key, options) { sorts.push([key, options?.ascending !== false]); return query; },
        limit(count) { end = count - 1; return query; },
        range(first, last) { start = first; end = last; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          calls.push({ table, fields, filters, start, end });
          if (config.failSource === table) return Promise.resolve({ error: { message: 'Synthetic source failure' }, data: null }).then(resolve, reject);
          let rows = (tables[table] || []).filter(row => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
          rows = [...rows].sort((a, b) => {
            for (const [key, ascending] of sorts) {
              const diff = String(a[key] ?? '').localeCompare(String(b[key] ?? ''));
              if (diff) return ascending ? diff : -diff;
            }
            return 0;
          }).slice(start, end === Infinity ? undefined : end + 1);
          if (fields !== '*') rows = rows.map(row => Object.fromEntries(fields.split(',').map(field => {
            const key = field.startsWith('question:') ? 'question' : field;
            return [key, row[key]];
          })));
          return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(resolve, reject);
        }
      };
      return query;
    }
  };
  window.supabase = { createClient: () => db };
})();
