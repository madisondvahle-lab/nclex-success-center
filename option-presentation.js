(function (global) {
  'use strict';
  const VERSION = 'sata-order-v1';
  function permutation(length, random = global.crypto) {
    if (!Number.isInteger(length) || length < 1) throw new Error('Invalid option count.');
    const order = Array.from({ length }, (_, i) => i);
    for (let i = length - 1; i > 0; i--) {
      const bound = i + 1, limit = 0x100000000 - (0x100000000 % bound);
      const sample = new Uint32Array(1);
      do { random.getRandomValues(sample); } while (sample[0] >= limit);
      const j = sample[0] % bound;
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }
  function validate(p, length) {
    if (!p || p.version !== VERSION || !Array.isArray(p.order) || p.order.length !== length ||
        new Set(p.order).size !== length || p.order.some(i => !Number.isInteger(i) || i < 0 || i >= length) ||
        !Array.isArray(p.ids) || p.ids.length !== length || new Set(p.ids).size !== length ||
        p.ids.some(id => typeof id !== 'string' || !id.trim())) throw new Error('Invalid saved answer presentation. Reload and resume.');
    return p;
  }
  function create(length) {
    return validate({ version: VERSION, order: permutation(length), ids: Array.from({ length }, () => global.crypto.randomUUID()) }, length);
  }
  function order(item) {
    return item.presentation ? validate(item.presentation, item.options.length).order : item.options.map((_, i) => i);
  }
  function indexes(p, ids) {
    validate(p, p.order.length);
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => !p.ids.includes(id))) {
      throw new Error('The response contains an invalid option identity.');
    }
    return ids.map(id => p.ids.indexOf(id));
  }
  function encode(item, answer) {
    if (!item.presentation) return answer;
    validate(item.presentation, item.options.length);
    if (!Array.isArray(answer) || new Set(answer).size !== answer.length ||
        answer.some(i => !Number.isInteger(i) || i < 0 || i >= item.options.length)) throw new Error('Invalid answer positions.');
    return { version: VERSION, optionIds: answer.map(i => item.presentation.ids[i]) };
  }
  function rationale(item, index) {
    const values = item.optionRationales || item.option_rationales || {};
    return values[index] || values[String.fromCharCode(97 + index)] || values[String.fromCharCode(65 + index)] || '';
  }
  function attach(item, presentations = {}, prefix = '') {
    const identity = prefix ? `${prefix}:${item.qid || item.id}` : item.id;
    if (item.questions) return { ...item, questions: item.questions.map(child => attach(child, presentations, item.id)) };
    if (item.type !== 'sata') return item;
    const presentation = presentations[identity];
    return presentation ? { ...item, presentation: validate(presentation, item.options.length) } : item;
  }
  function warnings(items) {
    const collect = q => {
      if (!q || typeof q !== 'object' || Array.isArray(q)) return [];
      const data = q.item_data && typeof q.item_data === 'object' ? q.item_data : q;
      const children = Array.isArray(data.items) ? data.items : Array.isArray(data.questions) ? data.questions : null;
      return children ? children.flatMap(collect) : data.type === 'sata' || q.item_type === 'sata' ? [data] : [];
    };
    const sata = items.flatMap(collect).filter(q => Array.isArray(q.correct) && q.correct.length && Array.isArray(q.options));
    if (!sata.length) return [];
    const prefix = sata.filter(q => [...q.correct].sort((a, b) => a - b).every((v, i) => v === i)).length;
    const first = sata.filter(q => q.correct.includes(0)).length;
    const counts = new Set(sata.map(q => q.correct.length));
    const result = [];
    if (prefix) result.push(`${prefix} of ${sata.length} SATA items group correct choices first. Student presentation is randomized; verify the clinical key without changing it for appearance.`);
    if (sata.length >= 5 && first / sata.length >= 0.8) result.push('The first canonical choice is correct in at least 80% of this SATA batch.');
    if (sata.length >= 5 && counts.size === 1) result.push('Every SATA item in this batch has the same correct-answer count. Review the pattern; do not change clinically correct combinations merely to vary the count.');
    return result;
  }
  const api = { VERSION, permutation, validate, create, order, indexes, encode, rationale, attach, warnings };
  global.OptionPresentation = api;
  if (typeof window !== 'undefined') window.OptionPresentation = api;
})(globalThis);
