(function () {
  'use strict';
  const states = new Map();
  const text = value => String(value ?? '');
  const esc = value => text(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fields = [['category', 'Client Needs', 'nclex_category'], ['area', 'Study Area', 'study_area'], ['type', 'Question type', 'item_type'], ['status', 'Review status', 'viewStatus']];
  const statusOf = (q, reviews) => q.archived_at ? 'Archived' : q.active ? 'Published' : q.source_key?.startsWith('qbank-bulk-')
    ? ({ approved: 'Approved', published: 'Previously published' }[reviews.get(q.source_key)?.status] || 'Draft') : 'Inactive';
  function matches(q, state) {
    return fields.every(([key, , field]) => !state[key] || text(q[field] || (key === 'type' ? 'mcq' : '')) === state[key]) &&
      (!state.search || [q.stem, q.topic, q.nclex_category, q.study_area, q.question_no, q.question_no != null ? `Q-${String(q.question_no).padStart(4, '0')}` : '', q.id].map(text).join(' ').toLowerCase().includes(state.search.toLowerCase()));
  }
  function compare(a, b, sort) {
    const number = q => Number.isFinite(Number(q.question_no)) && q.question_no != null ? Number(q.question_no) : null;
    const date = q => q.created_at ? Date.parse(q.created_at) : NaN;
    if (sort === 'newest' || sort === 'oldest') {
      const left = date(a), right = date(b);
      if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return (left - right) * (sort === 'newest' ? -1 : 1);
      if (Number.isFinite(left) !== Number.isFinite(right)) return Number.isFinite(left) ? -1 : 1;
    }
    if (['number-asc', 'number-desc', 'newest', 'oldest'].includes(sort)) {
      const left = number(a), right = number(b);
      if (left !== null && right !== null && left !== right) return (left - right) * (['newest', 'number-desc'].includes(sort) ? -1 : 1);
      if ((left === null) !== (right === null)) return left === null ? 1 : -1;
    }
    if (sort === 'stem') return text(a.stem).localeCompare(text(b.stem)) || text(a.id).localeCompare(text(b.id));
    return 0;
  }
  function mount(id, questions, changed, { staged = false, search = true } = {}) {
    const root = document.getElementById(id);
    if (!root) return {};
    if (!states.has(id)) states.set(id, { sort: 'original' });
    const state = states.get(id);
    const signature = JSON.stringify(fields.map(([key, , field]) => [...new Set(questions.map(q => text(q[field] || (key === 'type' ? 'mcq' : ''))))].sort()));
    if (root.dataset.ready === signature) return state;
    const sorts = staged ? [['original', 'File order'], ['stem', 'Question text A–Z']] :
      [['original', 'Default order'], ['newest', 'Newest first'], ['oldest', 'Oldest first'], ['number-asc', 'Question number: low to high'], ['number-desc', 'Question number: high to low'], ['stem', 'Question text A–Z']];
    root.innerHTML = `<div class="qbank-view-controls">${search ? `<label>Search this view<input type="search" data-view="search" value="${esc(state.search || '')}" placeholder="Question number, text, or topic"></label>` : ''}${fields.map(([key, label, field]) => {
      const values = [...new Set(questions.map(q => text(q[field] || (key === 'type' ? 'mcq' : ''))).filter(Boolean))].sort();
      if (state[key] && !values.includes(state[key])) values.push(state[key]);
      return `<label>${label}<select data-view="${key}"><option value="">All</option>${values.map(value => `<option value="${esc(value)}"${state[key] === value ? ' selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`;
    }).join('')}<label>Sort by<select data-view="sort">${sorts.map(([value, label]) => `<option value="${value}"${state.sort === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label><button class="button secondary" type="button" data-view-reset>Reset filters</button></div><p class="count" data-view-count role="status" aria-live="polite"></p>${staged ? '<p class="rationale">Unsaved items have no creation date or bank question number yet. Sorting preserves file order unless changed here. Filters hide cards only; saving includes every retained item, which must be reviewed.</p>' : ''}`;
    root.dataset.ready = signature;
    root.querySelectorAll('[data-view]').forEach(control => {
      control.addEventListener(control.type === 'search' ? 'input' : 'change', () => {
        state[control.dataset.view] = control.value;
        changed();
      });
    });
    root.querySelector('[data-view-reset]').addEventListener('click', () => {
      states.set(id, { sort: 'original' });
      delete root.dataset.ready;
      changed();
    });
    return state;
  }
  function refresh(id) {
    const root = document.getElementById(id);
    if (root) delete root.dataset.ready;
  }
  function reset(id) {
    states.set(id, { sort: 'original' });
    refresh(id);
  }
  function count(id, shown, total, noun = 'questions') {
    const node = document.getElementById(id)?.querySelector('[data-view-count]');
    if (node) node.textContent = `${shown} of ${total} ${noun} match this view.`;
  }
  window.QBankViews = { matches, compare, mount, refresh, reset, count, statusOf };
})();
