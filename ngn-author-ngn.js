(function () {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const types = ['mcq', 'sata', 'matrix', 'cloze', 'highlight', 'bowtie', 'fill', 'case'];
  const names = ['Single response', 'Multiple response / SATA', 'Matrix / grid', 'Drop-down cloze', 'Highlight findings', 'Bow-tie', 'Numeric response', 'Unfolding case'];
  const node = (tag, text, parent) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  };
  const id = () => crypto.randomUUID();
  function blank(type) {
    const item = { id: id(), type, stem: '', rationale: '', schemaVersion: 1, textFormat: 'plain', scoringVersion: 'ngn-v1' };
    if (type === 'mcq' || type === 'sata') Object.assign(item, { options: ['', ''], correct: [0] });
    if (type === 'matrix') Object.assign(item, { rows: [''], cols: ['', ''], correct: [] });
    if (type === 'cloze') Object.assign(item, { template: '{{0}}', dropdowns: [{ options: ['', ''], correct: 0 }] });
    if (type === 'highlight') item.segments = [{ id: id(), t: '', correct: false }];
    if (type === 'bowtie') Object.assign(item, { bowtie: { actions: ['', ''], conditions: [''], complications: ['', ''] }, correct: { actions: [0, 1], condition: 0, complications: [0, 1] } });
    if (type === 'fill') Object.assign(item, { correct: 0, tolerance: 0, unit: '' });
    if (type === 'case') {
      delete item.type;
      Object.assign(item, { kind: 'case', title: '', scenario: '', tabs: [], items: [blank('mcq')] });
    }
    return item;
  }
  function field(parent, label, value, update, kind = 'text') {
    const wrap = node('label', label, parent);
    const input = node(kind === 'textarea' ? 'textarea' : 'input', undefined, wrap);
    if (kind !== 'textarea') input.type = kind;
    if (kind === 'checkbox') input.checked = !!value;
    else input.value = value ?? '';
    input.addEventListener(kind === 'checkbox' ? 'change' : 'input', () => update(kind === 'checkbox' ? input.checked : kind === 'number' ? Number(input.value) : input.value));
    return input;
  }
  function select(parent, label, value, options, update) {
    const wrap = node('label', label, parent), input = node('select', undefined, wrap);
    options.forEach(([v, text]) => { const option = node('option', text, input); option.value = v; });
    input.value = String(value);
    let previous = input.value;
    input.onchange = () => {
      if (update(input.value) === false) input.value = previous;
      else previous = input.value;
    };
    return input;
  }
  function button(parent, text, action) {
    const b = node('button', text, parent);
    b.type = 'button'; b.className = 'button secondary'; b.onclick = action;
    return b;
  }
  function list(parent, title, values, create, render, onRemove = () => {}) {
    const section = node('fieldset', undefined, parent);
    node('legend', title, section);
    const rows = node('div', undefined, section);
    const draw = () => {
      rows.replaceChildren();
      values.forEach((v, i) => {
        const row = node('fieldset', undefined, rows);
        node('legend', `${title} ${i + 1}`, row);
        render(row, v, i);
        button(row, 'Remove', () => { values.splice(i, 1); onRemove(i); draw(); });
      });
    };
    button(section, `Add ${title.toLowerCase()}`, () => { values.push(create()); draw(); });
    draw();
  }
  function strings(parent, title, values, onRemove) {
    list(parent, title, values, () => '', (row, value, i) => field(row, 'Text', value, v => { values[i] = v; }), onRemove);
  }
  function answers(parent, item, single) {
    list(parent, 'Answer option', item.options, () => '', (row, value, i) => {
      field(row, 'Text', value, v => { item.options[i] = v; });
      field(row, single ? 'Correct (choose exactly one option)' : 'Correct', item.correct.includes(i), checked => {
        item.correct = checked ? [...new Set([...item.correct, i])] : item.correct.filter(n => n !== i);
      }, 'checkbox');
    }, removed => { item.correct = item.correct.filter(n => n !== removed).map(n => n > removed ? n - 1 : n); });
  }
  function chartEditor(parent, tabs) {
    node('p', 'Use date and time for each entry. "Available from item" controls when new information appears; earlier entries remain visible. Selectable finding IDs link chart cells to highlight answers.', parent);
    list(parent, 'Clinical record tab', tabs, () => ({ id: id(), label: '', fromItem: 1, columns: ['Finding'], entries: [] }), (row, tab) => {
      field(row, 'Tab label', tab.label, v => { tab.label = v; });
      field(row, 'Available from item', tab.fromItem || 1, v => { tab.fromItem = v; }, 'number');
      if (!tab.entries) {
        node('p', 'Existing formatted chart is preserved. Add a new record tab for timestamped entries. Editing this tab does not convert or remove its content.', row);
        return;
      }
      strings(row, 'Column heading', tab.columns);
      list(row, 'Timestamped entry', tab.entries, () => ({ at: '', fromItem: 1, cells: tab.columns.map(() => ({ t: '' })) }), (entryRow, entry) => {
        field(entryRow, 'Date / time', entry.at, v => { entry.at = v; }, 'datetime-local');
        field(entryRow, 'Available from item', entry.fromItem || 1, v => { entry.fromItem = v; }, 'number');
        list(entryRow, 'Cell', entry.cells, () => ({ t: '' }), (cellRow, cell, index) => {
          if (typeof cell === 'string') cell = entry.cells[index] = { t: cell };
          field(cellRow, `Text (${tab.columns[index] || 'add matching heading'})`, cell.t, v => { cell.t = v; }, 'textarea');
          const finding = field(cellRow, 'Selectable finding ID (leave blank for ordinary text)', cell.id || '', v => { cell.id = v; });
          button(cellRow, 'Assign selectable finding ID', () => { cell.id = cell.id || id(); finding.value = cell.id; });
        });
      });
    });
  }
  function itemEditor(parent, item, chartTabs, child = false) {
    const type = item.kind === 'case' ? 'case' : item.type;
    if (!types.includes(type)) throw new Error('The interaction needs a supported question type before it can be edited.');
    const clinicalRecord = !['mcq', 'sata'].includes(type) || !!item.tabs?.length || !!item.scoringVersion;
    const ngn = child || clinicalRecord || !!item.scoring;
    if (child) field(parent, 'Question', item.prompt || item.stem || '', v => { item.prompt = v; }, 'textarea');
    if (type === 'case') {
      field(parent, 'Client scenario', item.scenario, v => { item.scenario = v; }, 'textarea');
      item.tabs = item.tabs || [];
      chartEditor(parent, item.tabs);
      list(parent, 'Case question', item.items, () => blank('mcq'), (row, it) => {
        const controls = node('div', undefined, row);
        select(row, 'Question type', it.type, types.filter(t => t !== 'case').map(t => [t, names[types.indexOf(t)]]), value => {
          if (!confirm('Changing this question type clears its current interaction and answer key. Continue?')) return false;
          const next = blank(value);
          Object.assign(next, { id: it.id, prompt: it.prompt || it.stem, rationale: it.rationale });
          if (!it.textFormat) delete next.textFormat;
          Object.keys(it).forEach(key => delete it[key]); Object.assign(it, next);
          controls.replaceChildren(); itemEditor(controls, it, item.tabs, true);
        });
        itemEditor(controls, it, item.tabs, true);
      });
      return;
    }
    if (!child) {
      item.tabs = item.tabs || [];
      chartEditor(parent, item.tabs);
      chartTabs = item.tabs;
    }
    if (child) field(parent, 'Rationale', item.rationale, v => { item.rationale = v; }, 'textarea');
    if (ngn) {
      select(parent, 'Scoring version (requires review before CAT eligibility)', item.scoringVersion || 'legacy',
        [['legacy', 'Legacy shared practice scoring'], ['ngn-v1', 'NGN v1: type-specific points and server-scored CAT']], value => {
          if (value === 'legacy') delete item.scoringVersion;
          else item.scoringVersion = value;
        });
      const scoring = type === 'mcq' || type === 'fill' ? 'All or nothing' : type === 'matrix' && item.scoringVersion ? 'Per-row zero/one (single) or plus/minus (multiple)' : type === 'sata' || type === 'highlight' || type === 'matrix' ? 'Plus/minus partial credit' : 'Per-choice zero/one partial credit';
      select(parent, 'Scoring rule', item.scoring || 'legacy', [['legacy', scoring], ['zero-one', 'All or nothing for this item']], v => {
        if (v === 'legacy') delete item.scoring; else item.scoring = v;
      });
    }
    if (type === 'mcq' || type === 'sata') answers(parent, item, type === 'mcq');
    if (type === 'matrix') {
      select(parent, 'Selections per matrix row', item.responseMode || 'multiple', [['multiple', 'Multiple selections'], ['single', 'One selection']], v => { item.responseMode = v; });
      select(parent, 'Multiple-response scoring groups (NGN v1 only)', item.scoringAxis || 'column',
        [['column', 'Independent columns (Matrix MR)'], ['row', 'Independent rows (Response grouping)']], v => { item.scoringAxis = v; });
      const removeAxis = (axis, removed) => {
        item.correct = item.correct.map(k => k.split(':').map(Number)).filter(pair => pair[axis] !== removed).map(pair => {
          if (pair[axis] > removed) pair[axis]--;
          return pair.join(':');
        });
        drawGrid();
      };
      strings(parent, 'Matrix row', item.rows, removed => removeAxis(0, removed));
      strings(parent, 'Matrix column', item.cols, removed => removeAxis(1, removed));
      const grid = node('div', undefined, parent);
      const drawGrid = () => {
        grid.replaceChildren();
        item.rows.forEach((text, ri) => {
          const row = node('fieldset', undefined, grid); node('legend', text || `Row ${ri + 1}`, row);
          item.cols.forEach((col, ci) => field(row, col || `Column ${ci + 1}`, item.correct.includes(`${ri}:${ci}`), checked => {
            const key = `${ri}:${ci}`;
            if (checked) item.correct = [...new Set([...item.correct, key])];
            else item.correct = item.correct.filter(k => k !== key);
          }, 'checkbox'));
        });
      };
      button(parent, 'Refresh answer grid after editing rows / columns', drawGrid);
      drawGrid();
    }
    if (type === 'cloze') {
      node('p', 'Each drop-down is scored independently. Linked rationale pairs and triads require a different scoring format and are not supported here.', parent);
      field(parent, 'Sentence with drop-down markers {{0}}, {{1}}, etc.', item.template, v => { item.template = v; }, 'textarea');
      list(parent, 'Drop-down', item.dropdowns, () => ({ options: ['', ''], correct: 0 }), (row, d, i) => {
        node('p', `Place {{${i}}} in the sentence.`, row);
        strings(row, 'Choice', d.options);
        field(row, 'Correct choice number (1-based)', d.correct + 1, v => { d.correct = v - 1; }, 'number');
      });
    }
    if (type === 'highlight') {
      field(parent, 'Select findings within the clinical chart instead of a separate note', item.chartSelections, v => { item.chartSelections = v; }, 'checkbox');
      node('p', 'For chart highlighting, use the same finding ID as the chart cell. Only IDs listed here are clickable for this question. Leave an ID blank to include ordinary note text. Tick Correct only for keyed findings.', parent);
      list(parent, 'Finding', item.segments, () => ({ id: id(), t: '', correct: false }), (row, s) => {
        const findingId = field(row, 'Finding ID', s.id || '', v => { s.id = v; });
        const findingText = field(row, 'Finding text', s.t, v => { s.t = v; }, 'textarea');
        const choices = node('div', undefined, row);
        button(row, 'Choose a selectable chart cell', () => {
          choices.replaceChildren();
          const cells = (chartTabs || []).flatMap(tab => (tab.entries || []).flatMap(e => e.cells.filter(c => c.id).map(c => [c.id, `${tab.label} / ${e.at}: ${c.t}`])));
          if (!cells.length) { node('p', 'First assign a selectable finding ID to a clinical chart cell above.', choices); return; }
          select(choices, 'Chart finding', '', [['', 'Choose finding'], ...cells], value => {
            const cell = (chartTabs || []).flatMap(t => (t.entries || []).flatMap(e => e.cells)).find(c => c.id === value);
            if (cell) { s.id = cell.id; s.t = cell.t; findingId.value = s.id; findingText.value = s.t; }
          });
        });
        field(row, 'Correct', s.correct, v => { s.correct = v; }, 'checkbox');
        field(row, 'Finding rationale (shown after answering)', s.rationale || '', v => { s.rationale = v; }, 'textarea');
      });
    }
    if (type === 'bowtie') {
      for (const [key, title] of [['actions', 'Action'], ['conditions', 'Condition'], ['complications', 'Parameter / complication']]) {
        let correctInput;
        strings(parent, title, item.bowtie[key], removed => {
          if (key === 'conditions') {
            if (item.correct.condition === removed) item.correct.condition = null;
            else if (item.correct.condition > removed) item.correct.condition--;
          } else item.correct[key] = item.correct[key].filter(n => n !== removed).map(n => n > removed ? n - 1 : n);
          const selected = key === 'conditions' ? [item.correct.condition] : item.correct[key];
          correctInput.value = selected.filter(n => n !== null).map(n => n + 1).join(', ');
        });
        const value = key === 'conditions' ? [item.correct.condition] : item.correct[key];
        correctInput = field(parent, `Correct ${title.toLowerCase()} number${key === 'conditions' ? '' : 's (exactly two)'}, 1-based`,
          value.map(n => n + 1).join(', '), v => {
            const nums = v.split(',').filter(s => s.trim()).map(s => Number(s) - 1);
            if (key === 'conditions') item.correct.condition = nums[0];
            else item.correct[key] = nums;
          });
      }
    }
    if (type === 'fill') {
      field(parent, 'Correct numeric answer', item.correct, v => { item.correct = v; }, 'number');
      field(parent, 'Allowed tolerance', item.tolerance || 0, v => { item.tolerance = v; }, 'number');
      field(parent, 'Unit', item.unit, v => { item.unit = v; });
    }
  }
  function validate(item, inheritedTabs, stage = 1) {
    const fail = message => { throw new Error(message); };
    const text = v => typeof v === 'string' && !!v.trim();
    const positive = v => Number.isInteger(v) && v >= 1;
    const options = a => Array.isArray(a) && a.length > 0 && a.every(text);
    const indices = (a, length, count) => Array.isArray(a) && a.length > 0 && (count === undefined || a.length === count) && new Set(a).size === a.length && a.every(n => Number.isInteger(n) && n >= 0 && n < length);
    if (!text(item.id)) fail('Every item needs its existing stable ID.');
    const tabs = inheritedTabs || item.tabs || [];
    const cellIds = tabs.flatMap(t => (t.entries || []).flatMap(e => e.cells.filter(c => c.id).map(c => c.id)));
    if (new Set(cellIds).size !== cellIds.length) fail('Selectable chart cell IDs must be unique across timestamps and tabs.');
    if (new Set(tabs.map(t => t.id)).size !== tabs.length) fail('Clinical tab IDs must be unique.');
    tabs.forEach(tab => {
      if (!text(tab.id) || !text(tab.label) || !positive(tab.fromItem ?? 1)) fail('Each clinical tab needs an ID, label, and positive item number.');
      if (!tab.entries) return;
      if (!options(tab.columns)) fail('Add clinical chart column headings.');
      tab.entries.forEach(e => {
        if (!text(e.at) || !Number.isFinite(Date.parse(e.at)) || !positive(e.fromItem ?? 1)) fail('Each chart entry needs a valid date/time and positive item number.');
        if (e.cells.length !== tab.columns.length || e.cells.some(c => !text(typeof c === 'string' ? c : c.t))) fail('Every chart entry must have one nonempty cell per column.');
      });
    });
    if (item.kind === 'case') {
      if (!text(item.scenario) || !item.items.length) fail('A case needs a scenario and at least one question.');
      if (new Set(item.items.map(it => it.id)).size !== item.items.length) fail('Case question IDs must be unique.');
      if (tabs.some(t => (t.fromItem || 1) > item.items.length || t.entries?.some(e => (e.fromItem || 1) > item.items.length))) fail('Clinical information cannot be released after the last case question.');
      item.items.forEach((it, i) => validate(it, tabs, i + 1));
      return item;
    }
    if (!text(item.prompt || item.stem) || !text(item.rationale)) fail('Every question needs question text and a rationale.');
    if (item.scoring && item.scoring !== 'zero-one') fail('Unsupported scoring rule; use existing partial credit or all-or-nothing.');
    if (item.type === 'mcq' || item.type === 'sata') {
      if (!options(item.options) || !indices(item.correct, item.options.length, item.type === 'mcq' ? 1 : undefined)) fail('Enter answer choices and valid correct option numbers.');
    } else if (item.type === 'matrix') {
      if (!options(item.rows) || !options(item.cols) || !item.correct.length || new Set(item.correct).size !== item.correct.length || item.correct.some(k => !/^\d+:\d+$/.test(k) || +k.split(':')[0] >= item.rows.length || +k.split(':')[1] >= item.cols.length)) fail('Enter matrix rows, columns, and valid correct cell coordinates.');
      if (item.responseMode === 'single' && item.rows.some((_, i) => item.correct.filter(k => k.startsWith(`${i}:`)).length !== 1)) fail('A single-selection matrix needs exactly one correct cell in each row.');
      if (item.scoringAxis && !['row', 'column'].includes(item.scoringAxis)) fail('Matrix scoring groups must be rows or columns.');
    } else if (item.type === 'cloze') {
      const markers = [...item.template.matchAll(/\{\{(\d+)\}\}/g)].map(m => +m[1]);
      if (!item.dropdowns.length || markers.length !== item.dropdowns.length || item.dropdowns.some((d, i) => !markers.includes(i) || !options(d.options) || !indices([d.correct], d.options.length))) fail('Each drop-down needs choices, a correct choice, and one matching sentence marker.');
    } else if (item.type === 'highlight') {
      const selectable = item.segments.filter(s => s.id);
      if (!selectable.length || !selectable.some(s => s.correct) || selectable.some(s => !text(s.id) || !text(s.t)) || new Set(selectable.map(s => s.id)).size !== selectable.length) fail('Highlight questions need unique finding IDs, text, and at least one correct finding.');
      if (item.chartSelections) {
        const cells = tabs.filter(t => (t.fromItem || 1) <= stage).flatMap(t => (t.entries || []).filter(e => (e.fromItem || 1) <= stage).flatMap(e => e.cells));
        if (selectable.some(s => !cells.some(c => c.id === s.id && c.t === s.t))) fail("Every selectable finding must match an available chart cell ID and text at this question's stage.");
      }
    } else if (item.type === 'bowtie') {
      if (!['actions', 'conditions', 'complications'].every(k => options(item.bowtie[k])) || !indices(item.correct.actions, item.bowtie.actions.length, 2) || !indices([item.correct.condition], item.bowtie.conditions.length, 1) || !indices(item.correct.complications, item.bowtie.complications.length, 2)) fail('Bow-tie needs two correct actions, one condition, and two parameters, all matching valid choices.');
    } else if (item.type === 'fill') {
      if (!Number.isFinite(item.correct) || !Number.isFinite(item.tolerance || 0) || (item.tolerance || 0) < 0) fail('Enter a numeric answer and a nonnegative tolerance.');
    } else fail('Unsupported question type.');
    if (!inheritedTabs && tabs.some(t => (t.fromItem || 1) > 1 || t.entries?.some(e => (e.fromItem || 1) > 1))) fail('Standalone records must be available from item 1.');
    return item;
  }
  function metadata(root, source) {
    const value = copy(source);
    value.option_rationales = value.option_rationales || {};
    value.reference_list = value.reference_list || [];
    field(root, 'Clinical judgment skill', value.clinical_judgment_skill || '', v => { value.clinical_judgment_skill = v; });
    const rationales = Object.entries(value.option_rationales).map(([key, text]) => ({ key, text }));
    list(root, 'Option rationale', rationales, () => ({ key: '', text: '' }), (row, r) => {
      field(row, 'Option key (retain existing keys)', r.key, v => { r.key = v; });
      field(row, 'Rationale', r.text, v => { r.text = v; }, 'textarea');
    });
    list(root, 'Reference', value.reference_list, () => ({ title: '', url: '' }), (row, ref) => {
      field(row, 'Title', ref.title, v => { ref.title = v; });
      field(row, 'URL', ref.url, v => { ref.url = v; }, 'url');
    });
    return { read() {
      if (rationales.some(r => !r.key.trim() || !r.text.trim()) || new Set(rationales.map(r => r.key)).size !== rationales.length) throw new Error('Each option rationale needs a unique key and text.');
      if (value.reference_list.some(ref => !ref.title.trim() || !/^https?:\/\/\S+$/i.test(ref.url))) throw new Error('Each reference needs a title and an http(s) URL.');
      return { clinical_judgment_skill: value.clinical_judgment_skill || null, option_rationales: Object.fromEntries(rationales.map(r => [r.key, r.text])), reference_list: copy(value.reference_list) };
    } };
  }
  function mount(root, source, getFields = () => ({}), options = {}) {
    const item = copy(source);
    root.classList.add('ngn-author');
    if (options.recordOnly) {
      item.tabs = item.tabs || [];
      chartEditor(root, item.tabs);
    } else itemEditor(root, item);
    const error = node('p', '', root); error.setAttribute('role', 'alert');
    const warning = node('p', '', root); warning.setAttribute('role', 'status');
    const read = () => {
      const value = Object.assign(copy(item), getFields());
      if (!options.recordOnly || value.tabs.length) validate(value);
      if (!source.tabs && value.tabs?.length === 0) delete value.tabs;
      warning.textContent = window.OptionPresentation?.warnings([value]).join(' ') || '';
      return value;
    };
    root.addEventListener('change', () => { warning.textContent = window.OptionPresentation?.warnings([item]).join(' ') || ''; });
    warning.textContent = window.OptionPresentation?.warnings([item]).join(' ') || '';
    button(root, 'Preview as student', () => {
      try {
        const entry = read(), host = node('div', undefined, document.body);
        const close = () => host.remove();
        new ExamUI.Exam(host, { title: 'Student preview - unpublished', items: ExamUI.prepare([entry], { shuffleOptions: false }), showTimer: false, instant: true, noFeedback: true, onExit: close, onFinish: close });
        error.textContent = '';
      } catch (e) { error.textContent = e.message; }
    });
    return { read };
  }
  window.NGNAuthor = { mount, metadata, blank, validate, types, names };
})();
