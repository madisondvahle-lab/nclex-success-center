(function () {
  let ctx, helpers, root, runs = [], run = null, items = [], latest = new Map(), flags = [];
  let selected = new Set(), busy = false, paused = false, shown = 50;
  const $ = id => document.getElementById(id);
  const esc = value => ctx.esc(value);
  const storageKey = () => `draft-approval-request:${ctx.userId}`;
  const filters = () => Object.fromEntries(['type','topic','source','status','audit','flags','text'].map(key => [key,$(`da-${key}`).value]));
  const questionFor = draft => ctx.getLive().find(q => q.id === draft.question_id);
  const fresh = draft => helpers.currentAudit(draft, latest.get(draft.id), questionFor(draft));
  const eligible = draft => draft.status === 'pending_review' && fresh(draft) &&
    latest.get(draft.id).report.eligible && !flags.some(f => f.question_id === draft.question_id && f.status === 'open');
  const matching = () => helpers.filterDrafts(ctx.getDrafts(),ctx.getLive(),latest,flags,filters());
  const message = text => { $('da-message').textContent = text; };

  async function rpc(name, args) {
    const result = await ctx.db.rpc(name,args);
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }
  async function allRows(table, order, configure = query => query) {
    const rows = [];
    for (let start = 0; ; start += 250) {
      const result = await configure(ctx.db.from(table).select('*')).order(order).range(start,start+249);
      if (result.error) throw new Error(result.error.message);
      rows.push(...(result.data || []));
      if ((result.data || []).length < 250) return rows;
    }
  }
  function options(id, values, empty) {
    const select = $(id), previous = select.value;
    select.innerHTML = `<option value="">${esc(empty)}</option>` +
      values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    if (values.includes(previous)) select.value = previous;
  }
  async function refresh() {
    await Promise.all([ctx.reloadDrafts(),ctx.reloadQuestions()]);
    const [auditRows, flagRows, runRows] = await Promise.all([
      allRows('latest_question_draft_audits','revision_id'),
      allRows('question_flags','id',query => query.eq('status','open')),
      allRows('question_draft_audit_runs','created_at'),
    ]);
    latest = new Map(auditRows.map(row => [row.revision_id,row]));
    flags = flagRows;
    runs = runRows.reverse();
    options('da-type',[...new Set(ctx.getDrafts().map(d => d.proposed_content.item_type || 'mcq'))].sort(),'Any type');
    options('da-topic',[...new Set(ctx.getLive().map(q => q.topic).filter(Boolean))].sort(),'Any topic');
    options('da-source',[...new Set(ctx.getLive().map(q => helpers.sourceGroup(q)))].sort(),'Any source / import batch');
    $('da-runs').innerHTML = '<option value="">Choose a saved audit run</option>' +
      runs.map(r => `<option value="${esc(r.id)}">${esc(new Date(r.created_at).toLocaleString())} · ${esc(r.id.slice(0,8))}</option>`).join('');
    if (run) $('da-runs').value = run.id;
    render();
  }
  function render() {
    const rows = matching();
    const byId = new Map(ctx.getDrafts().map(d => [d.id,d]));
    selected = new Set([...selected].filter(id => byId.has(id)));
    $('da-count').textContent = `${rows.length} matching drafts · ${selected.size} selected (maximum 25 per operation)`;
    $('da-list').innerHTML = rows.slice(0,shown).map(draft => {
      const question = questionFor(draft), audit = latest.get(draft.id), current = fresh(draft);
      const flagged = flags.some(f => f.question_id === draft.question_id && f.status === 'open');
      const category = !audit ? 'Not audited' : !current ? 'Stale audit - re-audit required' :
        flagged ? 'Needs Clinical Review' : audit.report.classification;
      return `<article class="candidate"><label><input type="checkbox" data-da-pick="${esc(draft.id)}" ${selected.has(draft.id)?'checked':''} ${busy?'disabled':''}>
        <strong>${esc(ctx.qlabel(question) || question.id)}</strong> · ${esc(question.topic || 'Uncategorized')}</label>
        <div class="meta"><span class="tag">${esc(draft.status)}</span><span class="tag ${eligible(draft)?'good':'warn'}">${esc(category)}</span>
        <span class="tag">${esc(draft.proposed_content.item_type || 'mcq')}</span></div>
        <p>${esc(draft.change_summary)}</p><p class="qa-detail">${esc(question.stem)}</p>
        ${current?`<p class="qa-detail">${esc(audit.report.evidence_status)}</p><details><summary>Findings and suggested corrections</summary>${findings(audit.report)}${diff(audit.report)}</details>`:''}
        <button class="button secondary" type="button" data-da-open="${esc(draft.id)}">Individual comparison / editor</button></article>`;
    }).join('') || '<p class="empty">No correction drafts match these filters.</p>';
    $('da-more').hidden = rows.length <= shown;
    $('da-list').querySelectorAll('[data-da-pick]').forEach(box => box.addEventListener('change',() => {
      if (box.checked && selected.size >= 25) { box.checked=false; message('Select at most 25 drafts per operation.'); return; }
      box.checked ? selected.add(box.dataset.daPick) : selected.delete(box.dataset.daPick);
      render();
    }));
    $('da-list').querySelectorAll('[data-da-open]').forEach(button => button.addEventListener('click',() => ctx.showDraft(button.dataset.daOpen)));
    $('da-start').disabled = busy || !selected.size;
    $('da-approve').disabled = busy || !selected.size ||
      [...selected].some(id => !eligible(byId.get(id)));
    ['da-refresh','da-select','da-clear','da-runs','da-load'].forEach(id => { $(id).disabled=busy; });
    renderRun();
  }
  function findings(report) {
    return `<ul>${report.findings.map(f => `<li><strong>${esc(f.severity)}</strong> · ${esc(f.evidence)} · ${esc(f.field)}:
      ${esc(f.detail)}<br><em>Suggested action:</em> ${esc(f.suggestion)}</li>`).join('')}</ul>`;
  }
  function diff(report) {
    return `<details><summary>Exact field differences (${report.diff.length})</summary>${report.diff.map(d =>
      `<p><strong>${esc(d.field)}</strong></p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">Original: ${esc(JSON.stringify(d.original))}\nProposed: ${esc(JSON.stringify(d.proposed))}</pre>`).join('')}</details>`;
  }
  function renderRun() {
    $('da-resume').disabled = busy || !run || !items.some(i => i.status !== 'completed');
    $('da-pause').disabled = !busy;
    $('da-json').disabled = !run;
    $('da-csv').disabled = !run;
    if (!run) { $('da-report').innerHTML='<p>No saved run selected.</p>'; return; }
    const report = helpers.reportFor(run,items), counts = report.counts;
    $('da-report').innerHTML = `<h3>Consolidated report · ${esc(run.id.slice(0,8))}</h3>
      <p>${counts.selected} selected · ${counts.completed} completed · ${counts.failed} failed · ${counts.remaining} pending</p>
      <p>${esc(Object.entries(counts.categories).map(([k,v]) => `${k}: ${v}`).join(' · '))}</p>
      <p>${esc(Object.entries(counts.severity).map(([k,v]) => `${k}: ${v}`).join(' · '))}</p>
      <p>Cost: $0.00. Clinical accuracy is not verified. This historical report does not guarantee current approval eligibility.</p>
      ${items.map(item => `<details><summary>${esc(item.question_label)} · ${esc(item.status)}${item.report?' · '+esc(item.report.classification):''}</summary>
        <p>Draft version: ${esc(item.draft_version)}</p><p>Original fingerprint: ${esc(item.base_fingerprint)}<br>Proposed fingerprint: ${esc(item.proposed_fingerprint)}</p>
        ${item.error?`<p role="alert">${esc(item.error)}</p>`:''}${item.report?findings(item.report)+diff(item.report):''}</details>`).join('')}`;
  }
  async function loadRun(id) {
    run = runs.find(r => r.id === id);
    if (!run) throw new Error('Choose a saved run.');
    items = await allRows('question_draft_audit_items','revision_id',query => query.eq('run_id',run.id));
    $('da-runs').value=run.id;
    renderRun();
  }
  async function start() {
    if (!selected.size || selected.size>25) throw new Error('Select 1-25 drafts.');
    const size = Math.max(1,Math.min(25,Number($('da-size').value)||10));
    const ids = [...selected].slice(0,size);
    if (!confirm(`Create a durable, free deterministic audit of ${ids.length} saved draft(s)? Originals and proposals will not be changed. No AI calls, approvals, or application.`)) return;
    busy=true; render();
    try {
      const id = await rpc('start_question_draft_audit',{p_revision_ids:ids,p_filters:filters()});
      await refresh();
      await loadRun(id);
      message('Audit selection saved. Click Run / resume to process it.');
    } finally { busy=false; render(); }
  }
  async function resume() {
    if (!run || busy) return;
    busy=true; paused=false; render();
    try {
      // Re-read durable state first: another tab may already have completed items.
      items = await allRows('question_draft_audit_items','revision_id',query => query.eq('run_id',run.id));
      await helpers.processRun(items, item => rpc('process_question_draft_audit',{p_run_id:run.id,p_revision_id:item.revision_id}),
        () => paused, item => {
          renderRun();
          message(item.status==='failed'?`Stopped: ${item.error}`:`Saved ${item.question_label}.`);
        });
      if (!items.some(i => i.status==='failed')) message(paused?'Paused. Completed work is saved.':'Audit finished. No draft, question, or approval was changed.');
      await refresh();
    } finally { busy=false; render(); }
  }
  function showReceipt(receipt) {
    $('da-receipt').textContent = JSON.stringify(receipt,null,2);
  }
  async function submitApproval(request) {
    busy=true; render();
    try {
      const receipt = await rpc('approve_question_revision_batch',{p_request_id:request.id,p_items:request.items});
      if (!receipt || receipt.request_id!==request.id || typeof receipt.approved!=='boolean' ||
        !Number.isInteger(receipt.approved_count) || receipt.applied!==false) {
        throw new Error('Approval service returned an invalid receipt. Retry the saved request to resolve its outcome.');
      }
      showReceipt(receipt);
      // Preserve the request until a definite server response; an interrupted response can be retried exactly.
      localStorage.removeItem(storageKey());
      $('da-retry').hidden=true;
      message(receipt.approved?`Approved ${receipt.approved_count} drafts. No questions applied.`:
        'Nothing approved. Review the item-specific reasons in the receipt.');
      try { await refresh(); }
      catch(error) { message(`Approval response recorded below, but refreshing the list failed: ${error.message}. Refresh before another approval.`); }
    } finally { busy=false; render(); }
  }
  async function approve() {
    if (busy) return;
    busy=true; render();
    try {
      await refresh();
      const drafts = ctx.getDrafts().filter(d => selected.has(d.id));
      if (!drafts.length || drafts.length !== selected.size || drafts.some(d => !eligible(d))) throw new Error('Selection is not wholly eligible. Re-audit stale drafts or use individual review.');
      const request = {id:crypto.randomUUID(),items:drafts.map(d => helpers.approvalItem(latest.get(d.id)))};
      if (!confirm(`Approve ${drafts.length} spacing-only correction(s) as one transaction? If any fails validation, none will be approved. No live question will be changed.`)) return;
      if (localStorage.getItem(storageKey())) throw new Error('Resolve the previous interrupted approval using Retry before starting another.');
      localStorage.setItem(storageKey(),JSON.stringify(request));
      $('da-retry').hidden=false;
      await submitApproval(request);
    } finally { busy=false; render(); }
  }
  function download(format) {
    const report = helpers.reportFor(run,items);
    const blob = new Blob([format==='csv'?helpers.csvReport(report):JSON.stringify(report,null,2)],
      {type:format==='csv'?'text/csv;charset=utf-8':'application/json'});
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href=url; anchor.download=`draft-audit-${run.id}.${format}`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  function action(fn) {
    return async () => { try { await fn(); } catch(error) { message(`Operation failed: ${error.message}. Saved progress remains available; refresh or retry the same operation.`); } };
  }
  window.DraftAudit = {
    async init(context) {
      ctx=context; root=$('draft-audit-mount'); if (!root) return;
      try {
        helpers=await import('./question-draft-audit.mjs');
        root.innerHTML=`<section class="dashboard-panel" aria-labelledby="da-title"><div class="panel-heading"><div>
          <h2 id="da-title">Bulk correction-draft review</h2>
          <p>Audit saved originals and proposals without editing them. Approval and application remain separate.</p></div></div><div class="panel-content">
          <p>Free deterministic checks: <strong>$0.00; no AI calls.</strong> Clinical accuracy, medical claims, semantic rationale consistency, distractor plausibility, and duplicate concepts require source or educator verification. Use Possible duplicates for bank-wide overlap signals.</p>
          <p>Paid AI review of saved drafts is not enabled in Phase 1. The existing question-audit tool below is optional, has its own cost authorization, and skips open correction drafts.</p>
          <div class="toolbar">
          <input id="da-text" type="search" placeholder="Question number, stem, or correction reason" aria-label="Search correction drafts">
          <select id="da-type" aria-label="Draft question type"></select><select id="da-topic" aria-label="Draft topic"></select>
          <select id="da-source" aria-label="Draft source"></select>
          <select id="da-status" aria-label="Draft lifecycle status"><option value="pending_review">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="applied">Applied</option><option value="">Any draft status</option></select>
          <select id="da-audit" aria-label="Draft audit status"><option value="">Any audit status</option><option value="unaudited">Not audited</option><option value="stale">Stale audit</option>${helpers.CATEGORIES.map(c=>`<option>${esc(c)}</option>`).join('')}</select>
          <select id="da-flags" aria-label="Unresolved question flags"><option value="">Any flag state</option><option value="true">Unresolved flags</option><option value="false">No unresolved flags</option></select></div>
          <div class="buttons"><button id="da-select" class="button secondary" type="button">Select first 25 matching</button><button id="da-clear" class="button secondary" type="button">Clear selection</button><button id="da-refresh" class="button secondary" type="button">Refresh drafts / audits</button></div>
          <p id="da-count"></p><div id="da-list" class="quality-grid"></div>
          <button id="da-more" class="button secondary" type="button">Show 50 more</button>
          <div class="toolbar"><label>Batch size <input id="da-size" type="number" min="1" max="25" value="10"></label>
          <button id="da-start" class="button" type="button">Save audit batch (free)</button>
          <button id="da-approve" class="button" type="button">Approve eligible selection atomically</button></div>
          <p>Only spacing-only MCQ/SATA changes with complete valid structure, no rationale/scoring changes, and no unresolved flags are batch eligible. All other corrections require individual review.</p>
          <div class="toolbar"><select id="da-runs" aria-label="Saved draft audit runs"></select><button id="da-load" class="button secondary" type="button">Load saved run</button>
          <button id="da-resume" class="button" type="button">Run / resume (free)</button><button id="da-pause" class="button secondary" type="button" disabled>Pause after current item</button></div>
          <p id="da-message" role="status" aria-live="polite">Loading saved draft audits...</p>
          <div class="buttons"><button id="da-json" class="button secondary" type="button">Export JSON</button><button id="da-csv" class="button secondary" type="button">Export CSV</button>
          <button id="da-retry" class="button secondary" type="button" hidden>Retry interrupted approval (same request)</button></div>
          <div id="da-report"></div><details><summary>Approval receipts</summary><button id="da-receipts-load" class="button secondary" type="button">Load last 25 durable approval receipts</button><pre id="da-receipt" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details>
          <details><summary>Append-only history for selected drafts</summary><button id="da-history-load" class="button secondary" type="button">Load selected history</button><pre id="da-history" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details>
          </div></section>`;
        for (const key of ['type','topic','source','status','audit','flags','text']) $(`da-${key}`).addEventListener(key==='text'?'input':'change',() => { shown=50; selected.clear(); render(); });
        $('da-select').addEventListener('click',()=>{ selected=new Set(matching().slice(0,25).map(d=>d.id)); render(); });
        $('da-clear').addEventListener('click',()=>{ selected.clear(); render(); });
        $('da-more').addEventListener('click',()=>{ shown+=50; render(); });
        $('da-refresh').addEventListener('click',action(async()=>{await refresh(); if(run)await loadRun(run.id); message('Drafts and audit eligibility refreshed.');}));
        $('da-start').addEventListener('click',action(start));
        $('da-load').addEventListener('click',action(()=>loadRun($('da-runs').value)));
        $('da-resume').addEventListener('click',action(resume));
        $('da-pause').addEventListener('click',()=>{paused=true; message('Pausing after the current item is durably saved.');});
        $('da-approve').addEventListener('click',action(approve));
        $('da-retry').addEventListener('click',action(async()=>{
          const saved=localStorage.getItem(storageKey());
          if (!saved) throw new Error('No interrupted approval request found.');
          if (confirm('Retry the exact saved approval request? A committed request returns its original receipt.')) await submitApproval(JSON.parse(saved));
        }));
        $('da-json').addEventListener('click',()=>download('json'));
        $('da-csv').addEventListener('click',()=>download('csv'));
        $('da-receipts-load').addEventListener('click',action(async()=>{
          const result=await ctx.db.from('question_revision_events').select('receipt')
            .in('event_type',['batch_approved','batch_rejected']).order('id',{ascending:false}).limit(25);
          if (result.error) throw new Error(result.error.message);
          showReceipt(result.data.map(row=>row.receipt));
        }));
        $('da-history-load').addEventListener('click',action(async()=>{
          if (!selected.size) throw new Error('Select drafts whose history you want to inspect.');
          const history=await allRows('question_revision_events','id',query=>query.in('revision_id',[...selected]));
          $('da-history').textContent=JSON.stringify(history,null,2);
        }));
        await refresh();
        if (runs.length) await loadRun(runs[0].id);
        const pending=localStorage.getItem(storageKey());
        $('da-retry').hidden=!pending;
        message(pending?'An approval response was interrupted. Retry the saved request to retrieve its definitive result.':'Ready. Select saved correction drafts to audit; no questions will be changed.');
      } catch(error) {
        if ($('da-message')) message(`Draft audit tools unavailable: ${error.message}. The Phase 1 database migration must be installed before use. Existing editor and individual review remain available.`);
        else root.textContent=`Draft audit tools could not load: ${error.message}`;
      }
    },
  };
})();
