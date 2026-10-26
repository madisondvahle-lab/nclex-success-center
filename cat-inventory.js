/* Read-only reconciliation of public question content and the protected CAT registry. */
(function (global) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function reconcile(items, bank) {
    const content = new Map();
    for (const parent of bank) {
      content.set(parent.id, parent);
      for (const child of parent.questions || []) {
        content.set(`${parent.id}:${child.qid}`, { ...child, stem: child.stem || child.prompt });
      }
    }
    return items.map(key => ({ ...key, content: content.get(key.item_id) || null }));
  }
  function card(row) {
    const question = row.content;
    const fields = {
      Source: row.item_source, 'Server selectable': row.selectable ? 'Yes' : 'No',
      Type: row.item_type, Category: row.nclex_category || row.category,
      Difficulty: row.difficulty, 'Cognitive level': row.cognitive_level || 'Not recorded',
      'Safety tags': (row.core_tags || []).join(', ') || 'None',
      Parent: row.parent_item_id || 'Standalone / parent',
      'Case length': row.case_length, Sequence: row.sequence_order,
    };
    return `<details class="panel" style="margin:12px 0;padding:16px"><summary>${esc(row.item_id)} · ${esc(row.item_type)} · ${row.selectable ? 'Selectable' : 'Not independently selectable'}</summary>
      <dl>${Object.entries(fields).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `<dt><strong>${esc(k)}</strong></dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${question ? `<p>${esc(question.caseIntro || '')}</p><p><strong>${esc(question.stem || '')}</strong></p>
        ${question.options ? `<ol type="A">${question.options.map(o => `<li>${esc(o)}</li>`).join('')}</ol>` : ''}
        ${question.type === 'bowtie' ? `<pre style="white-space:pre-wrap">${esc(JSON.stringify({
          [question.leftLabel]: question.leftOptions, [question.centerLabel]: question.centerOptions,
          [question.rightLabel]: question.rightOptions,
        }, null, 2))}</pre>` : ''}
        ${row.item_type === 'casestudy' ? '<p>Expand the child entries below to review each case question and key.</p>' : ''}`
      : '<p role="alert">Registry entry has no matching deployed question content. Do not infer eligibility from the public bank alone.</p>'}
      <p><strong>Correct response (canonical, zero-based indexes where applicable)</strong></p><pre style="white-space:pre-wrap">${esc(JSON.stringify(row.correct_response, null, 2))}</pre>
      <p><strong>Rationale</strong></p><pre style="white-space:pre-wrap">${esc(JSON.stringify(row.rationale, null, 2))}</pre></details>`;
  }
  function mount({ client, host, bank }) {
    host.innerHTML = '<h2>Traditional CAT inventory</h2><p>Read-only. Eligibility comes from the live protected registry, not the main bank’s Active status. No editing or publishing controls are provided.</p><button type="button" id="cat-inventory-load">Load / refresh CAT inventory</button><p id="cat-inventory-status" role="status"></p><div id="cat-inventory-results"></div>';
    const button = host.querySelector('#cat-inventory-load');
    const status = host.querySelector('#cat-inventory-status');
    const results = host.querySelector('#cat-inventory-results');
    button.addEventListener('click', async () => {
      button.disabled = true;
      results.innerHTML = '';
      status.textContent = 'Loading protected registry…';
      try {
        const { data, error } = await client.functions.invoke('diagnostic-assessment', { body: { action: 'traditional-inventory' } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!Array.isArray(data?.items) || !data.summary) throw new Error('The service did not return a complete inventory.');
        const rows = reconcile(data.items, bank);
        const registryIds = new Set(rows.map(r => r.item_id));
        const missing = bank.filter(q => !registryIds.has(q.id)).length;
        status.textContent = `${data.summary.selectableEntries} server-selectable entries; ${data.summary.childRows} child rows; ${data.summary.registryRows} registry rows. ${rows.filter(r => !r.content).length} content mappings missing; ${missing} public entries absent from registry.`;
        results.innerHTML = rows.map(card).join('');
      } catch (error) {
        status.textContent = `CAT inventory could not load: ${error.message || error}. Refresh or contact the administrator.`;
      } finally { button.disabled = false; }
    });
  }
  global.CATInventory = { reconcile, card, mount };
}(window));
