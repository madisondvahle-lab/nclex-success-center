// Synthetic browser fixture only. No requests or writes to Supabase.
(function () {
  const tabs = [
    { id: 'notes', label: "Nurses' Notes", columns: ['Finding'], entries: [
      { at: '2026-10-26T10:00', fromItem: 3, cells: [{ t: 'Future synthetic finding' }] },
      { at: '2026-10-26T08:00', cells: [{ id: 'finding', t: 'Initial synthetic finding' }] }
    ] },
    ...['Vital Signs', 'Laboratory Results', 'Medication Administration Record'].map((label, i) => ({
      id: 'tab-' + i, label, fromItem: i + 1, columns: ['Value'],
      entries: [{ at: '2026-10-26T08:00', cells: [{ t: 'Synthetic value ' + i }] }]
    }))
  ];
  const item = (id, type, data) => ({
    id, type, schemaVersion: 1, scoringVersion: 'ngn-v1', textFormat: 'plain',
    stem: 'Synthetic prompt ' + type, rationale: 'Synthetic rationale ' + type, ...data
  });
  const items = [
    item('child-1', 'mcq', { options: ['A', 'B', 'C', 'D'], correct: [0] }),
    item('child-2', 'sata', { options: ['A', 'B', 'C', 'D'], correct: [0, 1] }),
    item('child-3', 'matrix', { rows: ['R1', 'R2'], cols: ['C1', 'C2'], correct: ['0:0', '1:1'], responseMode: 'single' }),
    item('child-4', 'cloze', { template: '{{0}} then {{1}}', dropdowns: [{ options: ['A', 'B'], correct: 0 }, { options: ['A', 'B'], correct: 1 }] }),
    item('child-5', 'highlight', { chartSelections: true, segments: [{ id: 'finding', t: 'Initial synthetic finding', correct: true }] }),
    item('child-6', 'bowtie', { bowtie: { actions: ['A', 'B', 'C'], conditions: ['A', 'B'], complications: ['A', 'B', 'C'] }, correct: { actions: [0, 1], condition: 0, complications: [0, 1] } })
  ];
  const row = (id, type, data) => ({
    id, active: true, item_type: type, stem: 'Synthetic ' + id, item_data: data,
    rationale: data.rationale || '', option_a: 'A', option_b: 'B', option_c: 'C', option_d: 'D', correct_answer: 'a',
    nclex_category: 'Management of Care', topic: 'Synthetic testing'
  });
  const questions = [
    row('synthetic-case', 'case', { id: 'authored-case', kind: 'case', schemaVersion: 1, textFormat: 'plain',
      title: 'Synthetic six-item case', scenario: 'Synthetic patient record', tabs, items }),
    row('synthetic-mcq', 'mcq', { ...items[0], tabs: tabs.map(tab => ({ ...tab, fromItem: 1, entries: tab.entries.filter(e => !e.fromItem) })) }),
    row('synthetic-fill', 'fill', item('fill', 'fill', { correct: 5, tabs: [] }))
  ];
  const initial = { questions, students: [{ id: 'synthetic-student', name: 'Synthetic Student', email: 'synthetic@example.test', auth_user_id: 'synthetic-user', student_type: 'nclex' }],
    app_admins: [], modules: [], student_resources: [], student_class_schedules: [], student_supplemental_practice_results: [] };
  const load = () => JSON.parse(localStorage.getItem('ngn-browser-fixture') || JSON.stringify(initial));
  const save = data => localStorage.setItem('ngn-browser-fixture', JSON.stringify(data));
  window.syntheticDB = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'synthetic-user' } } }, error: null }), signOut: async () => ({ error: null }) },
    from(table) {
      const filters = [];
      let single = false, insert;
      const query = {
        select() { return query; }, order() { return query; }, range() { return query; }, limit() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        like(key, value) { filters.push(row => String(row[key] || '').startsWith(value.replace(/%$/, ''))); return query; },
        is(key, value) { filters.push(row => row[key] == value); return query; },
        maybeSingle() { single = true; return query; }, single() { single = true; return query; },
        insert(value) { insert = value; return query; },
        then(resolve) {
          const data = load();
          let rows = data[table] || [];
          if (table === 'app_admins' && localStorage.getItem('ngn-browser-role') === 'admin') rows = [{ user_id: 'synthetic-user' }];
          if (insert) {
            if (localStorage.getItem('ngn-browser-fail-save') === 'true') {
              localStorage.removeItem('ngn-browser-fail-save');
              return Promise.resolve({ data: null, error: { message: 'Synthetic retryable save failure' } }).then(resolve);
            }
            const record = { id: crypto.randomUUID(), completed_at: null, ...insert };
            if (rows.some(row => row.id === record.id)) return Promise.resolve({ data: null, error: { code: '23505' } }).then(resolve);
            if (table === 'student_supplemental_practice_results') record.completed_at = new Date().toISOString();
            rows.push(record);data[table] = rows;save(data);
          }
          rows = rows.filter(row => filters.every(filter => filter(row)));
          return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(resolve);
        }
      };
      return query;
    },
    async rpc(name, args) {
      if (name === 'set_weekly_assignment_complete') {
        if (localStorage.getItem('ngn-browser-fail-completion') === 'true') {
          localStorage.removeItem('ngn-browser-fail-completion');
          return { error: { message: 'Synthetic completion failure' } };
        }
        const data = load();
        const resource = data.student_resources.find(row => row.id === args.p_assignment);
        if (!resource || resource.student_id !== 'synthetic-student') return { error: { message: 'Assignment not found or access denied' } };
        resource.completed_at = new Date().toISOString();save(data);
        return { data: resource.completed_at, error: null };
      }
      return { data: [], error: null };
    }
  };
})();
