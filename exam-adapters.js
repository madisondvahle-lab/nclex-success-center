// Converts existing portal question formats into ExamUI bank entries without changing any wording.
(function () {
  'use strict';

  // Practice-set format: { id, stem, options[], answer: index | index[], rationale, category, type:'intro' }.
  // An 'intro' question becomes the scenario for the questions that follow it.
  function fromPracticeSet(questions) {
    const entries = [];
    let group = null;
    const flush = () => { if (group && group.items.length) entries.push(group.entry); group = null; };
    const item = (q, idx) => {
      const sata = Array.isArray(q.answer);
      return { id: String(q.id), type: sata ? 'sata' : 'mcq', options: q.options.slice(), correct: sata ? q.answer.slice() : [q.answer], rationale: q.rationale || '', rationaleHtml: true, qno: q.qno || null, dbId: q.dbId || null, srcIndex: idx };
    };
    questions.forEach((q, idx) => {
      if (q.type === 'intro') {
        flush();
        group = { items: [], entry: { kind: 'case', id: String(q.id), title: 'Case study', scenario: q.stem, tabs: [{ id: 'sc', label: 'Scenario', html: '<p>' + (q.note || 'Read the scenario, then answer the items.') + '</p>' }], topic: q.category || 'Case study', category: q.category || 'Case study', items: [] } };
        group.items = group.entry.items;
        return;
      }
      const base = item(q, idx);
      if (group) { base.prompt = q.stem; group.items.push(base); }
      else { base.stem = q.stem; base.topic = q.category || q.topic || 'Practice'; base.category = base.topic; entries.push(base); }
    });
    flush();
    return entries;
  }

  // Converts finished ExamUI answers back to the practice-set answer format, aligned to the original list.
  function toPracticeAnswers(questions, res) {
    const answers = new Array(questions.length);
    res.items.forEach((it, k) => {
      const q = questions[it.srcIndex];
      if (!q) return;
      const a = res.ans[k];
      answers[it.srcIndex] = Array.isArray(q.answer) ? a.slice() : (a === null ? undefined : a);
    });
    return answers;
  }

  window.ExamAdapters = { fromPracticeSet, toPracticeAnswers };
})();
