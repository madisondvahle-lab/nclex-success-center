import '../../../ngn-scoring.js';
import { presentation, canonicalAnswer } from './sata-presentation.mjs';

export const MODEL = 'in-house-ngn-v1';
export const SCORING_VERSION = 'ngn-v1';
const scoring = globalThis.NGNScoring;
const copy = value => JSON.parse(JSON.stringify(value));
const types = new Set(['mcq', 'sata', 'matrix', 'cloze', 'highlight', 'bowtie', 'fill']);
const categories = {
  'Management of Care': 'Safe & Effective Care Environment',
  'Safety & Infection Prevention': 'Safe & Effective Care Environment',
  'Health Promotion & Maintenance': 'Health Promotion & Maintenance',
  'Psychosocial Integrity': 'Psychosocial Integrity',
  'Basic Care & Comfort': 'Physiological Integrity',
  'Pharmacological & Parenteral Therapies': 'Physiological Integrity',
  'Reduction of Risk Potential': 'Physiological Integrity',
  'Physiological Adaptation': 'Physiological Integrity',
};

function assertItem(it) {
  const fail = () => { throw new Error(`Invalid reviewed NGN item: ${it.id || 'missing ID'}`); };
  const choices = a => Array.isArray(a) && a.length > 0 && a.every(v => typeof v === 'string' && v.trim());
  const indices = (a, length, count) => Array.isArray(a) && a.length > 0 && (count === undefined || a.length === count) &&
    new Set(a).size === a.length && a.every(v => Number.isInteger(v) && v >= 0 && v < length);
  if (!it.id || !types.has(it.type) || !(it.prompt || it.stem)?.trim() || !it.rationale?.trim()) fail();
  if (it.scoring && it.scoring !== 'zero-one') fail();
  if (it.scoringVersion && it.scoringVersion !== SCORING_VERSION) fail();
  if (it.type === 'mcq' || it.type === 'sata') {
    if (!choices(it.options) || !indices(it.correct, it.options.length, it.type === 'mcq' ? 1 : undefined)) fail();
  } else if (it.type === 'matrix') {
    if (!choices(it.rows) || !choices(it.cols) || !Array.isArray(it.correct) || !it.correct.length ||
        new Set(it.correct).size !== it.correct.length || it.correct.some(v => !/^\d+:\d+$/.test(v) ||
          +v.split(':')[0] >= it.rows.length || +v.split(':')[1] >= it.cols.length)) fail();
    if (it.responseMode && !['single', 'multiple'].includes(it.responseMode)) fail();
    if (it.scoringAxis && !['row', 'column'].includes(it.scoringAxis)) fail();
    if (it.responseMode === 'single' && it.rows.some((_, r) => it.correct.filter(v => v.startsWith(`${r}:`)).length !== 1)) fail();
  } else if (it.type === 'highlight') {
    if (!Array.isArray(it.segments)) fail();
    const segments = it.segments.filter(s => s.id);
    if (!segments.length || !segments.some(s => s.correct === true) ||
        new Set(segments.map(s => s.id)).size !== segments.length ||
        segments.some(s => typeof s.id !== 'string' || !s.id.trim() || typeof s.t !== 'string' || !s.t.trim() ||
          (s.correct !== undefined && typeof s.correct !== 'boolean'))) fail();
  } else if (it.type === 'cloze') {
    const markers = [...String(it.template).matchAll(/\{\{(\d+)\}\}/g)].map(m => +m[1]);
    if (!Array.isArray(it.dropdowns) || !it.dropdowns.length || markers.length !== it.dropdowns.length ||
        it.dropdowns.some((d, i) => !markers.includes(i) || !choices(d.options) || !indices([d.correct], d.options.length, 1))) fail();
  } else if (it.type === 'bowtie') {
    if (!it.bowtie || !it.correct || !['actions', 'conditions', 'complications'].every(k => choices(it.bowtie[k])) ||
        !indices(it.correct.actions, it.bowtie.actions.length, 2) || !indices([it.correct.condition], it.bowtie.conditions.length, 1) ||
        !indices(it.correct.complications, it.bowtie.complications.length, 2)) fail();
  } else if (!Number.isFinite(it.correct) || !Number.isFinite(it.tolerance ?? 0) || (it.tolerance ?? 0) < 0) fail();
}

