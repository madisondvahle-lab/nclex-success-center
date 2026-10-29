(function () {
  'use strict';
  const db = supabase.createClient('https://pmjwwktwlsqpetwfvolb.supabase.co', 'sb_publishable_MDgerX5UJd44TlYgMOalDw_DqNMvxfT');
  const api = window.CoachingOutcomesData;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const today = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const field = (form, name) => $(form).elements.namedItem(name);
  const values = form => Object.fromEntries(new FormData($(form)));
  const option = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
  let data = null, rows = [], studentId = '', busy = false, dirty = false, reportValid = false;
  const currentRow = () => rows.find(r => r.student.id === studentId);
  const filters = () => ({
    from: $('filter-from').value, to: $('filter-to').value, package: $('filter-package').value,
    exam: $('filter-exam').value, candidate: $('filter-candidate').value
  });
  function say(message, error = false) {
    $('page-status').textContent = message;
    $('page-status').classList.toggle('error', error);
  }
  function invalidate() {
    data = null; rows = [];
    reportValid = false;
    $('metrics').replaceChildren(); $('breakdowns').replaceChildren(); $('population').replaceChildren();
    $('student-editor').classList.add('hidden');
    $('add-tracking').classList.add('hidden');
    $('export-json').disabled = true; $('export-csv').disabled = true;
  }
  async function all(table, columns, key = 'id', constrain = query => query) {
    const result = [];
    for (let offset = 0; ; offset += 500) {
      const { data: page, error } = await constrain(db.from(table).select(columns).order(key)).range(offset, offset + 499);
      if (error) throw new Error(`${table} could not load: ${error.message}. The approved outcomes migration must be installed before using this page.`);
      result.push(...page);
      if (page.length < 500) return result;
    }
  }
  async function load() {
    invalidate();
    const [students, tracking, purchases, sessions, attempts, evidence, intakes, bookings] = await Promise.all([
      all('students', 'id,name,student_type,archived_at,status'),
      all('nclex_coaching_students', '*', 'student_id'),
      all('nclex_coaching_purchases', '*'),
      all('nclex_coaching_sessions', '*'),
      all('nclex_attempts', 'id,student_id,consult_intake_id,attempt_number,test_date,result,exam_type,candidate_type,exam_taken,updated_at'),
      all('nclex_coaching_evidence', '*'),
      all('consult_intakes', 'id,student_id'),
      all('consultations', 'id,student_id,consult_intake_id,consult_type,status,scheduled_start')
    ]);
    const loaded = { students, tracking, purchases, sessions, attempts, evidence, intakes, bookings };
    const built = api.buildRows(loaded, today());
    data = loaded; rows = built;
    const selectedPackage = $('filter-package').value;
    $('filter-package').innerHTML = option('', 'All packages') +
      [...new Set(purchases.map(p => p.package_name))].sort().map(p => option(p, p)).join('');
    if ([...$('filter-package').options].some(o => o.value === selectedPackage)) $('filter-package').value = selectedPackage;
    $('student-picker').innerHTML = option('', 'Choose an existing student') + students.slice().sort((a, b) => a.name.localeCompare(b.name))
      .map(s => option(s.id, `${s.name}${s.archived_at ? ' (archived)' : ''}${tracking.some(t => t.student_id === s.id) ? ' - outcomes record' : ''}`)).join('');
    $('student-picker').value = studentId;
    renderReport();
    renderStudent();
  }
  async function action(work) {
    if (busy) return;
    busy = true;
    const controls = [...$('app').querySelectorAll('button,input,select,textarea')];
    controls.forEach(c => { c.disabled = true; });
    try { await work(); }
    catch (error) {
      console.error('NCLEX coaching outcomes action failed', error);
      say(error.message, true);
    } finally {
      busy = false;
      controls.forEach(c => { c.disabled = false; });
      $('export-json').disabled = !data || !reportValid; $('export-csv').disabled = !data || !reportValid;
    }
  }
  async function persist(operation, success) {
    const { error } = await operation;
    if (error) throw new Error(`Not saved: ${error.message}`);
    dirty = false;
    try { await load(); }
    catch (error) { throw new Error(`The change was saved, but refreshing records failed. Do not duplicate the entry. ${error.message}`); }
    say(success);
  }
  function renderReport() {
    reportValid = false;
    $('export-json').disabled = true; $('export-csv').disabled = true;
    try {
      const selected = api.filterRows(rows, filters());
      const s = api.summarize(selected);
      const cards = [
        ['Eligible paid coaching students (date cohort + untested)', s.eligible],
        ['Eligible tested population (date cohort)', s.tested],
        ['Awaiting examination (outside date cohort)', s.awaiting],
        ['Known outcomes, including student reports', s.known],
        ['Known passes', s.passes], ['Known failures', s.failures],
        ['Unknown / unconfirmed tested outcomes', s.unknown], ['Tested, awaiting result', s.pending],
        ['History / classification needs review', s.review],
        ['Known-outcome pass rate, including student reports', api.percent(s.passRate)],
        ['Documentation-supported / independently checked outcomes', s.documentation],
        ['Independently checked outcomes', s.independentlyChecked],
        ['Outcome verification coverage (all tested)', api.percent(s.verificationCoverage)],
        ['Documentation-supported / checked pass rate', api.percent(s.documentedPassRate)]
      ];
      $('metrics').innerHTML = cards.map(([label, value]) => `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
      const groups = [
        ['First-time candidates', r => r.primary?.candidate_type === 'first_time'],
        ['Repeat candidates', r => r.primary?.candidate_type === 'retaker'],
        ['NCLEX-RN', r => r.primary?.exam_type === 'RN'],
        ['NCLEX-PN', r => r.primary?.exam_type === 'PN']
      ];
      $('breakdowns').innerHTML = `<table><caption>Primary-attempt outcomes by candidate and exam type</caption><thead><tr><th scope="col">Group</th><th scope="col">Tested</th><th scope="col">Passes</th><th scope="col">Failures</th><th scope="col">Unknown / pending result</th><th scope="col">Known-outcome pass rate</th></tr></thead><tbody>${groups.map(([label, predicate]) => {
        const group = api.summarize(selected.filter(predicate));
        return `<tr><th scope="row">${esc(label)}</th><td>${group.tested}</td><td>${group.passes}</td><td>${group.failures}</td><td>${group.unknown + group.pending}</td><td>${api.percent(group.passRate)}</td></tr>`;
      }).join('')}</tbody></table>`;
      function table(list) {
        return list.length ? `<table><thead><tr><th scope="col">Student</th><th scope="col">Package</th><th scope="col">Completed before primary</th><th scope="col">Primary exam</th><th scope="col">Status / verification</th></tr></thead><tbody>${list.map(r => `<tr><td><button type="button" class="secondary" data-student="${esc(r.student.id)}">${esc(r.student.name)}</button></td><td>${r.packages.map(esc).join('<br>')}</td><td>${r.qualifying.length}</td><td>${esc(r.primary?.test_date || 'Not recorded')}<br>${esc(r.primary?.exam_type || r.tracking.planned_exam_type || 'Type not recorded')} / ${esc(r.primary?.candidate_type || r.tracking.planned_candidate_type || 'Candidate not recorded')}</td><td>${esc(api.statuses[r.status])}<br>${esc(api.levels[r.verification.level])}${r.reasons.length ? '<br>' + r.reasons.map(esc).join('<br>') : ''}</td></tr>`).join('')}</tbody></table>` : '<p>No matching students.</p>';
      }
      $('population').innerHTML = '<h3>Tested date cohort</h3>' + table(selected.filter(r => r.tested)) +
        '<h3>Awaiting examination / needs review (outside date cohort)</h3>' + table(selected.filter(r => !r.tested));
      $('population').querySelectorAll('[data-student]').forEach(button => button.addEventListener('click', () => selectStudent(button.dataset.student)));
      $('export-json').disabled = false; $('export-csv').disabled = false;
      reportValid = true;
    } catch (error) {
      $('metrics').replaceChildren(); $('breakdowns').replaceChildren(); $('population').replaceChildren();
      say(error.message, true);
    }
  }
  function fill(form, record) {
    $(form).reset();
    for (const [name, value] of Object.entries(record)) {
      const input = field(form, name);
      if (input) {
        if (input.type === 'checkbox') input.checked = !!value;
        else input.value = value ?? '';
      }
    }
  }
  function resetForms() {
    for (const form of ['purchase-form', 'session-form', 'attempt-form', 'evidence-form']) $(form).reset();
    field('session-form', 'purchase_id').disabled = false;
    $('purchase-form-title').textContent = 'Add purchase';
  }
  function selectStudent(id) {
    if (dirty && !window.confirm('Discard unsaved form changes and open another student?')) {
      $('student-picker').value = studentId; return;
    }
    studentId = id; dirty = false; $('student-picker').value = id;
    renderStudent();
  }
  function renderStudent() {
    resetForms();
    $('audit').replaceChildren();
    const row = currentRow();
    $('student-editor').classList.toggle('hidden', !row);
    $('add-tracking').classList.toggle('hidden', !studentId || !!row || !data);
    if (!row) return;
    $('student-identity').textContent = `${row.student.name} - Existing student ID: ${row.student.id} - Reviewer ID: ${row.tracking.report_id}`;
    fill('tracking-form', row.tracking);
    $('student-workspace').href = `shared-progress.html?student=${encodeURIComponent(studentId)}`;
    $('eligibility-status').textContent = row.eligible ?
      `Eligible: ${row.completions.length} completed, payment-verified NCLEX coaching sessions. ${row.reasons.join(' ')}` :
      'Not yet eligible. Record a verified coaching payment and at least one completed paid NCLEX coaching/tutoring session beyond a Strategy Session.';
    $('purchases').innerHTML = row.purchases.map(p => `<article class="record"><strong>${esc(p.package_name)}</strong> - ${esc(p.purchased_on)} - ${esc(p.payment_status)}<p class="meta">Payment reference: ${esc(p.payment_reference || 'Not recorded')}<br>Verified: ${esc(p.payment_verified_on || 'Not recorded')}</p><button type="button" class="secondary" data-edit-purchase="${esc(p.id)}">Edit purchase</button></article>`).join('') || '<p>No purchases recorded.</p>';
    field('session-form', 'purchase_id').innerHTML = option('', 'Choose purchase') + row.purchases.map(p => option(p.id, `${p.package_name} - ${p.purchased_on}`)).join('');
    const intakeOwner = id => data.intakes.find(i => i.id === id)?.student_id;
    const bookings = data.bookings.filter(b => b.consult_type === 'tutoring_session' && b.status === 'completed' &&
      (b.student_id || intakeOwner(b.consult_intake_id)) === studentId);
    field('session-form', 'consultation_id').innerHTML = option('', 'Historical / manually documented session') +
      bookings.map(b => option(b.id, b.scheduled_start || b.id)).join('');
    const studentSessions = data.sessions.filter(s => row.purchases.some(p => p.id === s.purchase_id));
    $('sessions').innerHTML = studentSessions.map(s => `<article class="record">${esc(s.completed_on)} - ${esc(row.purchases.find(p => p.id === s.purchase_id)?.package_name)} - ${esc(s.status)}<p class="meta">${esc(s.completion_reference)}</p><button type="button" class="secondary" data-edit-session="${esc(s.id)}">Edit session</button></article>`).join('') || '<p>No completed sessions recorded.</p>';
    const attempts = row.attempts.slice().sort((a, b) => a.attempt_number - b.attempt_number);
    $('attempts').innerHTML = attempts.map(a => `<article class="record"><strong>Attempt ${a.attempt_number}${row.primary?.id === a.id ? ' - primary post-coaching attempt' : ''}</strong><p>${esc(a.test_date || 'Unknown date')} / ${esc(a.exam_type || 'RN/PN not recorded')} / ${esc(a.candidate_type || 'Candidate not recorded')} / Recorded result: ${esc(a.result || 'Pending')}</p><p class="meta">${esc(api.levels[api.verification(a, data.evidence).level])}</p><button type="button" class="secondary" data-edit-attempt="${esc(a.id)}">Edit existing attempt</button></article>`).join('') || '<p>No examination attempts recorded. This student remains pending.</p>';
    field('attempt-form', 'attempt_number').value = Math.max(0, ...attempts.map(a => a.attempt_number)) + 1;
    field('evidence-form', 'attempt_id').innerHTML = option('', 'Choose existing attempt') + attempts.map(a => option(a.id, `Attempt ${a.attempt_number} - ${a.test_date || 'date unknown'} - ${a.result || 'pending'}`)).join('');
    field('evidence-form', 'checked_on').value = today();
    const attemptIds = new Set(attempts.map(a => a.id));
    const evidence = data.evidence.filter(e => attemptIds.has(e.attempt_id));
    $('evidence').innerHTML = evidence.map(e => `<article class="record"><strong>${esc(api.methods[e.method])}${e.revoked_at ? ' - REVOKED' : ''}</strong><p>Attempt ${esc(attempts.find(a => a.id === e.attempt_id)?.attempt_number)} - ${esc(e.checked_on)} - checked by ${esc(e.checked_by)}</p><p>${esc(e.source_reference)}<br>${esc(e.licensing_board)} ${esc(e.license_type)}</p><p class="meta">${e.supports_attempt ? 'Recorded as attempt-linked evidence; only current matching date/type/result contributes to verification.' : 'Does not establish this examination attempt.'}</p><p>${esc(e.notes)}</p>${e.storage_path ? `<button type="button" class="secondary" data-open-evidence="${esc(e.id)}">Open private evidence</button><p class="meta">SHA-256: ${esc(e.sha256)}</p>` : ''}${!e.revoked_at ? `<form data-revoke="${esc(e.id)}"><label>Reason for revoking / replacing evidence<input name="reason" required maxlength="1000"></label><button type="submit" class="secondary">Revoke evidence (retain original)</button></form>` : `<p>Revoked: ${esc(e.revoked_at)} - ${esc(e.revocation_reason)}</p>`}</article>`).join('') || '<p>No outcome evidence recorded.</p>';
    $('purchases').querySelectorAll('[data-edit-purchase]').forEach(b => b.addEventListener('click', () => {
      fill('purchase-form', row.purchases.find(p => p.id === b.dataset.editPurchase));
      $('purchase-form-title').textContent = 'Edit purchase'; $('purchase-form').scrollIntoView({ block: 'center' });
    }));
    $('sessions').querySelectorAll('[data-edit-session]').forEach(b => b.addEventListener('click', () => {
      const session = studentSessions.find(s => s.id === b.dataset.editSession);
      if (session.consultation_id && !bookings.some(b => b.id === session.consultation_id)) {
        field('session-form', 'consultation_id').insertAdjacentHTML('beforeend', option(session.consultation_id, 'Previously linked booking (no longer completed/available)'));
      }
      fill('session-form', session); field('session-form', 'purchase_id').disabled = true;
      $('session-form').scrollIntoView({ block: 'center' });
    }));
    $('attempts').querySelectorAll('[data-edit-attempt]').forEach(b => b.addEventListener('click', () => {
      fill('attempt-form', attempts.find(a => a.id === b.dataset.editAttempt));
      $('attempt-form').scrollIntoView({ block: 'center' });
    }));
    $('evidence').querySelectorAll('[data-open-evidence]').forEach(b => b.addEventListener('click', () => action(async () => {
      const e = evidence.find(e => e.id === b.dataset.openEvidence);
      const result = await db.storage.from('nclex-outcome-evidence').createSignedUrl(e.storage_path, 300);
      if (result.error) throw new Error(`Evidence could not open: ${result.error.message}`);
      const link = document.createElement('a');
      link.href = result.data.signedUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click();
      say('Private evidence link opened; it expires in five minutes.');
    })));
    $('evidence').querySelectorAll('[data-revoke]').forEach(form => form.addEventListener('submit', event => {
      event.preventDefault();
      const reason = new FormData(form).get('reason').trim();
      if (!reason) { say('A revocation reason is required.', true); return; }
      action(() => persist(db.from('nclex_coaching_evidence').update({ revoked_at: new Date().toISOString(), revocation_reason: reason })
        .eq('id', form.dataset.revoke).is('revoked_at', null).select('id').single(), 'Evidence revoked. The original remains in private storage and audit history.'));
    }));
  }
  function upsertVersioned(table, patch, original) {
    return original ? db.from(table).update(patch).eq('id', original.id).eq('updated_at', original.updated_at).select('id').single() :
      db.from(table).insert(patch).select('id').single();
  }
  async function attachEvidence(v, file) {
    const attempt = currentRow().attempts.find(a => a.id === v.attempt_id);
    if (!attempt) throw new Error('Choose an existing examination attempt.');
    const supports = v.supports_attempt === 'on';
    if (supports && (!api.date(attempt.test_date) || !attempt.exam_type ||
      !['pass', 'fail'].includes(attempt.result) || v.observed_result !== attempt.result)) {
      throw new Error('Attempt-linked evidence must match the saved examination date, RN/PN type and passed/failed result. Save or correct the attempt first.');
    }
    const patch = {
      attempt_id: attempt.id, method: v.method, observed_result: v.observed_result || null,
      exam_date: attempt.test_date, exam_type: attempt.exam_type, supports_attempt: supports,
      identity_checked: v.identity_checked === 'on', checked_on: v.checked_on,
      source_reference: v.source_reference.trim(), licensing_board: v.licensing_board.trim(),
      license_type: v.license_type.trim(), notes: v.notes.trim()
    };
    let path = null;
    if (file?.size) {
      if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10485760) {
        throw new Error('Evidence must be a nonempty PDF, PNG, JPEG or WebP of at most 10 MB.');
      }
      const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      path = `${attempt.id}/${crypto.randomUUID()}`;
      const uploaded = await db.storage.from('nclex-outcome-evidence').upload(path, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw new Error(`Evidence upload failed: ${uploaded.error.message}`);
      Object.assign(patch, { storage_path: path, file_name: file.name, mime_type: file.type, byte_size: file.size,
        sha256: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('') });
    } else if (file?.name) throw new Error('The selected evidence file is empty.');
    const saved = await db.from('nclex_coaching_evidence').insert(patch).select('id').single();
    if (saved.error) {
      if (path) {
        const cleanup = await db.storage.from('nclex-outcome-evidence').remove([path]);
        if (cleanup.error) throw new Error(`Evidence metadata failed: ${saved.error.message}. Private upload cleanup also failed: ${cleanup.error.message}. Administrator must inspect storage path ${path}; do not duplicate the upload.`);
      }
      throw new Error(`Evidence not saved: ${saved.error.message}${path ? '. Unattached upload removed.' : ''}`);
    }
    dirty = false;
    try { await load(); }
    catch (error) { throw new Error(`Evidence saved, but refresh failed; do not upload again. ${error.message}`); }
    say('Evidence recorded. Its category and attempt association determine the verification level.');
  }
  function download(format) {
    if (!data || !reportValid) throw new Error('Load a valid report before exporting.');
    const report = api.reviewerReport(rows, filters(), today());
    const content = format === 'csv' ? api.csv(report) : JSON.stringify(report, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `nclex-coaching-review-${today()}.${format}`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say('De-identified reviewer report exported. Keep it private; exact dates may permit identification.');
  }
  async function init() {
    const session = await db.auth.getSession();
    if (session.error) throw new Error(`Sign-in could not be checked: ${session.error.message}`);
    if (!session.data.session) { location.replace('student-login.html'); return; }
    const admin = await db.from('app_admins').select('user_id').eq('user_id', session.data.session.user.id).maybeSingle();
    if (admin.error) throw new Error(`Administrator access could not be checked: ${admin.error.message}`);
    if (!admin.data) { location.replace('student-login.html'); return; }
    $('loading').classList.add('hidden'); $('app').classList.remove('hidden');
    $('rules').innerHTML = api.rules.map(rule => `<li>${esc(rule)}</li>`).join('');
    $('sign-out').addEventListener('click', () => action(async () => {
      const result = await db.auth.signOut();
      if (result.error) throw new Error(`Sign out failed: ${result.error.message}`);
      location.replace('student-login.html');
    }));
    $('reload').addEventListener('click', () => {
      if (dirty && !window.confirm('Discard unsaved form changes and reload?')) return;
      action(async () => { await load(); dirty = false; say('Records reloaded.'); });
    });
    for (const id of ['filter-from', 'filter-to', 'filter-package', 'filter-exam', 'filter-candidate']) {
      $(id).addEventListener('change', () => { if (data) renderReport(); });
    }
    $('export-json').addEventListener('click', () => action(async () => download('json')));
    $('export-csv').addEventListener('click', () => action(async () => download('csv')));
    $('student-picker').addEventListener('change', event => selectStudent(event.target.value));
    $('student-editor').addEventListener('input', () => { dirty = true; });
    document.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', () => {
      $(b.dataset.reset).reset();
      if (b.dataset.reset === 'session-form') field('session-form', 'purchase_id').disabled = false;
      if (b.dataset.reset === 'purchase-form') $('purchase-form-title').textContent = 'Add purchase';
    }));
    $('add-tracking').addEventListener('click', () => action(() => persist(
      db.from('nclex_coaching_students').insert({ student_id: studentId }).select('student_id').single(),
      'Outcomes record added for the existing student. No student account was created or changed.')));
    $('tracking-form').addEventListener('submit', event => {
      event.preventDefault();
      const v = values('tracking-form'), row = currentRow();
      action(() => persist(db.from('nclex_coaching_students').update({
        history_reviewed: v.history_reviewed === 'on', notes: v.notes.trim(),
        planned_exam_type: v.planned_exam_type || null, planned_candidate_type: v.planned_candidate_type || null
      }).eq('student_id', studentId).eq('updated_at', row.tracking.updated_at).select('student_id').single(), 'History review and notes saved.'));
    });
    $('purchase-form').addEventListener('submit', event => {
      event.preventDefault();
      const v = values('purchase-form'), original = currentRow().purchases.find(p => p.id === v.id);
      action(() => persist(upsertVersioned('nclex_coaching_purchases', {
        student_id: studentId, package_name: v.package_name.trim(), purchased_on: v.purchased_on,
        payment_status: v.payment_status, payment_reference: v.payment_reference.trim(),
        payment_verified_on: v.payment_verified_on || null, notes: v.notes.trim()
      }, original), 'Coaching purchase saved.'));
    });
    $('session-form').addEventListener('submit', event => {
      event.preventDefault();
      const v = values('session-form'), original = data.sessions.find(s => s.id === v.id);
      action(() => persist(upsertVersioned('nclex_coaching_sessions', {
        purchase_id: original?.purchase_id || v.purchase_id, consultation_id: v.consultation_id || null,
        completed_on: v.completed_on, completion_reference: v.completion_reference.trim(),
        status: v.status, notes: v.notes.trim()
      }, original), 'Completed coaching session saved.'));
    });
    $('attempt-form').addEventListener('submit', event => {
      event.preventDefault();
      const v = values('attempt-form'), original = currentRow().attempts.find(a => a.id === v.id);
      action(() => persist(db.rpc('save_coaching_nclex_attempt', {
        p_student: studentId, p_id: v.id || null, p_expected: original?.updated_at || null,
        p_number: Number(v.attempt_number), p_date: v.test_date || null, p_result: v.result || null,
        p_exam: v.exam_type, p_candidate: v.candidate_type, p_taken: v.exam_taken === 'on'
      }), 'Examination attempt saved. Add or review supporting evidence; prior evidence must still match its date, type and result.'));
    });
    $('evidence-form').addEventListener('submit', event => {
      event.preventDefault();
      const v = values('evidence-form'), file = field('evidence-form', 'file').files[0];
      action(() => attachEvidence(v, file));
    });
    $('load-audit').addEventListener('click', () => action(async () => {
      const row = currentRow();
      const ids = [studentId, ...row.purchases.map(p => p.id),
        ...data.sessions.filter(s => row.purchases.some(p => p.id === s.purchase_id)).map(s => s.id),
        ...row.attempts.map(a => a.id), ...data.evidence.filter(e => row.attempts.some(a => a.id === e.attempt_id)).map(e => e.id)];
      const intakeIds = data.intakes.filter(i => i.student_id === studentId).map(i => i.id);
      const clauses = [`record_id.in.(${ids.join(',')})`, `before_data->>student_id.eq.${studentId}`, `after_data->>student_id.eq.${studentId}`];
      if (intakeIds.length) clauses.push(`before_data->>consult_intake_id.in.(${intakeIds.join(',')})`, `after_data->>consult_intake_id.in.(${intakeIds.join(',')})`);
      const audit = await all('nclex_coaching_audit', '*', 'id', query => query.or(clauses.join(',')));
      $('audit').innerHTML = audit.sort((a, b) => b.changed_at.localeCompare(a.changed_at)).map(a =>
        `<details class="record"><summary>${esc(a.changed_at)} - ${esc(a.table_name)} - ${esc(a.operation)} - ${esc(a.changed_by || 'system')}</summary><pre>${esc(JSON.stringify({ before: a.before_data, after: a.after_data }, null, 2))}</pre></details>`).join('') || '<p>No audit events recorded since the outcomes migration.</p>';
      say('Private audit history loaded.');
    }));
    await action(async () => { await load(); say('Records loaded. No automated messages are enabled.'); });
  }
  init().catch(error => {
    console.error('Coaching outcomes initialization failed', error);
    $('loading').textContent = error.message + ' Reload to retry.';
  });
})();
