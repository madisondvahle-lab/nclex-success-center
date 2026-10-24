(function (global) {
  'use strict';
  const VERSION = 'ngn-v1';
  function emptyAnswer(it) {
    if (it.type === 'mcq') return null;
    if (it.type === 'fill') return '';
    if (it.type === 'cloze') return it.dropdowns.map(() => null);
    if (it.type === 'bowtie') return [null, null, null, null, null];
    return [];
  }
  function legacyScore(it, a) {
    const set = correct => {
      const chosen = [...new Set(a)];
      if (!correct.length) throw new Error('This interaction has no correct answers configured.');
      const hits = chosen.filter(x => correct.includes(x)).length, wrong = chosen.length - hits;
      return { score: Math.max(0, (hits - wrong) / correct.length), full: hits === correct.length && wrong === 0 };
    };
    if (it.scoring === 'zero-one') {
      const result = legacyScore({ ...it, scoring: undefined }, a);
      return { score: result.full ? 1 : 0, full: result.full };
    }
    switch (it.type) {
      case 'mcq': { const ok = a !== null && a === it.correct[0]; return { score: +ok, full: ok }; }
      case 'sata': case 'matrix': return set(it.correct);
      case 'highlight': return set(it.segments.filter(s => s.id && s.correct).map(s => s.id));
      case 'fill': {
        const n = parseFloat(String(a).replace(/,/g, ''));
        const ok = !isNaN(n) && Math.abs(n - it.correct) <= (it.tolerance || 0);
        return { score: +ok, full: ok };
      }
      case 'cloze': {
        const n = it.dropdowns.filter((d, i) => a[i] === d.correct).length;
        return { score: n / it.dropdowns.length, full: n === it.dropdowns.length };
      }
      case 'bowtie': {
        const unique = values => [...new Set(values.filter(v => v !== null))];
        const n = unique(a.slice(0, 2)).filter(v => it.correct.actions.includes(v)).length +
          +(a[2] === it.correct.condition) + unique(a.slice(3)).filter(v => it.correct.complications.includes(v)).length;
        return { score: n / 5, full: n === 5 };
      }
      default: throw new Error('Unsupported interaction type.');
    }
  }
  function validateAnswer(it, answer, draft = false) {
    const bad = () => { throw new Error('The response does not match this interaction.'); };
    const index = (value, length) => Number.isInteger(value) && value >= 0 && value < length;
    const array = () => { if (!Array.isArray(answer)) bad(); };
    const unique = values => new Set(values).size === values.length;
    if (it.type === 'mcq') {
      if (!(draft && answer === null) && !index(answer, it.options.length)) bad();
    } else if (it.type === 'fill') {
      if (typeof answer !== 'string' || answer.length > 100) bad();
      if (!(draft && answer.trim() === '') && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(answer.trim())) bad();
    } else {
      array();
      if (it.type === 'sata') {
        if ((!draft && !answer.length) || !unique(answer) || answer.some(v => !index(v, it.options.length))) bad();
      } else if (it.type === 'highlight') {
        const ids = it.segments.filter(s => s.id).map(s => s.id);
        if ((!draft && !answer.length) || !unique(answer) || answer.some(v => typeof v !== 'string' || !ids.includes(v))) bad();
      } else if (it.type === 'matrix') {
        const valid = it.rows.flatMap((_, r) => it.cols.map((_, c) => `${r}:${c}`));
        if ((!draft && !answer.length) || !unique(answer) || answer.some(v => !valid.includes(v))) bad();
        if (it.responseMode === 'single' && it.rows.some((_, r) => {
          const count = answer.filter(v => v.startsWith(`${r}:`)).length;
          return count > 1 || (!draft && count !== 1);
        })) bad();
      } else if (it.type === 'cloze') {
        if (answer.length !== it.dropdowns.length || answer.some((v, i) => !(draft && v === null) && !index(v, it.dropdowns[i].options.length))) bad();
      } else if (it.type === 'bowtie') {
        const lengths = [it.bowtie.actions.length, it.bowtie.actions.length, it.bowtie.conditions.length, it.bowtie.complications.length, it.bowtie.complications.length];
        if (answer.length !== 5 || answer.some((v, i) => !(draft && v === null) && !index(v, lengths[i]))) bad();
        if (!unique(answer.slice(0, 2).filter(v => v !== null)) || !unique(answer.slice(3).filter(v => v !== null))) bad();
      } else bad();
    }
    return answer;
  }
  function points(it, answer) {
    validateAnswer(it, answer);
    let earned = 0, max = 1, rule = 'zero-one';
    if (it.type === 'matrix' && it.responseMode !== 'single') {
      max = it.correct.length;
      const axis = it.scoringAxis === 'row' ? 0 : 1;
      const units = axis === 0 ? it.rows.length : it.cols.length;
      for (let i = 0; i < units; i++) {
        earned += Math.max(0, answer.filter(value => +value.split(':')[axis] === i)
          .reduce((sum, value) => sum + (it.correct.includes(value) ? 1 : -1), 0));
      }
      rule = axis === 0 ? 'plus-minus-per-row' : 'plus-minus-per-column';
    } else if (it.type === 'sata' || it.type === 'highlight') {
      const correct = it.type === 'highlight' ? it.segments.filter(s => s.id && s.correct).map(s => s.id) : it.correct;
      max = correct.length;
      earned = Math.max(0, answer.reduce((sum, value) => sum + (correct.includes(value) ? 1 : -1), 0));
      rule = 'plus-minus';
    } else if (it.type === 'matrix') {
      max = it.rows.length;
      earned = answer.filter(value => it.correct.includes(value)).length;
      rule = 'zero-one-per-row';
    } else if (it.type === 'cloze') {
      max = it.dropdowns.length;
      earned = it.dropdowns.filter((d, i) => answer[i] === d.correct).length;
      rule = 'zero-one-per-dropdown';
    } else if (it.type === 'bowtie') {
      max = 5;
      earned = answer.slice(0, 2).filter(v => it.correct.actions.includes(v)).length +
        +(answer[2] === it.correct.condition) + answer.slice(3).filter(v => it.correct.complications.includes(v)).length;
      rule = 'zero-one-per-slot';
    } else if (it.type === 'fill') {
      earned = +(Math.abs(Number(answer) - it.correct) <= (it.tolerance || 0));
    } else if (it.type === 'mcq') earned = +(answer === it.correct[0]);
    if (!Number.isInteger(max) || max <= 0 || earned > max) throw new Error('The interaction answer key is invalid.');
    if (it.scoring === 'zero-one') {
      const correct = it.type === 'highlight' ? it.segments.filter(s => s.id && s.correct).map(s => s.id) :
        it.type === 'sata' || it.type === 'matrix' ? it.correct : null;
      const exact = correct ? answer.length === correct.length && answer.every(v => correct.includes(v)) : earned === max;
      earned = +exact; max = 1; rule = 'all-or-nothing';
    }
    return { earned, max, score: earned / max, full: earned === max, rule, version: VERSION };
  }
  function score(it, answer) {
    return it.scoringVersion === VERSION ? points(it, answer) : legacyScore(it, answer);
  }
  global.NGNScoring = { VERSION, emptyAnswer, legacyScore, score, points, validateAnswer };
})(globalThis);