export function validateEntry(entry) {
  const items = entry.kind === 'case' ? entry.items : [entry];
  if (!Array.isArray(items) || !items.length || items.length > 150 || !entry.id ||
      new Set(items.map(it => it.id)).size !== items.length) throw new Error('Invalid NGN case structure.');
  if (entry.kind === 'case' && !entry.scenario?.trim()) throw new Error('NGN case scenario is required.');
  if (entry.textFormat !== 'plain' || items.some(it => it.textFormat !== 'plain')) throw new Error('New CAT NGN content must use plain text.');
  const tabs = entry.tabs || [];
  const cellIds = [];
  if (new Set(tabs.map(t => t.id)).size !== tabs.length) throw new Error('Duplicate clinical tab IDs.');
  const stageValid = value => Number.isInteger(value ?? 1) && (value ?? 1) >= 1 && (value ?? 1) <= items.length;
  tabs.forEach(t => {
    if (!t.id || !t.label || !stageValid(t.fromItem)) throw new Error('Invalid clinical tab.');
    if (!Array.isArray(t.entries) || !Array.isArray(t.columns) || !t.columns.length || t.columns.some(c => typeof c !== 'string' || !c.trim())) {
      throw new Error('CAT NGN charts require structured, timestamped records.');
    }
    t.entries.forEach(e => {
      if (!Number.isFinite(Date.parse(e.at)) || !stageValid(e.fromItem) || !Array.isArray(e.cells) || e.cells.length !== t.columns.length ||
          e.cells.some(c => typeof c.t !== 'string' || !c.t.trim())) throw new Error('Invalid clinical chart entry.');
      e.cells.filter(c => c.id).forEach(c => cellIds.push(c.id));
    });
  });
  if (new Set(cellIds).size !== cellIds.length) throw new Error('Duplicate clinical finding IDs.');
  items.forEach((it, i) => {
    assertItem(it);
    if (it.tabs?.length && entry.kind === 'case') throw new Error('Case records must use the shared case tabs.');
    if (it.chartSelections) {
      const cells = tabs.filter(t => (t.fromItem ?? 1) <= i + 1).flatMap(t =>
        t.entries.filter(e => (e.fromItem ?? 1) <= i + 1).flatMap(e => e.cells));
      if (it.segments.filter(s => s.id).some(s => !cells.some(c => c.id === s.id && c.t === s.t))) {
        throw new Error('A keyed finding is unavailable at its case stage.');
      }
    }
  });
  return entry;
}

