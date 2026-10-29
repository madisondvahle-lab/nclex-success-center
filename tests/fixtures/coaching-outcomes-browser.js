(function () {
  const student = '00000000-0000-4000-8000-000000000001';
  const purchase = '00000000-0000-4000-8000-000000000002';
  const attempt = '00000000-0000-4000-8000-000000000003';
  const admin = '00000000-0000-4000-8000-000000000099';
  const timestamp = '2026-10-28T12:00:00Z';
  const tables = {
    app_admins: [{ user_id: admin }],
    students: [
      { id: student, name: 'Synthetic outcome student', student_type: 'nclex', archived_at: timestamp, status: 'completed' },
      { id: '00000000-0000-4000-8000-000000000010', name: 'Synthetic historical student', student_type: 'nclex', status: 'active' }
    ],
    nclex_coaching_students: [{ student_id: student, report_id: 'reviewer-id-1', history_reviewed: true, notes: '', updated_at: timestamp }],
    nclex_coaching_purchases: [{ id: purchase, student_id: student, package_name: 'NCLEX coaching', purchased_on: '2026-09-01',
      payment_status: 'verified', payment_verified_on: '2026-09-01', payment_reference: 'Synthetic private receipt', updated_at: timestamp }],
    nclex_coaching_sessions: [{ id: '00000000-0000-4000-8000-000000000004', purchase_id: purchase, completed_on: '2026-09-02',
      status: 'completed', completion_reference: 'Synthetic attendance', updated_at: timestamp }],
    nclex_attempts: [{ id: attempt, student_id: student, attempt_number: 1, test_date: '2026-10-01', result: 'pass',
      exam_type: 'RN', candidate_type: 'first_time', exam_taken: true, updated_at: timestamp }],
    nclex_coaching_evidence: [{ id: '00000000-0000-4000-8000-000000000005', attempt_id: attempt, method: 'student_report',
      supports_attempt: true, observed_result: 'pass', exam_date: '2026-10-01', exam_type: 'RN', checked_on: '2026-10-02',
      source_reference: 'Synthetic private student statement', checked_by: admin }],
    consult_intakes: [], consultations: [], nclex_coaching_audit: []
  };
  window.__coaching = { tables, writes: [], failSource: '', files: [] };
  function from(table) {
    let mode = 'select', patch, tests = [], start = 0, end = Infinity, one = false, ordering = '';
    const query = {
      select() { return query; },
      order(key) { ordering = key; return query; },
      range(a, b) { start = a; end = b; return query; },
      eq(key, value) { tests.push(row => row[key] === value); return query; },
      is(key, value) { tests.push(row => (row[key] ?? null) === value); return query; },
      or() { return query; },
      insert(value) { mode = 'insert'; patch = value; return query; },
      update(value) { mode = 'update'; patch = value; return query; },
      single() { one = true; return query; },
      maybeSingle() { one = true; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (window.__coaching.failSource === table) return { data: null, error: { message: 'Synthetic load failure' } };
          let selected = tables[table].filter(row => tests.every(check => check(row)));
          if (mode === 'insert') {
            const row = { id: crypto.randomUUID(), updated_at: new Date().toISOString(), ...patch };
            if (table === 'nclex_coaching_students') Object.assign(row, { report_id: crypto.randomUUID(), history_reviewed: false });
            if (table === 'nclex_coaching_evidence') Object.assign(row, { checked_by: admin, created_at: new Date().toISOString() });
            tables[table].push(row); selected = [row];
          }
          if (mode === 'update') selected.forEach(row => Object.assign(row, patch, { updated_at: new Date().toISOString() }));
          if (mode !== 'select') window.__coaching.writes.push({ table, mode, patch });
          if (ordering) selected.sort((a, b) => String(a[ordering]).localeCompare(String(b[ordering])));
          const result = JSON.parse(JSON.stringify(selected.slice(start, end + 1)));
          return { data: one ? result[0] || null : result, error: null };
        }).then(resolve, reject);
      }
    };
    return query;
  }
  window.supabase = { createClient: () => ({
    from,
    auth: { getSession: async () => ({ data: { session: { user: { id: admin } } }, error: null }), signOut: async () => ({ error: null }) },
    storage: { from: () => ({
      upload: async (path, file, options) => { window.__coaching.files.push({ path, name: file.name, options }); return { error: null }; },
      remove: async () => ({ error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: 'about:blank' }, error: null })
    }) },
    rpc: async (name, args) => {
      window.__coaching.writes.push({ rpc: name, args });
      if (name !== 'save_coaching_nclex_attempt') throw new Error('Unexpected RPC');
      const patch = {
        student_id: args.p_student, attempt_number: args.p_number, test_date: args.p_date, result: args.p_result,
        exam_type: args.p_exam, candidate_type: args.p_candidate, exam_taken: args.p_taken, updated_at: new Date().toISOString()
      };
      if (args.p_id) Object.assign(tables.nclex_attempts.find(a => a.id === args.p_id), patch);
      else tables.nclex_attempts.push({ id: crypto.randomUUID(), ...patch });
      return { data: args.p_id || tables.nclex_attempts.at(-1).id, error: null };
    }
  }) };
})();
