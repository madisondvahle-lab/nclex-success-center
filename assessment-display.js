(function (global) {
  'use strict';
  const modes = {
    practice: { label: 'Adaptive Practice', description: 'Choose your length; practice with adaptive question selection.' },
    nclex: { label: 'Short Adaptive Assessment', description: '30–45 questions · internal study benchmark, not a full-length mock.' },
    mock: { label: 'Full-Length Adaptive Mock', description: '85–150 questions · internal educational readiness estimate.' },
    remediation: { label: 'Targeted Remediation Practice', description: 'Separate practice bank, optional focus areas and available external assessment category scores.' },
    assessment: { label: 'Initial Baseline Assessment', description: '85 questions · adaptive selection · percentage and category profile, no pass/fail label.' }
  };
  function entryMode(search) {
    const requested = new URLSearchParams(search).get('mode');
    return Object.hasOwn(modes, requested) ? requested : 'practice';
  }
  function modeForAttempt(attempt) {
    return attempt.assessment_key === 'readiness-assessment' ? 'assessment' : attempt.mode;
  }
  function label(mode) {
    return modes[mode]?.label || 'Assessment';
  }
  function classification(mode, result) {
    if (!['nclex', 'mock'].includes(mode)) return null;
    if (result !== 'PASS' && result !== 'FAIL') return { label: 'Insufficient Evidence', outcome: null };
    return {
      label: mode === 'nclex'
        ? result === 'PASS' ? 'Above Study Benchmark' : 'Below Study Benchmark'
        : result,
      outcome: result
    };
  }
  function completionMessage({ mode, total, target, reason, result }) {
    if (reason === 'question-limit-insufficient-evidence') {
      return 'The assessment reached its question limit without enough eligible coverage or evidence to report a benchmark result.';
    }
    if (reason === 'insufficient-items') {
      return 'The assessment ended because no further eligible questions were available. There is insufficient evidence to report a benchmark result.';
    }
    if (reason === 'confidence-rule') {
      return 'This assessment ended after its coverage and evidence requirements were met.';
    }
    if (['PASS', 'FAIL'].includes(result)) {
      return 'This assessment ended after its coverage and adaptive evidence requirements were met.';
    }
    if (reason === 'item-limit-or-fixed-length' || total >= target) {
      return ['nclex', 'mock'].includes(mode)
        ? 'The assessment reached its question limit.'
        : 'The assessment reached its planned length.';
    }
    return 'This assessment ended before its planned maximum. The saved record does not identify whether this was an adaptive stop or a question-pool limitation.';
  }
  global.AssessmentDisplay = { modes, entryMode, modeForAttempt, label, classification, completionMessage };
}(window));
