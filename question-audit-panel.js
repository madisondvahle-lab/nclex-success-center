// Automated quality-audit panel for question-bank-review.html.
// Reuses the page's correction-draft workflow; it only proposes drafts and never applies or publishes.
(function () {
  const CORE_URL = './supabase/functions/_shared/question-audit-core.mjs';
  const STATUS_LABEL = { pass: 'Pass', auto_fix: 'Auto-fix', revised: 'Revised', quarantine: 'Quarantine', released: 'Released', error: 'Error' };
  const STATUS_CLASS = { pass: 'good', auto_fix: 'good', revised: 'warn', quarantine: 'bad', released: '', error: 'bad' };
  const MAX_BATCH = 25;
  let ctx, core, audits = [], latest = new Map(), batch = [], processed = new Map();
  let running = false, pauseRequested = false, sessionCost = 0, approveSel = new Set(), root;
  const $ = id => document.getElementById(id);

  const style = document.createElement('style');
  style.textContent = '.tag.bad{background:#f8e3e6;color:#8d2f3d}.qa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:0 0 14px}.qa-row{display:flex;gap:10px;align-items:flex-start}.qa-row input[type=checkbox]{margin-top:4px}.qa-detail{font-size:.8rem;color:var(--admin-muted);margin:6px 0 0}.qa-detail li{margin:2px 0}';
  document.head.appendChild(style);

  const money = value => `$${(Number(value) || 0).toFixed(value >= 1 ? 2 : 3)}`;
  const esc = value => ctx.esc(value);

  function flagInfo(questionId) {
    const rows = ctx.getFlags().filter(flag => flag.question_id === questionId);
    return { open: rows.filter(flag => flag.status === 'open').length, any: rows.length };
  }
  const openDraftIds = () => new Set(ctx.getDrafts().filter(draft => ['pending_review', 'approved'].includes(draft.status)).map(draft => draft.question_id));
  const isQuarantined = audit => audit && audit.audit_status === 'quarantine' && !audit.released_at;

  function candidateList(source, size) {
    const skip = openDraftIds();
    const out = [];
    ctx.getLive().forEach(question => {
      if (!['mcq', 'sata'].includes(question.item_type || 'mcq') || skip.has(question.id)) return;
      const previous = latest.get(question.id);
      if (isQuarantined(previous)) return;
      const content = core.snapshotContent(question);
      if (previous && previous.audit_status !== 'error' && previous.content_hash === core.contentHash(content) && previous.criteria_version === core.AUDIT_CRITERIA_VERSION) return;
      const flags = flagInfo(question.id);
      const screen = core.screenDeterministic(content);
      const structural = core.validateContent(content).filter(issue => issue.severity === 'error').length;
      const rank = core.prioritize({ question, openFlags: flags.open, anyFlags: flags.any, score: screen.score, structuralErrors: structural });
      if (source === 'flagged_risk' && rank.priority > 3) return;
      if (source === 'unaudited' && rank.priority !== 4) return;
      if (source === 'inactive' && rank.priority !== 5) return;
      out.push({ question, ...rank, score: screen.score, structural });
    });
    out.sort((a, b) => a.priority - b.priority || b.structural - a.structural || b.score - a.score);
    return out.slice(0, size);
  }

  function counts() {
    const by = {};
    latest.forEach(audit => { by[audit.audit_status] = (by[audit.audit_status] || 0) + 1; });
    const spend = audits.reduce((sum, audit) => sum + Number(audit.est_cost_usd || 0), 0);
    const tokens = audits.reduce((sum, audit) => sum + (audit.input_tokens || 0) + (audit.output_tokens || 0), 0);
    return { by, spend, tokens, audited: [...latest.values()].filter(audit => audit.audit_status !== 'error').length };
  }

  function renderSummary() {
    const { by, spend, tokens, audited } = counts();
    const cards = [
      ['Audited', audited], ['Passed', by.pass || 0], ['Auto-fix drafts', by.auto_fix || 0], ['Revised (drafts)', by.revised || 0],
      ['Quarantined', by.quarantine || 0], ['Errors (retryable)', by.error || 0], ['Est. AI cost', money(spend)],
      ['Avg per audit', audited ? money(spend / audited) : '—'],
    ];
    $('qa-summary').innerHTML = cards.map(([label, value]) => `<article class="stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></article>`).join('');
    $('qa-usage').textContent = `${tokens.toLocaleString()} tokens used across ${audits.length} audit record${audits.length === 1 ? '' : 's'}. Costs are estimates from published model prices.`;
  }

  function renderBatch() {
    const list = $('qa-batch-list');
    if (!batch.length) { list.innerHTML = '<p class="empty">No batch built yet. Choose a source and build a batch.</p>'; $('qa-run').disabled = true; return; }
    list.innerHTML = batch.map(item => {
      const state = processed.get(item.question.id);
      const flagged = flagInfo(item.question.id);
      return `<label class="qa-row"><input type="checkbox" data-qa-pick="${esc(item.question.id)}" ${item.picked !== false ? 'checked' : ''} ${state ? 'disabled' : ''}><span><strong>${esc(ctx.qlabel(item.question))}</strong> · ${esc(item.question.topic || 'Uncategorized')} <span class="tag ${item.priority === 1 ? 'warn' : ''}">P${item.priority}</span> <span class="tag">${item.question.active ? 'Published' : 'Inactive'}</span>${flagged.any ? '<span class="tag warn">Flagged</span>' : ''}<br><span class="count">${esc(item.reason)}${item.structural ? ' · scoring/structure problem' : ''} · ${item.score} quality signal${item.score === 1 ? '' : 's'}</span>${state ? `<br><strong>${esc(state)}</strong>` : ''}</span></label>`;
    }).join('');
    list.querySelectorAll('[data-qa-pick]').forEach(box => box.addEventListener('change', () => {
      const item = batch.find(entry => entry.question.id === box.dataset.qaPick); if (item) item.picked = box.checked; updateRunButton();
    }));
    updateRunButton();
  }
  const pending = () => batch.filter(item => item.picked !== false && !processed.has(item.question.id));
  function updateRunButton() {
    const n = pending().length;
    $('qa-run').disabled = running || !n;
    $('qa-run').textContent = processed.size ? `Resume audit (${n} remaining)` : `Run audit on ${n} selected`;
    $('qa-pause').disabled = !running;
  }

  async function reloadAudits() {
    const rows = [];
    for (let start = 0; ; start += 500) {
      const result = await ctx.db.from('question_audits').select('*').order('audited_at', { ascending: false }).range(start, start + 499);
      if (result.error) throw result.error;
      rows.push(...(result.data || []));
      if ((result.data || []).length < 500) break;
    }
    audits = rows;
    latest = new Map();
    rows.forEach(row => { if (!latest.has(row.question_id)) latest.set(row.question_id, row); });
  }

  async function auditOne(item) {
    const result = await ctx.db.functions.invoke('question-audit', { body: { question_id: item.question.id, max_cost_usd: 0.25, priority: item.priority, priority_reason: item.reason } });
    if (result.error) {
      let message = result.error.message;
      try { const body = await result.error.context.json(); message = body.error || message; } catch (_) { /* keep generic message */ }
      throw new Error(message);
    }
    return result.data;
  }

  async function runBatch() {
    if (running) return;
    const cap = Math.max(0.1, Math.min(5, Number($('qa-cap').value) || 2));
    running = true; pauseRequested = false; updateRunButton();
    const status = $('qa-progress');
    const queue = pending();
    let done = 0;
    for (const item of queue) {
      if (pauseRequested) break;
      if (sessionCost >= cap) { status.textContent = `Spending cap of ${money(cap)} reached after ${done} audit${done === 1 ? '' : 's'}. Raise the cap to continue.`; break; }
      status.textContent = `Auditing ${ctx.qlabel(item.question)} (${done + 1} of ${queue.length}) · spent ${money(sessionCost)} of ${money(cap)}…`;
      try {
        const data = await auditOne(item);
        sessionCost += Number(data.cost_usd || 0);
        if (data.status === 'skipped') processed.set(item.question.id, `Skipped: ${data.reason}`);
        else if (data.status === 'cached') processed.set(item.question.id, 'Already audited (cached, no cost)');
        else processed.set(item.question.id, `Result: ${STATUS_LABEL[data.status] || data.status}`);
      } catch (error) {
        processed.set(item.question.id, `Not completed: ${error.message}. It can be retried.`);
        if (/session|sign in|Only Madison/i.test(error.message)) { status.textContent = error.message; break; }
      }
      done++;
      renderBatch();
    }
    await refresh();
    running = false;
    status.textContent = pauseRequested ? `Paused after ${done} audit${done === 1 ? '' : 's'}. Resume continues with the remaining questions.` : `Finished ${done} audit${done === 1 ? '' : 's'} this run. Spent ${money(sessionCost)} so far this session. No question has been changed or published.`;
    updateRunButton();
  }

  async function refresh() {
    try { await reloadAudits(); } catch (error) { $('qa-progress').textContent = `Could not reload audit results: ${error.message || error}`; }
    try { await ctx.reloadDrafts(); } catch (_) { /* drafts list shows its own error */ }
    renderSummary(); renderResults(); renderBatch();
  }

  function categories() { return [...new Set(ctx.getLive().map(question => question.nclex_category).filter(Boolean))].sort(); }

  function filtered() {
    const f = { status: $('qa-f-status').value, risk: $('qa-f-risk').value, active: $('qa-f-active').value, flagged: $('qa-f-flagged').value, difficulty: $('qa-f-diff').value, type: $('qa-f-type').value, category: $('qa-f-cat').value, text: $('qa-f-text').value.trim().toLowerCase() };
    const byId = new Map(ctx.getLive().map(question => [question.id, question]));
    return [...latest.values()].filter(audit => {
      const question = byId.get(audit.question_id); if (!question) return false;
      if (f.status && audit.audit_status !== f.status) return false;
      if (f.risk && audit.clinical_risk !== f.risk) return false;
      if (f.active && String(question.active) !== f.active) return false;
      if (f.flagged && String(flagInfo(question.id).any > 0) !== f.flagged) return false;
      if (f.difficulty && question.difficulty !== f.difficulty) return false;
      if (f.type && (question.item_type || 'mcq') !== f.type) return false;
      if (f.category && question.nclex_category !== f.category) return false;
      if (f.text && !`${ctx.qlabel(question)} ${question.question_no} ${question.topic || ''}`.toLowerCase().includes(f.text)) return false;
      return true;
    }).map(audit => ({ audit, question: byId.get(audit.question_id) }));
  }

  function findingList(audit) {
    const items = [];
    (audit.findings?.screen?.issues || []).forEach(issue => items.push(`[${issue.category}] ${issue.detail}`));
    (audit.findings?.structural || []).forEach(issue => items.push(`[structure] ${issue.field}: ${issue.message}`));
    (audit.findings?.signals || []).forEach(signal => items.push(`[automated] ${signal.message}`));
    return items;
  }

  function verificationText(audit) {
    const attempts = audit.verification?.attempts || [];
    if (!attempts.length) return '';
    const last = attempts[attempts.length - 1];
    const lines = attempts.map(a => `Attempt ${a.attempt}: ${a.outcome === 'verified' ? 'independent reviewer agreed with the key' : a.outcome === 'disagreed' ? `reviewer disagreed — ${(a.problems || []).join(' ')}` : `structure check failed — ${(a.problems || []).map(p => p.message).join(' ')}`}`);
    return `<p class="qa-detail"><strong>Independent verification</strong> (${attempts.length} attempt${attempts.length === 1 ? '' : 's'}; blind review is a safeguard, not clinical validation)</p><ul class="qa-detail">${lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>${last.remaining_signals?.length ? `<p class="qa-detail">Remaining automated signals: ${esc(last.remaining_signals.join(', '))}</p>` : ''}`;
  }

  function renderResults() {
    const rows = filtered();
    const limit = 50;
    $('qa-results-status').textContent = rows.length ? `${rows.length} result${rows.length === 1 ? '' : 's'}${rows.length > limit ? `; showing the first ${limit}` : ''}.` : 'No audit results match these filters yet.';
    const drafts = new Map(ctx.getDrafts().map(draft => [draft.id, draft]));
    $('qa-results').innerHTML = rows.slice(0, limit).map(({ audit, question }) => {
      const draft = audit.revision_id ? drafts.get(audit.revision_id) : null;
      const awaiting = draft && draft.status === 'pending_review';
      const issues = findingList(audit);
      const removed = isQuarantined(audit) && audit.quarantined_at;
      const actions = [];
      if (draft && ['pending_review', 'approved'].includes(draft.status)) actions.push(`<button class="button secondary" type="button" data-qa-open="${esc(draft.id)}">Review side by side</button>`);
      if (isQuarantined(audit)) {
        actions.push(removed ? `<button class="button secondary" type="button" data-qa-release="${esc(question.id)}">Release back to students</button>` : `<button class="button danger" type="button" data-qa-quarantine="${esc(question.id)}">Remove from student assessments (reversible)</button><button class="button secondary" type="button" data-qa-release="${esc(question.id)}">Dismiss quarantine</button>`);
      }
      if (audit.audit_status === 'error') actions.push(`<button class="button secondary" type="button" data-qa-retry="${esc(question.id)}">Retry audit</button>`);
      return `<article class="candidate"><div class="qa-row">${awaiting ? `<input type="checkbox" data-qa-approve="${esc(draft.id)}" ${approveSel.has(draft.id) ? 'checked' : ''} aria-label="Select correction for batch approval">` : ''}<div style="flex:1"><div class="meta"><span class="tag ${STATUS_CLASS[audit.audit_status] || ''}">${esc(STATUS_LABEL[audit.audit_status] || audit.audit_status)}</span>${audit.screening_class ? `<span class="tag">${esc(audit.screening_class)}</span>` : ''}${audit.clinical_risk ? `<span class="tag ${audit.clinical_risk === 'high' ? 'bad' : audit.clinical_risk === 'medium' ? 'warn' : ''}">${esc(audit.clinical_risk)} risk</span>` : ''}<span class="tag">${esc(ctx.qlabel(question))}</span><span class="tag">${question.active ? 'Published' : 'Inactive'}</span>${draft ? `<span class="tag ${draft.status === 'approved' ? 'good' : 'warn'}">Draft: ${esc(draft.status.replace('_', ' '))}</span>` : ''}${removed ? '<span class="tag bad">Removed from assessments</span>' : ''}<span class="tag">${money(audit.est_cost_usd)}</span></div><h3>${esc(question.topic || 'Uncategorized')} · ${esc(question.difficulty || '')}</h3><p class="rationale">${esc(question.stem || '')}</p>${audit.note ? `<p class="qa-detail"><strong>Note:</strong> ${esc(audit.note)}</p>` : ''}${issues.length ? `<details><summary>Findings (${issues.length})</summary><ul class="qa-detail">${issues.map(issue => `<li>${esc(issue)}</li>`).join('')}</ul></details>` : ''}${verificationText(audit)}<div class="buttons">${actions.join('')}</div></div></div></article>`;
    }).join('');
    const sel = $('qa-results');
    sel.querySelectorAll('[data-qa-approve]').forEach(box => box.addEventListener('change', () => { box.checked ? approveSel.add(box.dataset.qaApprove) : approveSel.delete(box.dataset.qaApprove); updateApprove(); }));
    sel.querySelectorAll('[data-qa-open]').forEach(button => button.addEventListener('click', () => ctx.showDraft(button.dataset.qaOpen)));
    sel.querySelectorAll('[data-qa-quarantine]').forEach(button => button.addEventListener('click', () => setQuarantine(button.dataset.qaQuarantine, true)));
    sel.querySelectorAll('[data-qa-release]').forEach(button => button.addEventListener('click', () => setQuarantine(button.dataset.qaRelease, false)));
    sel.querySelectorAll('[data-qa-retry]').forEach(button => button.addEventListener('click', () => retry(button.dataset.qaRetry)));
    updateApprove();
  }

  function updateApprove() {
    const open = new Set(ctx.getDrafts().filter(draft => draft.status === 'pending_review').map(draft => draft.id));
    approveSel = new Set([...approveSel].filter(id => open.has(id)));
    $('qa-approve').disabled = !approveSel.size;
    $('qa-approve').textContent = approveSel.size ? `Approve ${approveSel.size} selected correction${approveSel.size === 1 ? '' : 's'}` : 'Approve selected corrections';
  }

  async function approveSelected() {
    const ids = [...approveSel];
    if (!ids.length || !confirm(`Approve ${ids.length} correction${ids.length === 1 ? '' : 's'}? Approval does not change any live question; applying is a separate step.`)) return;
    let failed = 0;
    for (const id of ids) {
      const result = await ctx.db.rpc('approve_question_revision', { p_revision_id: id });
      if (result.error) failed++;
    }
    approveSel.clear();
    await refresh();
    if (failed) alert(`${failed} correction${failed === 1 ? '' : 's'} could not be approved (it may have changed). Refresh and review it individually.`);
  }

  async function setQuarantine(questionId, remove) {
    const question = ctx.getLive().find(item => item.id === questionId);
    const message = remove
      ? 'Remove this question from new student assessments? It becomes inactive; existing attempts and assignments are untouched. You can release it later.'
      : 'Release this question from quarantine? If it was removed from student assessments it will return to its previous published state.';
    if (!confirm(message)) return;
    const result = await ctx.db.rpc('set_question_quarantine', { p_question_id: questionId, p_quarantine: remove, p_reason: null });
    if (result.error) { alert(`Could not update quarantine: ${result.error.message}`); return; }
    if (question) {
      const fresh = await ctx.db.from('questions').select('active').eq('id', questionId).maybeSingle();
      if (!fresh.error && fresh.data) question.active = fresh.data.active;
    }
    await refresh();
    ctx.rerender();
  }

  function retry(questionId) {
    const question = ctx.getLive().find(item => item.id === questionId); if (!question) return;
    processed.delete(questionId);
    batch = batch.filter(item => item.question.id !== questionId);
    batch.unshift({ question, priority: 1, reason: 'Retry after an error', score: 0, structural: 0 });
    renderBatch();
    $('qa-batch-list').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function buildBatch() {
    const size = Math.max(1, Math.min(MAX_BATCH, Number($('qa-size').value) || 10));
    processed = new Map();
    batch = candidateList($('qa-source').value, size);
    $('qa-progress').textContent = batch.length ? `${batch.length} question${batch.length === 1 ? '' : 's'} selected. Questions with open correction drafts, unchanged audited questions, and quarantined questions are excluded automatically.` : 'Nothing eligible for this source. Everything matching it is already audited, has an open correction draft, or is quarantined.';
    renderBatch();
  }

  function mount() {
    root.innerHTML = `<section class="dashboard-panel" id="qa-audit"><div class="panel-heading"><div><h2>Automated quality audit</h2><p>Screens questions for clinical, distractor, answer-clue, scoring and rationale problems, then saves any proposed revision as a pending correction draft below. Nothing is applied or published automatically.</p></div></div><div class="panel-content">
      <div class="qa-grid" id="qa-summary"></div><p class="count" id="qa-usage" style="margin:0 0 14px;font-size:.78rem;color:var(--admin-muted)"></p>
      <div class="toolbar"><label>Batch source <select id="qa-source"><option value="flagged_risk">Flagged, then highest-risk published</option><option value="unaudited">Other published, not yet audited</option><option value="inactive">Inactive drafts</option></select></label><label>Size <input id="qa-size" type="number" min="1" max="${MAX_BATCH}" value="10" style="width:70px"></label><label>Spend cap ($) <input id="qa-cap" type="number" min="0.1" max="5" step="0.1" value="2" style="width:80px"></label><button class="button secondary" type="button" id="qa-build">Build batch</button></div>
      <div id="qa-batch-list" class="quality-grid"></div>
      <div class="buttons"><button class="button" type="button" id="qa-run" disabled>Run audit</button><button class="button secondary" type="button" id="qa-pause" disabled>Pause</button></div>
      <p class="count" id="qa-progress" role="status" aria-live="polite" style="margin:10px 0;font-size:.82rem;color:var(--admin-muted)">Build a batch to begin. Each question costs roughly 1–5 cents; the spend cap stops the run.</p>
      <h3 style="margin:22px 0 6px">Audit results and exceptions</h3>
      <div class="toolbar"><input id="qa-f-text" type="search" placeholder="Q-number or topic" aria-label="Search by question number or topic"><select id="qa-f-status" aria-label="Audit status"><option value="">Any audit status</option><option value="revised">Revised</option><option value="auto_fix">Auto-fix</option><option value="quarantine">Quarantine</option><option value="pass">Pass</option><option value="released">Released</option><option value="error">Error</option></select><select id="qa-f-risk" aria-label="Clinical risk"><option value="">Any clinical risk</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><select id="qa-f-active" aria-label="Published state"><option value="">Published or inactive</option><option value="true">Published</option><option value="false">Inactive</option></select><select id="qa-f-flagged" aria-label="Flagged"><option value="">Flagged or not</option><option value="true">Flagged</option><option value="false">Not flagged</option></select><select id="qa-f-diff" aria-label="Difficulty"><option value="">Any difficulty</option><option>easy</option><option>medium</option><option>hard</option></select><select id="qa-f-type" aria-label="Question type"><option value="">Any type</option><option value="mcq">Multiple choice</option><option value="sata">Select all</option></select><select id="qa-f-cat" aria-label="NCLEX category"><option value="">Any NCLEX category</option></select></div>
      <div class="buttons" style="margin-bottom:10px"><button class="button" type="button" id="qa-approve" disabled>Approve selected corrections</button></div>
      <p class="count" id="qa-results-status" style="margin:0 0 10px;font-size:.82rem;color:var(--admin-muted)"></p><div id="qa-results" class="quality-grid"></div></div></section>`;
    const catSelect = $('qa-f-cat');
    categories().forEach(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; catSelect.appendChild(option); });
    $('qa-build').addEventListener('click', buildBatch);
    $('qa-run').addEventListener('click', runBatch);
    $('qa-pause').addEventListener('click', () => { pauseRequested = true; $('qa-progress').textContent = 'Pausing after the current question finishes…'; });
    $('qa-approve').addEventListener('click', approveSelected);
    ['qa-f-text', 'qa-f-status', 'qa-f-risk', 'qa-f-active', 'qa-f-flagged', 'qa-f-diff', 'qa-f-type', 'qa-f-cat'].forEach(id => $(id).addEventListener(id === 'qa-f-text' ? 'input' : 'change', renderResults));
  }

  window.QAAudit = {
    get core() { return core; },
    async init(context) {
      ctx = context; root = $('qa-audit-mount'); if (!root) return;
      try { core = await import(CORE_URL); } catch (error) { root.innerHTML = `<p class="empty">The audit tools could not load: ${esc(error.message || error)}</p>`; return; }
      mount();
      try { await reloadAudits(); renderSummary(); renderResults(); renderBatch(); }
      catch (error) { $('qa-progress').textContent = `Run supabase-question-audit.sql to enable audit tracking (${error.message || error}).`; }
    },
    auditFor(revisionId) { return audits.find(audit => audit.revision_id === revisionId) || null; },
    badge(revisionId) {
      const audit = this.auditFor(revisionId); if (!audit) return '';
      const verified = audit.verification?.agreed ? ' · blind-reviewed' : '';
      return `<span class="tag warn">Automated audit${esc(verified)}</span>${audit.clinical_risk ? `<span class="tag ${audit.clinical_risk === 'high' ? 'bad' : ''}">${esc(audit.clinical_risk)} risk</span>` : ''}`;
    },
    refresh,
  };
})();
