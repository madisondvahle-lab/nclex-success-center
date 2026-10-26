(function () {
  'use strict';
  const bucket = 'assessment-reports';
  const types = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  function details(values) {
    const count = String(values.question_count ?? '').trim();
    if (count && (!/^\d+$/.test(count) || !Number.isSafeInteger(Number(count)) || Number(count) <= 0)) {
      throw new Error('Number of questions must be a positive whole number, or left blank.');
    }
    const date = values.test_date || null;
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('Enter a valid exam date, or leave it blank.');
    const notes = String(values.notes ?? '').trim();
    if (notes.length > 2000) throw new Error('Report notes must be 2,000 characters or fewer.');
    return { test_date: date, question_count: count ? Number(count) : null, notes: notes || null };
  }
  function checkFile(file) {
    if (!types.has(file.type)) throw new Error(`${file.name}: choose a PDF, PNG, JPEG, or WebP file.`);
    if (!file.size || file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: file must be nonempty and no larger than 20 MB.`);
  }
  async function attach(db, intakeId, attemptId, file) {
    checkFile(file);
    const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `consults/${intakeId}/${crypto.randomUUID()}-${name}`;
    const upload = await db.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) throw new Error(`${file.name} could not be uploaded: ${upload.error.message}`);
    const saved = await db.from('consult_intake_files').insert({
      consult_intake_id: intakeId, attempt_id: attemptId, category: 'CPR report',
      storage_path: path, file_name: file.name, mime_type: file.type
    });
    if (saved.error) {
      const cleanup = await db.storage.from(bucket).remove([path]);
      throw new Error(`${file.name} metadata could not be saved: ${saved.error.message}. ${cleanup.error
        ? `Private upload cleanup also failed: ${cleanup.error.message}. Contact the administrator; storage path: ${path}`
        : 'The unattached upload was removed; you can retry.'}`);
    }
  }
  function mount(root, db, intakeId) {
    if (!intakeId) {
      root.innerHTML = '<p class="meta">This booking has no linked consultation intake. Link the correct prospect profile before adding CPR reports; do not create a duplicate profile.</p>';
      return;
    }
    let attempts = [], files = [], busy = false;
    const drafts = new Map();
    const status = document.createElement('p');
    status.className = 'meta save'; status.setAttribute('role', 'status');
    const body = document.createElement('div');
    root.replaceChildren(status, body);
    function say(message, error = false) {
      status.textContent = message;
      status.classList.toggle('err', error);
    }
    async function action(work) {
      if (busy) return;
      busy = true;
      const controls = [...body.querySelectorAll('button,input,textarea,select')];
      controls.forEach(control => { control.disabled = true; });
      try { await work(); }
      catch (error) { say(error.message, true); }
      finally { busy = false; controls.forEach(control => { control.disabled = false; }); }
    }
    const fields = attempt => `<div class="grid"><label>Exam date<input name="test_date" type="date" value="${esc(attempt.test_date)}"></label><label>Number of questions<input name="question_count" type="number" min="1" step="1" value="${esc(attempt.question_count)}"></label></div><label>Notes about this CPR report<textarea name="notes" maxlength="2000">${esc(attempt.notes)}</textarea></label>`;
    const fileRow = file => `<p class="meta">${esc(file.file_name)} <button type="button" class="secondary" data-open-report="${esc(file.id)}">Open private report</button></p>`;
    function render() {
      body.innerHTML = `<p class="meta">One record per NCLEX attempt. Notes and question counts are shared with the existing CPR tracker, not copied into session notes. Files remain private. Save details first, then attach the report or its pages.</p>
        <p><a class="button secondary" href="madison-cpr.html?person=${encodeURIComponent(intakeId)}">Open CPR tracker / category ratings</a></p>
        ${attempts.map(attempt => `<article class="panel"><h3>CPR / attempt ${esc(attempt.attempt_number)}</h3>
          <form data-report-details="${esc(attempt.id)}">${fields({ ...attempt, ...drafts.get(attempt.id) })}<button type="submit">Save report details</button></form>
          <div>${files.filter(file => file.attempt_id === attempt.id).map(fileRow).join('') || '<p class="meta">No report file attached yet.</p>'}</div>
          <form data-report-upload="${esc(attempt.id)}"><label>Attach report file(s)<input name="reports" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" required></label><button type="submit" class="secondary">Upload to this CPR</button></form></article>`).join('')}
        <details><summary>Add another CPR / NCLEX attempt</summary><form data-new-report>${fields(drafts.get('new') || {})}<button type="submit">Add CPR record</button></form></details>
        ${files.some(file => !file.attempt_id) ? `<section class="panel"><h3>Previously uploaded CPR files not yet linked to an attempt</h3><p class="meta">Existing uploads are unchanged. Choose the matching attempt to link each file.</p>
          ${files.filter(file => !file.attempt_id).map(file => `<div>${fileRow(file)}<form data-link-report="${esc(file.id)}"><label>Matching attempt<select name="attempt_id" required><option value="">Choose an attempt</option>${attempts.map(attempt => `<option value="${esc(attempt.id)}">Attempt ${esc(attempt.attempt_number)}${attempt.test_date ? ' - ' + esc(attempt.test_date) : ''}</option>`).join('')}</select></label><button type="submit" class="secondary">Link existing report</button></form></div>`).join('')}</section>` : ''}`;
      body.querySelectorAll('[data-report-details],[data-new-report]').forEach(form => form.addEventListener('input', () => {
        drafts.set(form.dataset.reportDetails || 'new', Object.fromEntries(new FormData(form)));
        say('Report details have unsaved changes. Use Save report details (or Add CPR record) to keep them.');
      }));
      body.querySelectorAll('[data-report-details]').forEach(form => form.addEventListener('submit', event => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form));
        action(async () => {
          const patch = details(values);
          const result = await db.from('nclex_attempts').update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', form.dataset.reportDetails).eq('consult_intake_id', intakeId).select('id').single();
          if (result.error) throw new Error(`Report details could not be saved: ${result.error.message}`);
          drafts.delete(form.dataset.reportDetails);
          await load('Report details saved.');
        });
      }));
      body.querySelector('[data-new-report]').addEventListener('submit', event => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(event.currentTarget));
        action(async () => {
          const patch = details(values);
          const next = attempts.reduce((number, attempt) => Math.max(number, attempt.attempt_number), 0) + 1;
          const result = await db.from('nclex_attempts').insert({
            ...patch, consult_intake_id: intakeId, attempt_number: next, cpr_available: true
          }).select('id').single();
          if (result.error) throw new Error(`CPR record could not be added: ${result.error.message}. If another tab added an attempt, reload the consultation before retrying.`);
          drafts.delete('new');
          await load('CPR record added. Attach its report file below.');
        });
      });
      body.querySelectorAll('[data-report-upload]').forEach(form => form.addEventListener('submit', event => {
        event.preventDefault();
        const input = form.elements.namedItem('reports'), selected = [...input.files];
        action(async () => {
          if (!selected.length) throw new Error('Choose at least one report file.');
          selected.forEach(checkFile);
          let completed = 0;
          for (const file of selected) {
            try { await attach(db, intakeId, form.dataset.reportUpload, file); completed++; }
            catch (error) {
              input.value = '';
              await load();
              throw new Error(`${completed} file(s) saved before the upload stopped. ${error.message} Choose only the files that still need uploading.`);
            }
          }
          await load(`Uploaded ${completed} private report file(s).`);
        });
      }));
      body.querySelectorAll('[data-open-report]').forEach(button => button.addEventListener('click', () => action(async () => {
        const file = files.find(item => item.id === button.dataset.openReport);
        const result = await db.storage.from(bucket).createSignedUrl(file.storage_path, 600);
        if (result.error) throw new Error(`Private report could not be opened: ${result.error.message}`);
        const link = document.createElement('a');
        link.href = result.data.signedUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
        document.body.appendChild(link); link.click(); link.remove();
        say('Opened a private report link valid for 10 minutes.');
      })));
      body.querySelectorAll('[data-link-report]').forEach(form => form.addEventListener('submit', event => {
        event.preventDefault();
        const attemptId = new FormData(form).get('attempt_id');
        action(async () => {
          if (!attempts.some(attempt => attempt.id === attemptId)) throw new Error('Choose the matching attempt.');
          const result = await db.from('consult_intake_files').update({ attempt_id: attemptId })
            .eq('id', form.dataset.linkReport).eq('consult_intake_id', intakeId).is('attempt_id', null).select('id').single();
          if (result.error) throw new Error(`Existing report could not be linked: ${result.error.message}`);
          await load('Existing report linked; its file was not moved.');
        });
      }));
    }
    async function load(message = '') {
      const result = await db.from('consult_intake_files')
        .select('id,consult_intake_id,attempt_id,category,storage_path,file_name,mime_type,created_at')
        .eq('consult_intake_id', intakeId).order('created_at');
      if (result.error) return loadError(`CPR files could not load. Verify the consult CPR file migration is installed. ${result.error.message}`);
      const history = await db.from('nclex_attempts').select('id,attempt_number,test_date,question_count,notes')
        .eq('consult_intake_id', intakeId).order('attempt_number');
      if (history.error) return loadError(`CPR attempts could not load: ${history.error.message}`);
      files = result.data.filter(file => file.attempt_id || /cpr|candidate performance report/i.test(file.category));
      attempts = history.data;
      render(); say(message);
    }
    function loadError(message) {
      body.innerHTML = '<p class="meta">Reload the report list before making more changes. Any completed saves remain saved; do not repeat an upload or add operation.</p><button type="button" class="secondary">Reload CPR reports</button>';
      body.querySelector('button').addEventListener('click', () => action(() => load()));
      throw new Error(message);
    }
    say('Loading private CPR reports...');
    load().catch(error => { say(error.message, true); });
  }
  window.ConsultCPRReports = { mount, details, checkFile, attach };
})();
