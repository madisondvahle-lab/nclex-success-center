(function () {
  'use strict';
  const PAGE_SIZE = 20;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const labels = { correct: 'Correct', incorrect: 'Incorrect', partial: 'Partially correct', omitted: 'Omitted', unknown: 'Not recorded' };
  const typeNames = { mcq: 'Multiple Choice', sata: 'Select All That Apply', matrix: 'Matrix',
    cloze: 'Drop-down', highlight: 'Highlight', bowtie: 'Bow-Tie', fill: 'Fill in the Blank' };
  const bankNumber = value => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const parsed = number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  };
  const bankLabel = row => row.bankNumber ? `Q-${String(row.bankNumber).padStart(4, '0')}` : 'Bank number unavailable';
  const typeLabel = type => typeNames[type] || String(type).toUpperCase();
  function bankId(row) {
    for (const value of [row.dbId, row.interaction?.dbId, row.question_id, row.item_id, row.id, row.interaction?.id, row.case_id]) {
      const match = String(value || '').match(/^(?:qbank:)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?::.+)?$/i);
      if (match) return match[1].toLowerCase();
    }
    return null;
  }
  async function resolveBankNumbers(db, rows, practiceKey) {
    const unresolved = rows.filter(row => row.bankNumber === null);
    const ids = [...new Set(unresolved.map(bankId).filter(Boolean))];
    const numbers = new Map(), legacyNumbers = new Map();
    for (let offset = 0; offset < ids.length; offset += 100) {
      const result = await db.from('questions').select('id,question_no').in('id', ids.slice(offset, offset + 100));
      if (result.error) throw new Error(`Question bank numbers could not load: ${result.error.message || 'Please try again.'}`);
      result.data.forEach(row => numbers.set(row.id.toLowerCase(), bankNumber(row.question_no)));
    }
    const legacyIds = practiceKey ? [...new Set(unresolved.filter(row => !bankId(row)).map(row => row.id))] : [];
    for (let offset = 0; offset < legacyIds.length; offset += 100) {
      const result = await db.from('question_set_items').select('legacy_id,question:questions!inner(question_no)')
        .eq('set_key', practiceKey).in('legacy_id', legacyIds.slice(offset, offset + 100));
      if (result.error) throw new Error(`Question bank numbers could not load: ${result.error.message || 'Please try again.'}`);
      result.data.forEach(row => legacyNumbers.set(row.legacy_id, bankNumber(row.question?.question_no)));
    }
    return rows.map(row => ({ ...row, bankNumber: row.bankNumber ?? numbers.get(bankId(row)) ?? legacyNumbers.get(row.id) ?? null }));
  }
  const sources = [
    { key: 'practice', name: 'Practice', table: 'student_supplemental_practice_results', date: 'completed_at',
      fields: 'id,practice_key,practice_title,score,total_questions,completed_at' },
    { key: 'portal', name: 'Portal assessment', table: 'in_house_assessment_attempts', date: 'completed_at',
      fields: 'id,assessment_key,assessment_title,mode,result,total_questions,correct_questions,completed_at' },
    { key: 'external', name: 'Saved CAT/readiness', table: 'external_assessments', date: 'taken_at',
      fields: 'id,platform,assessment_name,taken_at,created_at,overall_score,readiness_level' }
  ];

  function dateLabel(value) {
    if (!value) return 'Not recorded';
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T12:00:00' : value);
    return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString('en-US',
      /^\d{4}-\d{2}-\d{2}$/.test(value) ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' });
  }

  function session(row, source) {
    const total = number(row.total_questions);
    const correct = number(source.key === 'practice' ? row.score : row.correct_questions);
    const mode = source.key === 'portal' ? AssessmentDisplay.modeForAttempt(row) : null;
    return {
      id: row.id, source: source.key, kind: source.name, practiceKey: row.practice_key,
      title: row.practice_title || row.assessment_title || row.assessment_name || row.practice_key || row.assessment_key || source.name,
      date: row.completed_at || row.taken_at || row.created_at, total, correct,
      percent: source.key === 'external' ? number(row.overall_score) : total > 0 && correct !== null ? Math.round(correct / total * 100) : null,
      mode: mode ? AssessmentDisplay.label(mode) : source.key === 'external' ? row.platform : null,
      result: mode ? AssessmentDisplay.classification(mode, row.result)?.label || null : row.readiness_level || null
    };
  }

  function detailRows(details) {
    if (!Array.isArray(details)) throw new Error('The saved question review is not in a supported format.');
    return details.map((row, index) => {
      if (!row || typeof row !== 'object') throw new Error('A saved question response is invalid. Contact Madison.');
      const [normalized] = PracticeReviewData.normalize([row]);
      const selected = row.selected_answer ?? row.selected ?? row.selectedAnswer;
      const key = row.correct_answer ?? row.correctAnswer;
      const type = row.interaction?.type || row.question_type || row.type || (Array.isArray(key) ? 'sata' : 'mcq');
      const missing = selected === undefined || selected === null || selected === '' ||
        (Array.isArray(selected) && (selected.length === 0 || selected.every(value => value === null)));
      const recordedAnswer = Object.hasOwn(row, 'selected_answer') || Object.hasOwn(row, 'selected') || Object.hasOwn(row, 'selectedAnswer');
      const full = typeof row.is_correct === 'boolean' || typeof row.correct === 'boolean' || key !== undefined && !missing
        ? normalized.is_correct : null;
      const max = number(row.credit?.max) ?? (row.credit ? 1 : null);
      const earned = number(row.credit?.earned) ?? (row.credit ? number(row.credit.score) : null);
      const status = missing && recordedAnswer ? 'omitted' : earned > 0 && max > earned ? 'partial'
        : full === true ? 'correct' : full === false ? 'incorrect' : 'unknown';
      return {
        ...row, index, selected, key, type, status, earned, max,
        bankNumber: bankNumber(row.question_no) ?? bankNumber(row.qno) ?? bankNumber(row.interaction?.qno),
        id: row.question_id || row.item_id || row.id || `Question ${index + 1}`,
        stem: row.stem || row.interaction?.prompt || row.interaction?.stem || '',
        category: row.nclex_category || row.category || row.interaction?.category || '',
        topic: row.topic || row.interaction?.topic || '',
        system: row.system || '',
        rationale: row.rationale || row.interaction?.rationale || ''
      };
    });
  }

  function summary(rows) {
    const counts = { correct: 0, incorrect: 0, partial: 0, omitted: 0, unknown: 0 };
    rows.forEach(row => counts[row.status]++);
    const points = rows.length > 0 && rows.every(row => row.earned !== null && row.max > 0)
      ? { earned: rows.reduce((sum, row) => sum + row.earned, 0), max: rows.reduce((sum, row) => sum + row.max, 0) } : null;
    return { counts, points };
  }

  function explanation(value) {
    if (value && typeof value === 'object') return Object.entries(value).map(([key, text]) =>
      `<p><strong>${esc(key)}:</strong> ${explanation(text)}</p>`).join('');
    return esc(value || 'No rationale was saved for this item.');
  }

  function questionHtml(row) {
    const item = row.interaction || (Array.isArray(row.options) && row.key !== undefined ? {
      type: row.type, options: row.options, correct: Array.isArray(row.key) ? row.key : [row.key],
      presentation: row.presentation, optionRationales: row.option_rationales || {}
    } : null);
    let response = '<p>The full question or answer options were not saved for this older item.</p>';
    let records = '';
    if (item) {
      const answer = row.selected ?? NGNScoring.emptyAnswer(item);
      const selected = item.type === 'sata' && !Array.isArray(answer) ? [answer]
        : item.type === 'mcq' && Array.isArray(answer) ? answer[0] ?? null
        : item.type === 'fill' ? String(answer) : answer;
      response = ExamUI.reviewHtml(item, selected);
      const record = item.case || item;
      const stage = item.case ? item.caseIndex + 1 : 1;
      const engine = Object.create(ExamUI.Exam.prototype);
      Object.assign(engine, { items: [item], i: 0, ans: [selected], checked: [true], o: { readOnly: true } });
      records = (record.scenario ? `<p class="test-history-stem">${esc(record.scenario)}</p>` : '') +
        (record.tabs || []).filter(tab => (tab.fromItem || 1) <= stage).map(tab =>
          `<section class="test-history-record"><h3>${esc(tab.label)}</h3>${engine.chartHtml(tab, stage)}</section>`).join('');
      if (item.template) response = `<p>${esc(item.template.replace(/\{\{\d+\}\}/g, '____'))}</p>` + response;
    }
    return `${records}<h3 class="test-history-stem">${esc(row.stem || 'Question text was not saved for this item.')}</h3>
      <p class="test-history-muted">Selected responses and correct answers are shown below. This review is read-only.</p>
      ${response}<section class="test-history-rationale"><h3>Rationale</h3><div>${explanation(row.rationale)}</div></section>`;
  }

  function init({ root, db, studentId }) {
    if (!root || !studentId) throw new Error('Student history requires a linked student account.');
    let entries = [], active = null, rows = [], requestId = 0, search = '', kind = 'all';
    let responseFilter = 'all', typeFilter = 'all', current = null, loading = false, numberWarning = '';
    const numberNotice = () => numberWarning
      ? `<p role="alert">${esc(numberWarning)} Saved answers and rationales remain available.</p><button type="button" class="test-history-button" data-retry>Retry bank numbers</button>` : '';
    const state = sources.map(source => ({ ...source, offset: 0, more: true, error: '' }));
    const cache = new Map();
    root.innerHTML = `<header class="test-history-header"><div><p class="eyebrow">Question Bank</p>
      <h1 tabindex="-1">Previous Tests</h1><p>Open a completed test to explore your results and review its questions.</p></div>
      <a class="test-history-button" href="supplemental-practice.html">Create practice</a></header>
      <p class="test-history-status" role="status" aria-live="polite"></p><div class="test-history-content"></div>`;
    const content = root.querySelector('.test-history-content'), status = root.querySelector('[role="status"]');
    const focus = () => content.querySelector('[data-focus]')?.focus();
    const scoreText = entry => entry.percent === null ? 'Not recorded' : `${entry.percent}%${entry.correct !== null && entry.total > 0 ? ` · ${entry.correct}/${entry.total} fully correct` : ''}`;
    const visibleEntries = () => entries.filter(entry => (kind === 'all' || entry.source === kind) &&
      `${entry.title} ${entry.mode || ''}`.toLowerCase().includes(search.toLowerCase()));
    function listRows() {
      const shown = visibleEntries();
      return shown.length ? shown.map(entry => `<tr><td><strong>${esc(entry.title)}</strong><small>${esc(entry.mode || entry.kind)}</small></td>
        <td>${esc(dateLabel(entry.date))}</td><td>${entry.total ?? 'Not recorded'}</td><td>${esc(scoreText(entry))}</td>
        <td>${esc(entry.result || 'Completed')}</td><td><button type="button" class="test-history-button" data-open="${esc(entry.source + ':' + entry.id)}">${entry.source === 'external' ? 'View result' : 'Review test'}</button></td></tr>`).join('')
        : '<tr><td colspan="6">No saved tests match this view.</td></tr>';
    }
    function renderList() {
      active = null; current = null; requestId++;
      root.classList.remove('test-history-detail');
      content.innerHTML = `<div class="test-history-toolbar"><label>Search tests<input type="search" data-search value="${esc(search)}" placeholder="Test name or mode"></label>
        <label>Test type<select data-kind>${[['all', 'All tests'], ...sources.map(source => [source.key, source.name])].map(([value, name]) =>
          `<option value="${value}"${kind === value ? ' selected' : ''}>${name}</option>`).join('')}</select></label></div>
        <div class="test-history-table-wrap" role="region" aria-label="Previous tests" tabindex="0"><table class="test-history-table"><caption class="test-history-sr">Completed tests, newest first</caption>
        <thead><tr><th scope="col">Test</th><th scope="col">Completed</th><th scope="col">Questions</th><th scope="col">Score</th><th scope="col">Result</th><th scope="col">Review</th></tr></thead><tbody>${listRows()}</tbody></table></div>
        <p class="test-history-muted">Scores labelled fully correct are item counts, not NGN partial-credit points. Older tests may have a score without saved question details.</p>
        ${state.some(source => source.more || source.error) ? `<button type="button" class="test-history-button" data-more${loading ? ' disabled' : ''}>${state.some(source => source.error) ? 'Retry / load more results' : 'Load older tests'}</button>` : ''}`;
    }
    async function load() {
      if (loading) return;
      loading = true;
      status.textContent = 'Loading saved tests…';
      renderList();
      await Promise.all(state.filter(source => source.more || source.error).map(async source => {
        try {
          let query = db.from(source.table).select(source.fields).eq('student_id', studentId);
          if (source.key === 'portal') query = query.eq('status', 'completed');
          const result = await query.order(source.date, { ascending: false, nullsFirst: false }).order('id')
            .range(source.offset, source.offset + PAGE_SIZE - 1);
          if (result.error) throw result.error;
          if (!Array.isArray(result.data)) throw new Error('The history service returned an invalid list.');
          entries.push(...result.data.map(row => session(row, source)));
          source.offset += result.data.length; source.more = result.data.length === PAGE_SIZE; source.error = '';
        } catch (error) {
          source.error = `${source.name}: ${error.message || 'Could not load results.'}`;
        }
      }));
      entries.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
      loading = false;
      status.textContent = state.some(source => source.error) ? state.filter(source => source.error).map(source => source.error).join(' · ')
        : `${entries.length} saved tests loaded.`;
      if (!active) renderList();
    }
    const filteredRows = () => rows.filter(row => (responseFilter === 'all' || row.status === responseFilter) && (typeFilter === 'all' || row.type === typeFilter));
    function renderDetails() {
      current = null;
      const stats = summary(rows);
      const points = stats.points;
      const metrics = [
        ['Score', points ? `${Math.round(points.earned / points.max * 100)}%` : active.percent === null ? 'Not recorded' : `${active.percent}%`,
          points ? `${points.earned}/${points.max} points scored` : active.source === 'external' ? 'Saved assessment percentage' : 'Fully correct item percentage'],
        ['Question performance', rows.length ? `${stats.counts.correct} correct · ${stats.counts.incorrect} incorrect` : 'Not recorded',
          rows.length ? `${stats.counts.partial} partial · ${stats.counts.omitted} omitted · ${stats.counts.unknown} not recorded` : 'No question-level responses saved'],
        ['Test settings', active.mode || 'Not recorded', 'Timer and question-pool settings: Not recorded'],
        ['Timing & answer changes', 'Not recorded', 'These details were not saved with this attempt']
      ];
      content.innerHTML = `<button type="button" class="test-history-back" data-back>← All previous tests</button>
        <h2 tabindex="-1" data-focus>${esc(active.title)}</h2>${numberNotice()}<p class="test-history-muted">${esc(dateLabel(active.date))} · ${esc(active.result || 'Completed')}</p>
        <div class="test-history-metrics">${metrics.map(([title, value, note], index) => `<section><h3>${esc(title)}</h3><strong>${esc(value)}</strong>
          ${index === 0 && value.endsWith('%') ? `<meter min="0" max="100" value="${esc(value.slice(0, -1))}" aria-label="Test score">${esc(value)}</meter>` : ''}<p>${esc(note)}</p></section>`).join('')}</div>
        ${rows.length ? `<div class="test-history-toolbar"><label>Show responses<select data-response><option value="all">All responses</option>${Object.entries(labels).map(([value, label]) =>
          `<option value="${value}"${responseFilter === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
          <label>Question type<select data-type><option value="all">All question types</option>${[...new Set(rows.map(row => row.type))].map(type =>
          `<option value="${esc(type)}"${typeFilter === type ? ' selected' : ''}>${esc(typeLabel(type))}</option>`).join('')}</select></label></div>
          <div class="test-history-table-wrap" role="region" aria-label="Test questions" tabindex="0"><table class="test-history-table"><caption class="test-history-sr">Select a question to review its answer and rationale</caption>
          <thead><tr><th scope="col">Status</th><th scope="col">Question / bank number / type</th><th scope="col">System / topic</th><th scope="col">Client Needs / category</th><th scope="col">Points / result</th><th scope="col">Review</th></tr></thead><tbody>
          ${filteredRows().map(row => `<tr><td><span class="test-history-badge ${row.status}">${labels[row.status]}</span></td><td>Question ${row.index + 1}<small>${esc(bankLabel(row))}</small><small>${esc(typeLabel(row.type))}</small></td>
          <td>${esc(row.system || 'Not recorded')}<small>${esc(row.topic || 'Topic not recorded')}</small></td><td>${esc(row.category || 'Not recorded')}</td>
          <td>${row.earned !== null && row.max > 0 ? `${row.earned} / ${row.max}` : labels[row.status]}</td>
          <td><button type="button" class="test-history-button" data-question="${row.index}">Review question ${row.index + 1}</button></td></tr>`).join('') || '<tr><td colspan="6">No questions match these filters.</td></tr>'}</tbody></table></div>`
          : `<p class="test-history-empty">${active.source === 'external' ? 'This is a saved external result. Question-level review is not available in the portal.' : 'Question details were not saved for this older test. Your recorded score is preserved above.'}</p>`}`;
    }
    async function open(entry) {
      active = entry;
      root.classList.add('test-history-detail');
      responseFilter = typeFilter = 'all';
      const token = ++requestId;
      content.innerHTML = '<p>Loading test review…</p><button type="button" class="test-history-back" data-back>← All previous tests</button>';
      try {
        const key = entry.source + ':' + entry.id;
        let loadedRows = cache.get(key), warning = '';
        if (!cache.has(key)) {
          let details = [];
          if (entry.source === 'practice') {
            const result = await db.from('student_supplemental_practice_results').select('answer_details')
              .eq('student_id', studentId).eq('id', entry.id).maybeSingle();
            if (result.error) throw result.error;
            if (!result.data) throw new Error('This saved test is no longer available to your account.');
            details = result.data.answer_details;
          } else if (entry.source === 'portal') {
            const result = await db.functions.invoke('diagnostic-assessment', { body: {
              action: 'review', attemptId: entry.id, clientProtocol: 'ngn-cat-v1',
              optionProtocol: 'sata-order-v1', mcqOptionProtocol: 'mcq-order-v1'
            } });
            if (result.error) throw result.error;
            if (result.data?.error) throw new Error(result.data.error);
            details = result.data?.responses;
          }
          loadedRows = detailRows(details);
          try {
            loadedRows = await resolveBankNumbers(db, loadedRows, entry.practiceKey);
            cache.set(key, loadedRows);
          } catch (error) {
            warning = error.message || 'Question bank numbers could not load. Please try again.';
          }
        }
        if (token !== requestId) return;
        rows = loadedRows;
        numberWarning = warning;
        renderDetails(); focus();
      } catch (error) {
        if (token !== requestId) return;
        content.innerHTML = `<button type="button" class="test-history-back" data-back>← All previous tests</button>
          <h2>${esc(entry.title)}</h2><p role="alert">This test review could not load: ${esc(error.message || 'Please try again.')}</p>
          <button type="button" class="test-history-button" data-retry>Retry review</button>`;
      }
    }
    function renderQuestion(index) {
      const row = rows[index];
      if (!row) return;
      current = index;
      const shown = filteredRows(), position = shown.indexOf(row);
      try {
        content.innerHTML = `<button type="button" class="test-history-back" data-summary>← Test results</button><h2 tabindex="-1" data-focus>Question ${index + 1} of ${rows.length}</h2>${numberNotice()}
          <p>${esc(bankLabel(row))} · ${esc(typeLabel(row.type))} · <span class="test-history-badge ${row.status}">${labels[row.status]}</span></p>
          <article class="test-history-question">${questionHtml(row)}</article><nav class="test-history-question-nav" aria-label="Question review navigation">
          <button type="button" class="test-history-button" data-prev${position <= 0 ? ' disabled' : ''}>Previous question</button>
          <span>${position + 1} of ${shown.length} in this view</span>
          <button type="button" class="test-history-button" data-next${position >= shown.length - 1 ? ' disabled' : ''}>Next question</button></nav>`;
        focus();
      } catch (error) {
        content.innerHTML = `<button type="button" class="test-history-back" data-summary>← Test results</button><p role="alert">This question could not be displayed: ${esc(error.message)}. Your saved results are unchanged.</p>`;
      }
    }
    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.hasAttribute('data-back')) { renderList(); root.querySelector('h1').focus(); }
      else if (button.hasAttribute('data-more')) void load();
      else if (button.hasAttribute('data-open')) {
        const entry = entries.find(entry => entry.source + ':' + entry.id === button.dataset.open);
        if (entry) void open(entry);
      } else if (button.hasAttribute('data-retry')) void open(active);
      else if (button.hasAttribute('data-summary')) { renderDetails(); focus(); }
      else if (button.hasAttribute('data-question')) renderQuestion(Number(button.dataset.question));
      else if (button.hasAttribute('data-prev') || button.hasAttribute('data-next')) {
        const shown = filteredRows(), position = shown.findIndex(row => row.index === current);
        const next = shown[position + (button.hasAttribute('data-next') ? 1 : -1)];
        if (next) renderQuestion(next.index);
      }
    });
    root.addEventListener('input', event => {
      if (event.target.matches('[data-search]')) {
        search = event.target.value;
        content.querySelector('tbody').innerHTML = listRows();
      }
    });
    root.addEventListener('change', event => {
      if (event.target.matches('[data-kind]')) { kind = event.target.value; renderList(); content.querySelector('[data-kind]').focus(); }
      if (event.target.matches('[data-response], [data-type]')) {
        const selector = event.target.matches('[data-response]') ? '[data-response]' : '[data-type]';
        responseFilter = content.querySelector('[data-response]').value;
        typeFilter = content.querySelector('[data-type]').value;
        renderDetails(); content.querySelector(selector).focus();
      }
    });
    void load();
  }
  window.StudentTestHistory = { init, detailRows, summary, questionHtml, resolveBankNumbers, bankLabel, typeLabel };
})();
