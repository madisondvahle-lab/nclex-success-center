(function () {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const columns = 'id,stem,item_type,item_data,active,question_no,nclex_category,topic';
  function sameJSON(left, right) {
    const canonical = value => Array.isArray(value) ? value.map(canonical) :
      value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
  }

  function fromRow(row) {
    if (!row?.active || !row.item_data || row.item_data.schemaVersion !== 1) {
      throw new Error('Select a published authored clinical-record question or NGN case study.');
    }
    const entry = copy(row.item_data);
    if (row.item_type === 'case' && (entry.kind !== 'case' || entry.items?.length !== 6)) {
      throw new Error('An assigned unfolding case must contain exactly six items.');
    }
    if (row.item_type !== 'case' && entry.type !== row.item_type) throw new Error('The published interaction type does not match its authored data.');
    NGNAuthor.validate(entry);
    entry.id = row.id;
    entry.title = entry.title || row.stem;
    entry.category = row.nclex_category || entry.category || 'Clinical judgment';
    entry.topic = row.topic || entry.topic || entry.category;
    (entry.kind === 'case' ? entry.items : [entry]).forEach(item => {
      item.dbId = row.id;
      item.qno = row.question_no;
    });
    return entry;
  }

  function details(result) {
    return result.items.map((item, i) => {
      const answer = result.ans[i];
      NGNScoring.validateAnswer(item, answer, true);
      const answered = ExamUI.isAnswered(item, answer);
      const key = item.type === 'mcq' ? item.correct[0] : item.type === 'fill' ? String(item.correct) :
        item.type === 'cloze' ? item.dropdowns.map(dropdown => dropdown.correct) :
        item.type === 'highlight' ? item.segments.filter(segment => segment.correct).map(segment => segment.id) :
        item.type === 'bowtie' ? [...item.correct.actions, item.correct.condition, ...item.correct.complications] : item.correct;
      const possible = ExamUI.score(item, key);
      const partial = answered ? ExamUI.score(item, answer) : NGNScoring.legacyScore(item, answer);
      const credit = item.scoringVersion === 'ngn-v1' && !answered
        ? { ...possible, earned: Math.round(partial.score * possible.max), score: partial.score, full: false }
        : partial;
      return {
        question_id: item.qid,
        case_id: item.case?.id || null,
        case_index: item.caseIndex ?? null,
        category: item.category,
        selected_answer: copy(answer),
        correct_answer: copy(key),
        stem: item.prompt || item.stem,
        rationale: item.rationale,
        interaction: copy(item),
        credit,
        correct: credit.full,
        marked_for_review: !!result.marked[i]
      };
    });
  }

  function summary(rows) {
    const full = rows.filter(row => row.correct === true || row.is_correct === true).length;
    // Legacy authored items use normalized item credit; ngn-v1 items retain raw points.
    const earned = rows.reduce((sum, row) => sum + (row.credit.earned ?? row.credit.score), 0);
    const max = rows.reduce((sum, row) => sum + (row.credit.max ?? 1), 0);
    return { full, earned, max, percent: Math.round(earned / max * 100) };
  }

  function reviewHtml(rows) {
    const esc = ExamUI.esc;
    const totals = summary(rows);
    return `<p><strong>NGN partial-credit score: ${totals.percent}% · ${totals.earned}/${totals.max} points.</strong> ${totals.full}/${rows.length} items fully correct.</p>` +
      rows.map(row => {
        const item = row.interaction, answer = row.selected_answer ?? row.selected;
        const record = item.case || item;
        const engine = Object.create(ExamUI.Exam.prototype);
        Object.assign(engine, { items: [item], i: 0, ans: [answer], checked: [true], o: { readOnly: true } });
        const stage = item.case ? item.caseIndex + 1 : 1;
        const charts = (record.tabs || []).filter(tab => (tab.fromItem || 1) <= stage)
          .map(tab => `<h4>${esc(tab.label)}</h4>${engine.chartHtml(tab, stage)}`).join('');
        return `<details><summary>${item.case ? `Case item ${stage} of ${record.total}` : 'Question'} · ${row.credit.earned ?? row.credit.score}/${row.credit.max ?? 1} points${row.marked_for_review ? ' · Marked' : ''}</summary>
          <p>${esc(record.title || '')}</p><p>${record.textFormat === 'plain' ? esc(record.scenario || '') : record.scenario || ''}</p>
          ${charts}<p>${item.textFormat === 'plain' ? esc(item.prompt || item.stem) : item.prompt || item.stem}</p>
          ${ExamUI.reviewHtml(item.type === 'fill' && answer === '' ? { ...item, scoringVersion: undefined } : item, answer)}<p>${esc(item.rationale)}</p></details>`;
      }).join('');
  }

  async function assign(db, studentId, ids) {
    if (!ids.length) return;
    const unique = [...new Set(ids)];
    const bank = await db.from('questions').select(columns).in('id', unique).eq('active', true);
    if (bank.error) throw bank.error;
    const byId = new Map((bank.data || []).map(row => [row.id, row]));
    const entries = unique.map(id => fromRow(byId.get(id)));
    for (const entry of entries) {
      const url = 'supplemental-practice.html?ngn=' + encodeURIComponent(entry.id);
      const found = await db.from('student_resources').select('id').eq('student_id', studentId).eq('url', url).limit(1);
      if (found.error) throw found.error;
      if (found.data?.length) continue;
      const saved = await db.from('student_resources').insert({
        student_id: studentId, title: entry.title + (entry.kind === 'case' ? ' · 6-item NGN case' : ' · Clinical-record / NGN practice'),
        resource_type: 'practice_set', url, assignment_kind: 'practice',
        assignment_details: { platform: 'Portal Question Bank', practice_type: 'ngn-authored', question_id: entry.id, question_count: entry.kind === 'case' ? 6 : 1 },
        note: 'Complete the assigned practice, then review your score and rationales.'
      });
      if (saved.error) throw saved.error;
    }
  }

  window.NGNPractice = { columns, fromRow, details, summary, reviewHtml, assign, sameJSON };
})();