export async function registryEntry(question, review) {
  if (!question.active || !['approved', 'published'].includes(review?.status) ||
      !question.source_key?.startsWith('qbank-bulk-') || question.item_data?.schemaVersion !== 1) return null;
  const authoredItems = question.item_data.kind === 'case' ? question.item_data.items : [question.item_data];
  if (!Array.isArray(authoredItems) || authoredItems.some(it => it.scoringVersion !== SCORING_VERSION)) return null;
  const data = copy(question.item_data);
  data.stem = question.stem;
  data.rationale = question.rationale || data.rationale;
  data.id = `qbank:${question.id}`;
  if (data.kind !== 'case' && question.option_rationales && Object.keys(question.option_rationales).length) {
    data.optionRationales = copy(question.option_rationales);
  }
  if (question.item_type === 'case') {
    if (data.kind !== 'case') throw new Error('Reviewed case type does not match its interaction data.');
  } else if (data.type !== question.item_type) throw new Error('Reviewed item type does not match its interaction data.');
  validateEntry(data);
  const category = question.nclex_category;
  if (!categories[category]) throw new Error('Reviewed NGN item needs a recognized Client Needs category.');
  const difficulty = { easy: 1, medium: 2, hard: 3 }[question.difficulty] || Number(question.difficulty);
  if (![1, 2, 3].includes(difficulty)) throw new Error('Reviewed NGN difficulty is invalid.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)));
  const version = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  const key = {
    item_id: data.id, item_source: 'reviewed-question-bank', selectable: true,
    bank_scope: 'diagnostic', parent_item_id: null, sequence_order: null,
    item_type: data.kind === 'case' ? 'casestudy' : data.type,
    difficulty, category, nclex_category: category, blueprint: categories[category],
    topic: question.topic, core_tags: [], case_length: data.kind === 'case' ? data.items.length : 1,
    cognitive_level: null, correct_response: null, rationale: null,
    ngn_entry: data, content_version: version,
  };
  return key;
}

export function currentInteraction(checkpoint) {
  const current = checkpoint.ngnState?.current;
  if (!current) return null;
  const entry = current.key.ngn_entry, stage = current.stage;
  const source = entry.kind === 'case' ? entry.items[stage] : entry;
  if (!source) throw new Error('The current NGN case stage is invalid.');
  const id = entry.kind === 'case' ? `${current.key.item_id}:${source.id}` : current.key.item_id;
  return {
    ...copy(source),
    scoringVersion: SCORING_VERSION,
    id,
    ...(current.presentations?.[id] ? { presentation: presentation.validate(current.presentations[id], source.options.length) } : {}),
    sourceItemId: source.id,
    ...(entry.kind === 'case' ? {
      caseIndex: stage,
      case: { id: entry.id, scenario: entry.scenario, textFormat: entry.textFormat, tabs: entry.tabs || [], total: entry.items.length },
    } : {}),
  };
}

function publicTabs(tabs, stage) {
  return (tabs || []).filter(t => (t.fromItem ?? 1) <= stage).map(t => ({
    id: t.id, label: t.label, columns: [...t.columns],
    entries: t.entries.filter(e => (e.fromItem ?? 1) <= stage).map(e => ({
      at: e.at, cells: e.cells.map(c => ({ t: c.t, ...(c.id ? { id: c.id } : {}) })),
    })),
  }));
}

export function publicInteraction(checkpoint) {
  const it = currentInteraction(checkpoint);
  if (!it) return null;
  // Allowlist only display/response fields; never recursively strip a denylist.
  const result = {};
  for (const key of ['id', 'type', 'stem', 'prompt', 'intro', 'textFormat', 'chartSelections', 'responseMode', 'rowLabel', 'unit', 'template']) {
    if (it[key] !== undefined) result[key] = it[key];
  }
  if (it.options) result.options = [...it.options];
  if (it.presentation) result.presentation = copy(it.presentation);
  if (it.rows) result.rows = [...it.rows];
  if (it.cols) result.cols = [...it.cols];
  if (it.dropdowns) result.dropdowns = it.dropdowns.map(d => ({ options: [...d.options] }));
  if (it.segments) result.segments = it.segments.map(s => ({ t: s.t, ...(s.id ? { id: s.id } : {}) }));
  if (it.bowtie) result.bowtie = Object.fromEntries(['actions', 'conditions', 'complications'].map(k => [k, [...it.bowtie[k]]]));
  if (it.case) {
    result.caseIndex = it.caseIndex;
    result.case = { ...it.case, tabs: publicTabs(it.case.tabs, it.caseIndex + 1) };
  } else if (it.tabs) result.tabs = publicTabs(it.tabs, 1);
  result.qid = it.id;
  const key = checkpoint.ngnState.current.key;
  result.difficulty = key.difficulty;
  result.blueprint = key.blueprint;
  result.nclex_category = key.nclex_category;
  result.topic = key.topic;
  return result;
}

export function selectCurrent(checkpoint, key) {
  let presentations;
  if ((checkpoint.optionProtocol === presentation.VERSION || checkpoint.mcqOptionProtocol === 'mcq-order-v1') && key?.ngn_entry) {
    const entry = key.ngn_entry;
    presentations = Object.fromEntries((entry.kind === 'case' ? entry.items : [entry]).filter(it =>
      (it.type === 'sata' && checkpoint.optionProtocol === presentation.VERSION) ||
      (it.type === 'mcq' && checkpoint.mcqOptionProtocol === 'mcq-order-v1')).map(it => [
      entry.kind === 'case' ? `${key.item_id}:${it.id}` : key.item_id, presentation.create(it.options.length),
    ]));
  }
  return {
    ...(checkpoint.ngnState || { responses: {} }),
    current: key?.ngn_entry ? { key: copy(key), stage: 0, ...(presentations ? { presentations } : {}) } : null,
  };
}

export function validateDraft(checkpoint, draft) {
  const it = currentInteraction(checkpoint);
  if (!it) return null;
  const submitted = draft?.answer;
  const answer = submitted == null ? scoring.emptyAnswer(it) :
    canonicalAnswer(checkpoint.ngnState.current.presentations, it.id, submitted, true);
  scoring.validateAnswer(it, answer, true);
  const display = publicInteraction(checkpoint);
  const tabs = display.case?.tabs || display.tabs || [];
  if (draft?.tabId != null && (typeof draft.tabId !== 'string' || !tabs.some(t => t.id === draft.tabId))) throw new Error('The clinical tab is unavailable at this case stage.');
  const tabId = draft?.tabId ?? null;
  return { answer, tabId };
}

export function scoreCurrent(checkpoint, answer) {
  const it = currentInteraction(checkpoint);
  if (!it) throw new Error('No NGN interaction is active.');
  const credit = scoring.points(it, answer);
  const current = checkpoint.ngnState.current;
  return {
    item: it, credit, answer: copy(answer), parentId: current.key.item_id,
    contentVersion: current.key.content_version, caseIndex: current.stage,
    caseLength: current.key.case_length || 1,
  };
}

export function recordCredit(checkpoint, detail) {
  const state = copy(checkpoint.ngnState);
  state.responses[detail.item.id] = detail;
  const current = state.current;
  const final = current.stage + 1 === detail.caseLength;
  const unit = final ? Object.values(state.responses).filter(d => d.parentId === detail.parentId) : [];
  // Equal question weighting, not point weighting: a five-slot bow-tie cannot
  // dominate a one-point item. Only the completed group is adaptive evidence.
  const evidenceScore = final ? unit.reduce((sum, d) => sum + d.credit.score, 0) / detail.caseLength : null;
  if (!final) current.stage++;
  return { state, final, evidenceScore };
}

export function publicCheckpoint(checkpoint) {
  const result = { ...checkpoint };
  delete result.ngnState;
  return result;
}

export function responseDetail(checkpoint, itemId, reveal) {
  const detail = checkpoint.ngnState?.responses?.[itemId];
  if (!detail || !reveal) return {};
  return {
    credit: detail.credit, contentVersion: detail.contentVersion,
    scoringVersion: SCORING_VERSION, caseIndex: detail.caseIndex, caseLength: detail.caseLength,
    interaction: detail.item, sourceId: detail.parentId,
    ...(detail.item.presentation ? { presentation: copy(detail.item.presentation) } : {}),
  };
}
