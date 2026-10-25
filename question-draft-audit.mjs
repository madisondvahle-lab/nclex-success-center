// Review-only helpers. Eligibility is always checked again inside the approval transaction.
export const CRITERIA = 'draft-qa-v1';
export const CATEGORIES = ['Ready for Approval', 'Minor Corrections', 'Major Corrections', 'Needs Clinical Review'];

export function sourceGroup(question) {
  const key = question.source_key || '(Unspecified source)';
  return key.match(/^qbank-bulk-[0-9a-f-]{36}/i)?.[0] ||
    (key.startsWith('consult-') ? 'Consult diagnostic' : key.startsWith('quality-') ? 'Quality drafts' : key);
}

export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

export function currentAudit(draft, item, question) {
  return !!(draft && item?.status === 'completed' && item.report?.criteria_version === CRITERIA &&
    draft.proposed_at === item.draft_version &&
    stable(draft.base_content) === stable(item.base_content) &&
    stable(draft.proposed_content) === stable(item.proposed_content) &&
    question && Object.entries(item.base_content).every(([key, value]) => stable(question[key]) === stable(value)));
}

export function filterDrafts(drafts, questions, latest, flags, filters) {
  const byId = new Map(questions.map(q => [q.id, q]));
  const flagged = new Set(flags.filter(f => f.status === 'open').map(f => f.question_id));
  return drafts.filter(draft => {
    const question = byId.get(draft.question_id);
    if (!question) return false;
    const audit = latest.get(draft.id);
    const fresh = currentAudit(draft, audit, question);
    const auditStatus = !audit ? 'unaudited' : !fresh ? 'stale' :
      flagged.has(question.id) ? 'Needs Clinical Review' : audit.report.classification;
    return (!filters.type || (draft.proposed_content.item_type || question.item_type || 'mcq') === filters.type) &&
      (!filters.topic || (question.topic || '') === filters.topic) &&
      (!filters.source || sourceGroup(question) === filters.source) &&
      (!filters.status || draft.status === filters.status) &&
      (!filters.audit || auditStatus === filters.audit) &&
      (!filters.flags || String(flagged.has(question.id)) === filters.flags) &&
      (!filters.text || `${question.question_no || ''} ${question.stem || ''} ${draft.change_summary}`.toLowerCase().includes(filters.text.toLowerCase()));
  });
}

export function approvalItem(item) {
  return { revision_id: item.revision_id, audit_id: item.audit_id, draft_version: item.draft_version,
    base_fingerprint: item.base_fingerprint, proposed_fingerprint: item.proposed_fingerprint };
}

export async function processRun(items, process, paused, progress) {
  for (const item of items) {
    if (paused()) break;
    if (item.status === 'completed') continue;
    const result = await process(item);
    Object.assign(item, result);
    progress(item);
    if (result.status !== 'completed') break;
  }
}

export function reportFor(run, items) {
  const counts = { selected: items.length, completed: 0, failed: 0, remaining: 0, categories: {}, severity: {} };
  for (const item of items) {
    if (item.status === 'completed') {
      counts.completed++;
      const category = item.report.classification;
      counts.categories[category] = (counts.categories[category] || 0) + 1;
      for (const finding of item.report.findings) counts.severity[finding.severity] = (counts.severity[finding.severity] || 0) + 1;
    } else if (item.status === 'failed') counts.failed++;
    else counts.remaining++;
  }
  return { run, criteria_version: CRITERIA, counts, items,
    notice: 'Draft audit only. No question applied. Clinical accuracy is not verified. Eligibility must be revalidated at approval.' };
}

export function csvReport(report) {
  const columns = ['run_id','revision_id','question','draft_version','base_fingerprint','proposed_fingerprint','status',
    'classification','field','severity','evidence','finding','suggested_correction','error','original','proposed'];
  const rows = [columns];
  for (const item of report.items) {
    for (const f of item.report?.findings?.length ? item.report.findings : [{}]) {
      rows.push([item.run_id,item.revision_id,item.question_label,item.draft_version,item.base_fingerprint,item.proposed_fingerprint,
        item.status,item.report?.classification,f.field,f.severity,f.evidence,f.detail,f.suggestion,item.error,
        JSON.stringify(item.base_content),JSON.stringify(item.proposed_content)]);
    }
  }
  // Quoting alone does not stop spreadsheet formula execution.
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"','""')}"`;
  };
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
