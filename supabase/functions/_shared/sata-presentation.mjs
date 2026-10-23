import '../../../option-presentation.js';

export const presentation = globalThis.OptionPresentation;
// Canonical counts only; regression tests verify these against the unchanged public banks.
export const counts = {
  m6: 6, hp5: 6, ps6: 6, bc3: 6, ph5: 6, rr5: 6,
  'cs1:cs1a': 6, 'cs2:cs2c': 6,
  ib003: 5, ib006: 5, ib013: 5, ib021: 5, ib024: 5,
  x018: 5, x038: 5, x059: 5, x093: 5, x094: 5, x095: 5,
  x096: 5, x097: 5, x098: 5, x099: 5, x100: 5,
  rm18: 6, rm19: 6, rm20: 6, rm21: 6, rm22: 6,
  'rm26:rm26a': 6, 'rm27:rm27b': 6,
  rm43: 6, rm44: 6, rm45: 6, rm46: 6, rm47: 6, rm48: 6,
  'rm51:rm51b': 6, 'rm52:rm52b': 6,
};
export function newPresentations(keys) {
  return Object.fromEntries(keys.filter(key => key.item_type === 'sata' && !key.ngn_entry).map(key => {
    const count = counts[key.item_id];
    if (!count) throw new Error(`Missing canonical SATA option count: ${key.item_id}`);
    return [key.item_id, presentation.create(count)];
  }));
}
export function canonicalAnswer(saved, id, answer, draft = false) {
  const p = saved?.[id];
  if (!p) return answer;
  if (!answer || answer.version !== presentation.VERSION || !Array.isArray(answer.optionIds) ||
      !draft && !answer.optionIds.length || Object.keys(answer).some(key => !['version', 'optionIds'].includes(key))) {
    throw new Error('The response requires the saved option identities. Reload and resume.');
  }
  return presentation.indexes(p, answer.optionIds);
}
