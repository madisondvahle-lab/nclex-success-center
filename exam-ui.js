/* Shared NCLEX-style exam engine (vanilla JS). Pair with exam-ui.css.
   Item types: mcq, sata, fill, matrix, cloze, highlight.
   Bank entries are either a standalone item or { kind:'case', ... items:[...] }. */
(function () {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const ICON = {
    notes: ico('<rect x="4" y="3" width="14" height="14" rx="2"/><path d="M7 20h11a2 2 0 0 0 2-2V8"/>'),
    calc: ico('<rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M6 9h12"/>'),
    feedback: ico('<path d="M4 5h16v11H11l-5 4v-4H4z"/>'),
    expand: ico('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
    help: ico('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.5"/>'),
    gear: ico('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>'),
    flag: ico('<path d="M5 21V4l13 3-3 4 3 4-13-3"/>')
  };

  function shuffle(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    return r;
  }

  function shuffleItemOptions(it) {
    if (!it.options || !(it.type === 'mcq' || it.type === 'sata')) return it;
    const order = shuffle(it.options.map((_, i) => i));
    return Object.assign({}, it, {
      options: order.map(i => it.options[i]),
      correct: it.correct.map(c => order.indexOf(c)).sort((a, b) => a - b)
    });
  }

  // Chooses entries for a requested item count, spread evenly across topics.
  // The case study is kept whole and only used when the count has room for it.
  function pickEntries(bank, count) {
    const total = bank.reduce((n, e) => n + (e.kind === 'case' ? e.items.length : 1), 0);
    if (!count || count >= total) return bank;
    const cases = bank.filter(e => e.kind === 'case');
    const useCase = cases.length && count >= 20 ? cases[0] : null;
    const need = count - (useCase ? useCase.items.length : 0);
    const buckets = {};
    shuffle(bank.filter(e => e.kind !== 'case')).forEach(e => { (buckets[e.topic] = buckets[e.topic] || []).push(e); });
    const lists = shuffle(Object.keys(buckets)).map(k => buckets[k]), chosen = [];
    while (chosen.length < need && lists.some(l => l.length)) lists.forEach(l => { if (l.length && chosen.length < need) chosen.push(l.shift()); });
    return bank.filter(e => chosen.includes(e) || e === useCase);
  }

  // Flattens the bank into a linear list of renderable items.
  function prepare(bank, opts) {
    const o = Object.assign({ shuffleOptions: true }, opts);
    const out = [];
    bank = pickEntries(bank, o.count);
    bank.forEach(entry => {
      if (entry.kind === 'case') {
        const total = entry.items.length;
        const cs = { id: entry.id, title: entry.title, scenario: entry.scenario, tabs: entry.tabs, banner: entry.banner, total };
        entry.items.forEach((it, idx) => {
          out.push(Object.assign({ category: entry.category, topic: entry.topic, difficulty: entry.difficulty, ngn: true }, it, { qid: it.id, case: cs, caseIndex: idx }));
        });
      } else {
        const it = o.shuffleOptions ? shuffleItemOptions(entry) : entry;
        out.push(Object.assign({}, it, { qid: it.id }));
      }
    });
    return out;
  }

  function emptyAnswer(it) {
    if (it.type === 'mcq') return null;
    if (it.type === 'fill') return '';
    if (it.type === 'cloze') return it.dropdowns.map(() => null);
    return [];
  }

  function setScore(chosen, correct) {
    const hits = chosen.filter(x => correct.includes(x)).length;
    const wrong = chosen.length - hits;
    const score = Math.max(0, (hits - wrong) / correct.length);
    return { score, full: hits === correct.length && wrong === 0 };
  }

  // Returns { score: 0..1, full: bool } for one item.
  function score(it, a) {
    switch (it.type) {
      case 'mcq': { const ok = a !== null && it.correct[0] === a; return { score: ok ? 1 : 0, full: ok }; }
      case 'sata': return setScore(a, it.correct);
      case 'fill': {
        const n = parseFloat(String(a).replace(/,/g, ''));
        const ok = !isNaN(n) && Math.abs(n - it.correct) <= (it.tolerance || 0);
        return { score: ok ? 1 : 0, full: ok };
      }
      case 'matrix': return setScore(a, it.correct);
      case 'highlight': return setScore(a, it.segments.filter(s => s.correct).map(s => s.id));
      case 'cloze': {
        const n = it.dropdowns.filter((d, i) => a[i] === d.correct).length;
        return { score: n / it.dropdowns.length, full: n === it.dropdowns.length };
      }
    }
    return { score: 0, full: false };
  }

  function isAnswered(it, a) {
    if (it.type === 'mcq') return a !== null;
    if (it.type === 'fill') return String(a).trim() !== '';
    if (it.type === 'cloze') return a.every(x => x !== null);
    return a.length > 0;
  }

  // Static review markup for results screens.
  function reviewHtml(it, a) {
    const li = (cls, mark, txt) => `<li class="${cls}"><span class="m">${mark}</span><span>${txt}</span></li>`;
    if (it.type === 'mcq' || it.type === 'sata') {
      const sel = it.type === 'mcq' ? (a === null ? [] : [a]) : a;
      return '<ul class="ex-rv">' + it.options.map((t, i) => {
        const isC = it.correct.includes(i), isS = sel.includes(i);
        if (isC && isS) return li('good', '✓', esc(t));
        if (isC) return li('miss', '○', esc(t) + ' <em>(correct answer)</em>');
        if (isS) return li('bad', '✗', esc(t) + ' <em>(selected)</em>');
        return li('', '', esc(t));
      }).join('') + '</ul>';
    }
    if (it.type === 'fill') return `<ul class="ex-rv">${li(score(it, a).full ? 'good' : 'bad', score(it, a).full ? '✓' : '✗', 'Entered: ' + esc(a || '(blank)'))}${li('', '', 'Correct: ' + esc(it.correct) + ' ' + esc(it.unit || ''))}</ul>`;
    if (it.type === 'cloze') return '<ul class="ex-rv">' + it.dropdowns.map((d, i) => {
      const ok = a[i] === d.correct;
      return li(ok ? 'good' : 'bad', ok ? '✓' : '✗', `Selected: ${esc(a[i] === null ? '(none)' : d.options[a[i]])}${ok ? '' : ' — Correct: ' + esc(d.options[d.correct])}`);
    }).join('') + '</ul>';
    if (it.type === 'matrix') {
      const rows = [];
      it.rows.forEach((r, ri) => it.cols.forEach((c, ci) => {
        const k = ri + ':' + ci, isC = it.correct.includes(k), isS = a.includes(k);
        if (isC && isS) rows.push(li('good', '✓', esc(r) + ' → ' + esc(c)));
        else if (isC) rows.push(li('miss', '○', esc(r) + ' → ' + esc(c) + ' <em>(missed)</em>'));
        else if (isS) rows.push(li('bad', '✗', esc(r) + ' → ' + esc(c) + ' <em>(not consistent)</em>'));
      }));
      return '<ul class="ex-rv">' + rows.join('') + '</ul>';
    }
    if (it.type === 'highlight') return '<ul class="ex-rv">' + it.segments.filter(s => s.id).map(s => {
      const isC = !!s.correct, isS = a.includes(s.id);
      if (isC && isS) return li('good', '✓', esc(s.t));
      if (isC) return li('miss', '○', esc(s.t) + ' <em>(missed)</em>');
      if (isS) return li('bad', '✗', esc(s.t) + ' <em>(highlighted, not an indicator)</em>');
      return '';
    }).join('') + '</ul>';
    return '';
  }

  class Exam {
    constructor(root, opts) {
      this.root = root; this.o = opts; this.items = opts.items; this.i = 0;
      this.ans = this.items.map(emptyAnswer);
      this.struck = this.items.map(() => new Set());
      this.marked = this.items.map(() => false);
      this.time = this.items.map(() => 0);
      this.changes = this.items.map(() => 0);
      this.fb = this.items.map(() => '');
      this.checked = this.items.map(() => false);
      this.tab = {}; this.notes = ''; this.elapsed = 0; this.fs = 1;
      this.remaining = opts.seconds || null; this.done = false;
      this.build(); this.show(0);
      this.timer = setInterval(() => this.tick(), 1000);
    }

    build() {
      const r = this.root;
      r.innerHTML = `<div class="ex-app" data-fs="1" role="application" aria-label="Practice assessment">
        <header class="ex-header"><span class="ex-title">${esc(this.o.title)}</span><span class="ex-qid"></span>
          <span class="ex-meta"><div>${this.remaining === null ? 'Time Elapsed' : 'Time Remaining'}<b class="ex-time">--:--</b></div><div>Question<b class="ex-qn"></b></div></span></header>
        <div class="ex-toolbar"><div class="ex-tools">
          <button class="ex-tb" data-a="notes">${ICON.notes}<span><span class="u">N</span>otes</span></button>
          <button class="ex-tb" data-a="calc">${ICON.calc}<span>Calc<span class="u">u</span>lator</span></button>
          ${this.o.noFeedback ? '' : `<button class="ex-tb" data-a="fb">${ICON.feedback}<span><span class="u">F</span>eedback</span></button>`}</div>
          <div class="ex-tools"><button class="ex-tb" data-a="expand" title="Full screen" aria-label="Full screen">${ICON.expand}</button>
          <button class="ex-tb" data-a="help" title="Help" aria-label="Help">${ICON.help}</button>
          <button class="ex-tb" data-a="gear" title="Text size" aria-label="Text size">${ICON.gear}</button>
          <button class="ex-tb" data-a="mark">${ICON.flag}<span class="ex-mark-l">Mark for Review</span></button></div></div>
        <main class="ex-main"></main>
        <footer class="ex-footer"><div class="grp"><button class="ex-fb" data-a="exit">Exit</button></div>
          <div class="grp"><button class="ex-fb" data-a="prev">◀ Previous</button><button class="ex-fb" data-a="nav">Navigator</button><button class="ex-fb" data-a="next">Next ▶</button></div></footer></div>`;
      this.app = r.querySelector('.ex-app'); this.main = r.querySelector('.ex-main');
      this.app.addEventListener('click', e => this.onClick(e));
      this.app.addEventListener('change', e => this.onChange(e));
      this.app.addEventListener('input', e => this.onInput(e));
      this.app.addEventListener('contextmenu', e => { const row = e.target.closest('.ex-opt[data-i]'); if (row && !row.closest('.ex-matrix')) { e.preventDefault(); this.toggleStrike(+row.dataset.i); } });
      let pressTimer = null;
      this.app.addEventListener('pointerdown', e => {
        const row = e.target.closest('.ex-opt[data-i]');
        if (row && e.pointerType === 'touch') pressTimer = setTimeout(() => { this.toggleStrike(+row.dataset.i); pressTimer = null; }, 550);
      });
      ['pointerup', 'pointermove', 'pointercancel'].forEach(t => this.app.addEventListener(t, () => { clearTimeout(pressTimer); }));
      this.keyHandler = e => { if (!this.done && e.key === 'Escape') { const m = document.querySelector('.ex-modal-bg'); if (m) m.remove(); } };
      document.addEventListener('keydown', this.keyHandler);
    }

    get it() { return this.items[this.i]; }

    tick() {
      if (this.done) return;
      this.elapsed++; this.time[this.i]++;
      if (this.remaining !== null && this.elapsed >= this.remaining) { this.finish(true); return; }
      this.paintClock();
    }

    paintClock() {
      const sec = this.remaining === null ? this.elapsed : Math.max(0, this.remaining - this.elapsed);
      const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
      this.root.querySelector('.ex-time').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    show(i) {
      this.i = i; const it = this.it;
      this.root.querySelector('.ex-qid').textContent = 'QId: ' + it.qid;
      this.root.querySelector('.ex-qn').textContent = `${i + 1} of ${this.items.length}`;
      this.root.querySelector('[data-a=prev]').disabled = i === 0;
      const nx = this.root.querySelector('[data-a=next]'), last = i === this.items.length - 1;
      nx.innerHTML = this.o.instant && !this.checked[i] ? 'Check answer ▶' : last ? 'Finish ▶' : 'Next ▶';
      this.paintClock();
      this.renderMark(); this.main.className = 'ex-main' + (it.case ? ' split' : '');
      const body = it.case ? this.leftPane(it) + `<section class="ex-pane ex-right">${this.answerUi(it)}</section>` : `<section class="ex-pane">${this.answerUi(it)}</section>`;
      this.main.innerHTML = body; this.main.scrollTop = 0;
      this.main.classList.toggle('locked', !!this.checked[i]);
      if (this.checked[i]) this.main.querySelector('.ex-pane:last-child').insertAdjacentHTML('beforeend', this.feedbackHtml(it, i));
      this.main.querySelectorAll('.ex-pane').forEach(p => p.scrollTop = 0);
    }

    // Practice mode: shows correctness and the rationale once the learner checks an answer.
    feedbackHtml(it, i) {
      const r = score(it, this.ans[i]);
      return `<div class="ex-feedback ${r.full ? 'ok' : 'no'}" role="status"><p class="ex-fbh">${r.full ? 'Correct' : r.score > 0 ? 'Partially correct' : 'Incorrect'}</p>${reviewHtml(it, this.ans[i])}${it.rationale ? `<p class="ex-rat"><b>Rationale.</b> ${it.rationaleHtml ? it.rationale : esc(it.rationale)}</p>` : ''}</div>`;
    }

    renderMark() {
      const b = this.root.querySelector('[data-a=mark]');
      b.classList.toggle('on', this.marked[this.i]);
      b.querySelector('.ex-mark-l').textContent = this.marked[this.i] ? 'Marked' : 'Mark for Review';
    }

    leftPane(it) {
      const c = it.case, n = it.caseIndex + 1;
      const tabs = c.tabs.filter(t => (t.fromItem || 1) <= n);
      let active = this.tab[c.id]; if (!tabs.some(t => t.id === active)) active = tabs[0].id;
      this.tab[c.id] = active;
      return `<section class="ex-pane ex-left">
        ${n === 1 ? `<div class="ex-banner">${c.banner || `The following scenario applies to the next <b>${c.total}</b> items.`}</div>` : ''}
        <p class="ex-item-no">Item ${n} of ${c.total}</p><p class="ex-scenario">${c.scenario}</p>
        <div class="ex-tabs" role="tablist">${tabs.map(t => `<button class="ex-tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === active}">${esc(t.label)}</button>`).join('')}</div>
        <div class="ex-tabpanel" role="tabpanel">${tabs.find(t => t.id === active).html}</div></section>`;
    }

    optRow(kind, i, text, checked, struck) {
      return `<label class="ex-opt${struck ? ' struck' : ''}" data-i="${i}"><input type="${kind === 'r' ? 'radio' : 'checkbox'}" name="opt" value="${i}"${checked ? ' checked' : ''}><span class="ex-ctl ${kind}"></span><span class="ex-num">${i + 1}.</span><span class="ex-txt">${esc(text)}</span></label>`;
    }

    answerUi(it) {
      const a = this.ans[this.i], ng = !!it.case;
      const lead = ng ? `${it.intro ? `<p class="ex-prompt first">${it.intro}</p>` : ''}<p class="ex-prompt${it.intro ? '' : ' first'}"><span class="ex-chev">»</span>${it.prompt}</p>` : `<p class="ex-stem">${it.stem}</p>`;
      const hint = '<p class="ex-hint">Tip: right-click (or press and hold) an answer to cross it out.</p>';
      if (it.type === 'mcq') return lead + '<div class="ex-opts" role="radiogroup">' + it.options.map((t, i) => this.optRow('r', i, t, a === i, this.struck[this.i].has(i))).join('') + '</div>' + hint;
      if (it.type === 'sata') return lead + '<div class="ex-opts">' + it.options.map((t, i) => this.optRow('c', i, t, a.includes(i), this.struck[this.i].has(i))).join('') + '</div>' + hint;
      if (it.type === 'fill') return lead + `<div class="ex-fill"><input type="text" inputmode="decimal" autocomplete="off" aria-label="Answer" value="${esc(a)}"><span>${esc(it.unit || '')}</span></div><p class="ex-hint">Use the Calculator in the toolbar. Round only at the end if the question asks you to.</p>`;
      if (it.type === 'matrix') {
        return lead + `<table class="ex-table ex-matrix"><thead><tr><th>${esc(it.rowLabel || 'Finding')}</th>${it.cols.map(c => `<th class="c">${esc(c)}</th>`).join('')}</tr></thead><tbody>` +
          it.rows.map((r, ri) => `<tr><td>${esc(r)}</td>${it.cols.map((c, ci) => `<td class="c"><label class="ex-opt" aria-label="${esc(r)}: ${esc(c)}"><input type="checkbox" data-r="${ri}" data-c="${ci}"${a.includes(ri + ':' + ci) ? ' checked' : ''}><span class="ex-ctl c"></span></label></td>`).join('')}</tr>`).join('') +
          `</tbody></table><p class="ex-note">${it.note || ''}</p>`;
      }
      if (it.type === 'cloze') {
        const html = it.template.replace(/\{\{(\d+)\}\}/g, (m, n) => {
          const d = it.dropdowns[+n];
          return `<select data-d="${n}" aria-label="Choice ${+n + 1}"><option value=""${a[+n] === null ? ' selected' : ''}>Select</option>${d.options.map((t, i) => `<option value="${i}"${a[+n] === i ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
        });
        return lead + `<div class="ex-cloze">${html}</div>`;
      }
      if (it.type === 'highlight') {
        return lead + `<div class="ex-hl" role="group">${it.segments.map(s => s.id ? `<span class="seg${a.includes(s.id) ? ' on' : ''}" data-h="${s.id}" role="button" tabindex="0" aria-pressed="${a.includes(s.id)}">${esc(s.t)}</span>` : esc(s.t)).join('')}</div>`;
      }
      return lead;
    }

    toggleStrike(i) {
      const it = this.it; if (!(it.type === 'mcq' || it.type === 'sata')) return;
      const s = this.struck[this.i];
      if (s.has(i)) s.delete(i); else {
        s.add(i);
        if (it.type === 'mcq' && this.ans[this.i] === i) { this.ans[this.i] = null; this.changes[this.i]++; }
        if (it.type === 'sata' && this.ans[this.i].includes(i)) { this.ans[this.i] = this.ans[this.i].filter(x => x !== i); this.changes[this.i]++; }
      }
      this.show(this.i);
    }

    onChange(e) {
      const t = e.target, it = this.it, k = this.i;
      if (t.name === 'opt') {
        const v = +t.value; this.struck[k].delete(v);
        if (it.type === 'mcq') { if (this.ans[k] !== null && this.ans[k] !== v) this.changes[k]++; this.ans[k] = v; }
        else { const set = new Set(this.ans[k]); if (t.checked) set.add(v); else { set.delete(v); this.changes[k]++; } this.ans[k] = [...set].sort((a, b) => a - b); }
        this.main.querySelectorAll('.ex-opt[data-i]').forEach(r => r.classList.toggle('struck', this.struck[k].has(+r.dataset.i)));
      } else if (t.dataset.r !== undefined) {
        const key = t.dataset.r + ':' + t.dataset.c, set = new Set(this.ans[k]);
        if (t.checked) set.add(key); else { set.delete(key); this.changes[k]++; }
        this.ans[k] = [...set];
      } else if (t.dataset.d !== undefined) {
        const prev = this.ans[k][+t.dataset.d]; const v = t.value === '' ? null : +t.value;
        if (prev !== null && prev !== v) this.changes[k]++;
        this.ans[k][+t.dataset.d] = v;
      }
    }

    onInput(e) { if (this.it.type === 'fill' && e.target.matches('.ex-fill input')) this.ans[this.i] = e.target.value; }

    onClick(e) {
      const tab = e.target.closest('[data-tab]');
      if (tab) { this.tab[this.it.case.id] = tab.dataset.tab; this.show(this.i); return; }
      const hl = e.target.closest('[data-h]');
      if (hl) {
        const id = hl.dataset.h, set = new Set(this.ans[this.i]);
        if (set.has(id)) { set.delete(id); this.changes[this.i]++; } else set.add(id);
        this.ans[this.i] = [...set]; hl.classList.toggle('on'); hl.setAttribute('aria-pressed', set.has(id)); return;
      }
      const b = e.target.closest('[data-a]'); if (!b) return;
      ({
        prev: () => this.i > 0 && this.show(this.i - 1),
        next: () => {
          if (this.o.instant && !this.checked[this.i]) {
            if (!isAnswered(this.it, this.ans[this.i])) { this.modal('Select an answer', '<p>Choose an answer before checking it.</p>', [['OK']]); return; }
            this.checked[this.i] = true; this.show(this.i); this.main.querySelectorAll('.ex-pane').forEach(p => { p.scrollTop = p.scrollHeight; }); return;
          }
          this.i < this.items.length - 1 ? this.show(this.i + 1) : this.confirmFinish();
        },
        nav: () => this.navigator(), mark: () => { this.marked[this.i] = !this.marked[this.i]; this.renderMark(); },
        notes: () => this.notesModal(), calc: () => this.calcModal(), fb: () => this.feedbackModal(),
        help: () => this.helpModal(),
        gear: () => { this.fs = (this.fs + 1) % 3; this.app.dataset.fs = this.fs; },
        expand: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => { }); },
        exit: () => this.modal('Exit assessment', '<p>Leave this assessment? Your answers so far will not be scored.</p>', [['Keep working'], ['Exit', () => { this.destroy(); this.o.onExit && this.o.onExit(); }]])
      }[b.dataset.a] || (() => { }))();
    }

    modal(title, html, buttons, wide) {
      const bg = document.createElement('div'); bg.className = 'ex-modal-bg';
      bg.innerHTML = `<div class="ex-modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2><div class="body">${html}</div><div class="acts"></div></div>`;
      const acts = bg.querySelector('.acts');
      (buttons || [['Close']]).forEach((b, idx, arr) => {
        const btn = document.createElement('button'); btn.className = 'btn' + (arr.length > 1 && idx === 0 ? ' sec' : ''); btn.textContent = b[0];
        btn.onclick = () => { bg.remove(); b[1] && b[1](); }; acts.appendChild(btn);
      });
      bg.addEventListener('mousedown', e => { if (e.target === bg) bg.remove(); });
      document.body.appendChild(bg); (bg.querySelector('textarea') || acts.lastChild).focus();
      return bg;
    }

    helpModal() {
      this.modal('How this assessment works', `<ul><li><b>Cross out an answer:</b> right-click it (touch: press and hold). Do it again to bring it back.</li>
        <li><b>Select all that apply:</b> choose every correct option.</li><li><b>Mark for Review</b> flags the item in the Navigator.</li>
        <li><b>Notes</b> is your scratch pad; <b>Calculator</b> is available for any item.</li><li>Use <b>Previous</b> and <b>Next</b> to move between items.</li></ul>`);
    }

    notesModal() {
      const bg = this.modal('Notes', `<textarea aria-label="Scratch notes">${esc(this.notes)}</textarea>`, [['Save', () => { }]]);
      bg.querySelector('textarea').addEventListener('input', e => { this.notes = e.target.value; });
    }

    feedbackModal() {
      const bg = this.modal('Feedback', `<p>Observations about this item (for the tutor — not seen by scoring).</p><textarea aria-label="Feedback">${esc(this.fb[this.i])}</textarea>`, [['Save', () => { }]]);
      bg.querySelector('textarea').addEventListener('input', e => { this.fb[this.i] = e.target.value; });
    }

    calcModal() {
      const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '⌫', '+'];
      const bg = this.modal('Calculator', `<div class="ex-calc"><div class="disp" aria-live="polite">0</div>${keys.map(k => `<button class="${'÷×−+'.includes(k) ? 'op' : ''}">${k}</button>`).join('')}<button>C</button><button class="eq" style="grid-column:span 3">=</button></div>`, [['Close']]);
      const disp = bg.querySelector('.disp'); let expr = '';
      const show = () => { disp.textContent = expr || '0'; };
      bg.querySelector('.ex-calc').addEventListener('click', e => {
        const k = e.target.closest('button'); if (!k) return; const v = k.textContent;
        if (v === 'C') expr = ''; else if (v === '⌫') expr = expr.slice(0, -1);
        else if (v === '=') {
          const clean = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
          if (/^[0-9+\-*/. ]+$/.test(clean)) { try { const r = Function('"use strict";return (' + clean + ')')(); expr = Number.isFinite(r) ? String(+r.toFixed(6)) : 'Error'; } catch (_) { expr = 'Error'; } }
        } else { if (expr === 'Error') expr = ''; expr += v; }
        show();
      });
    }

    navigator() {
      const html = `<div class="ex-nav">${this.items.map((it, i) => `<button data-go="${i}" class="${isAnswered(it, this.ans[i]) ? 'done' : ''}${i === this.i ? ' cur' : ''}${this.marked[i] ? ' mk' : ''}">${i + 1}</button>`).join('')}</div><p class="ex-legend">Shaded = answered · ⚑ = marked for review · outlined = current item</p>`;
      const bg = this.modal('Navigator', html, [['Close']], true);
      bg.querySelector('.ex-nav').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { bg.remove(); this.show(+b.dataset.go); } });
    }

    confirmFinish() {
      const un = this.items.filter((it, i) => !isAnswered(it, this.ans[i])).length;
      this.modal('Finish assessment', `<p>${un ? `You have <b>${un}</b> unanswered item${un > 1 ? 's' : ''}.` : 'All items have a response.'} Submit the assessment now?</p>`, [['Keep working'], ['Submit', () => this.finish(false)]]);
    }

    destroy() {
      this.done = true; clearInterval(this.timer); document.removeEventListener('keydown', this.keyHandler); this.root.innerHTML = '';
      document.querySelectorAll('.ex-modal-bg').forEach(m => m.remove());
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    }

    finish(timedOut) {
      if (this.done) return;
      const res = { items: this.items, ans: this.ans, struck: this.struck.map(s => [...s]), marked: this.marked, time: this.time, changes: this.changes, fb: this.fb, notes: this.notes, elapsed: this.elapsed, timedOut: !!timedOut };
      this.destroy(); this.o.onFinish && this.o.onFinish(res);
    }
  }

  window.ExamUI = { Exam, prepare, score, isAnswered, reviewHtml, esc };
})();
