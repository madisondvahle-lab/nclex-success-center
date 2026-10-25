const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../category-names.js');
require('../assessment-archer.js');
require('../assessment-import.js');

test('Archer OCR uses Your Score rather than Peer Score and recognizes question usage', () => {
  const result = window.AssessmentImport.parseArcherStats(
    'Your Score Peer Score Questions Usage Time Spent\n' +
    'Management of Care 82% 75% 8 00:02:10\n' +
    'Safety and Infection Control 64% 71% 5 00:01:40'
  );

  assert.equal(result.categories['Management of Care'].score, 82);
  assert.equal(result.categories['Management of Care'].peer_score, 75);
  assert.equal(result.categories['Management of Care'].question_count, 8);
  assert.equal(result.categories['Safety and Infection Control'].score, 64);
  assert.equal(result.categories['Safety and Infection Control'].peer_score, 71);
  assert.equal(result.categories['Safety and Infection Control'].question_count, 5);
  assert.equal(result.reviewRequired, true);
});

test('Archer OCR follows reversed peer and student score headers', () => {
  const result = window.AssessmentImport.parseArcherStats(
    'Peer Score Your Score\nPsychosocial Integrity 69% 81%'
  );

  assert.equal(result.categories['Psychosocial Integrity'].score, 81);
  assert.equal(result.categories['Psychosocial Integrity'].peer_score, 69);
});

/*
Real-image browser validation references (not automated fixtures): the user
attached "Pasted Image.png" (Classic, Subject/Lesson, 1954x768) and
"Pasted Image 2.png" (NGN, Subject/Lesson, 1713x768). Expected subject rows
are recorded in the test below; peer values in both reports are percentages.
The files remain in the conversation attachment store and are not committed.
*/
test('Archer screenshot OCR results remain isolated by report section and category row', () => {
  const classic = window.AssessmentImport.parseArcherRows('classic', [
    { category: 'Physiological Adaptation', score: 70, peer_score: 66, peer_score_unit: 'percent', question_count: 10 },
    { category: 'Reduction of Risk Potential', score: 75, peer_score: 68, peer_score_unit: 'percent', question_count: 8 },
    { category: 'Psychosocial Integrity', score: 100, peer_score: 67, peer_score_unit: 'percent', question_count: 2 },
    { category: 'Pharmacological and Parenteral Therapies', score: 75, peer_score: 54, peer_score_unit: 'percent', question_count: 4 },
    { category: 'Management of Care', score: 100, peer_score: 72, peer_score_unit: 'percent', question_count: 6 }
  ], {
    question_count: 30,
    overall_percent: 80,
    result_counts: { correct: 24, incorrect: 6, omitted: 0 }
  });
  const ngn = window.AssessmentImport.parseArcherRows('ngn', [
    { category: 'Physiological Adaptation', score: 86, peer_score: 5, peer_score_unit: 'points', question_count: 17 },
    { category: 'Reduction of Risk Potential', score: 83, peer_score: 9, peer_score_unit: 'points', question_count: 9 },
    { category: 'Health Promotion and Maintenance', score: 57, peer_score: 14, peer_score_unit: 'points', question_count: 3 },
    { category: 'Psychosocial Integrity', score: 57, peer_score: 11, peer_score_unit: 'points', question_count: 8 },
    { category: 'Pharmacological and Parenteral Therapies', score: 69, peer_score: 6, peer_score_unit: 'points', question_count: 12 },
    { category: 'Management of Care', score: 70, peer_score: 15, peer_score_unit: 'points', question_count: 6 }
  ], {
    question_count: 55,
    overall_percent: 75,
    overall_points: { earned_points: 144, possible_points: 193 }
  });

  assert.equal(classic.section, 'classic');
  assert.equal(ngn.section, 'ngn');
  assert.equal(classic.categories['Physiological Adaptation'].score, 70);
  assert.equal(classic.categories['Physiological Adaptation'].peer_score, 66);
  assert.equal(classic.categories['Physiological Adaptation'].peer_score_unit, 'percent');
  assert.equal(classic.categories['Physiological Adaptation'].question_count, 10);
  assert.equal(ngn.categories['Physiological Adaptation'].score, 86);
  assert.equal(ngn.categories['Physiological Adaptation'].peer_score, 5);
  assert.equal(ngn.categories['Physiological Adaptation'].peer_score_unit, 'points');
  assert.equal(ngn.categories['Physiological Adaptation'].question_count, 17);
  assert.deepEqual(
    Object.fromEntries(Object.entries(classic.categories).map(([category, values]) =>
      [category, [values.score, values.peer_score, values.question_count]])),
    {
      'Physiological Adaptation': [70, 66, 10],
      'Reduction of Risk Potential': [75, 68, 8],
      'Psychosocial Integrity': [100, 67, 2],
      'Pharmacological and Parenteral Therapies': [75, 54, 4],
      'Management of Care': [100, 72, 6]
    }
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(ngn.categories).map(([category, values]) =>
      [category, [values.score, values.peer_score, values.question_count]])),
    {
      'Physiological Adaptation': [86, 5, 17],
      'Reduction of Risk Potential': [83, 9, 9],
      'Health Promotion and Maintenance': [57, 14, 3],
      'Psychosocial Integrity': [57, 11, 8],
      'Pharmacological and Parenteral Therapies': [69, 6, 12],
      'Management of Care': [70, 15, 6]
    }
  );
  assert.ok(Object.values(classic.categories).every(values => values.peer_score_unit === 'percent'));
  assert.ok(Object.values(ngn.categories).every(values => values.peer_score_unit === 'points'));
  assert.notDeepEqual(classic.categories, ngn.categories);
  assert.equal(classic.overall_percent, 80);
  assert.equal(classic.question_count, 30);
  assert.deepEqual(classic.result_counts, { correct: 24, incorrect: 6, omitted: 0 });
  assert.equal(ngn.overall_percent, 75);
  assert.equal(ngn.question_count, 55);
  assert.deepEqual(ngn.overall_points, { earned_points: 144, possible_points: 193 });
});

test('incomplete or duplicate Archer OCR rows remain blank and flagged for review', () => {
  const incomplete = window.AssessmentImport.parseArcherRows('classic', [
    { category: 'Physiological Adaptation', score: 70, peer_score: null, question_count: 10 },
    { category: 'Psychosocial Integrity', score: 100, peer_score: 67, question_count: 2 },
    { category: 'Psychosocial Integrity', score: 57, peer_score: 11, question_count: 8 }
  ], {
    question_count: null,
    overall_percent: null,
    result_counts: { correct: 24, incorrect: 6, omitted: null }
  });

  test('Subject/Lesson rows preserve Archer names, section separation, and report-specific peer units', () => {
    const classic = window.AssessmentImport.parseArcherSubjectRows('classic', [
      { subject: 'Adult Health', score: 75, peer_score: 70, peer_score_unit: 'percent', question_count: 8 },
      { subject: 'Child Health', score: 75, peer_score: 76, peer_score_unit: 'percent', question_count: 4 },
      { subject: 'Critical Care', score: 33, peer_score: 49, peer_score_unit: 'percent', question_count: 3 },
      { subject: 'Fundamentals', score: 75, peer_score: 59, peer_score_unit: 'percent', question_count: 4 },
      { subject: 'Leadership & Management', score: 100, peer_score: 72, peer_score_unit: 'percent', question_count: 6 },
      { subject: 'Maternal & Newborn Health', score: 100, peer_score: 53, peer_score_unit: 'percent', question_count: 1 },
      { subject: 'Mental Health', score: 100, peer_score: 67, peer_score_unit: 'percent', question_count: 2 },
      { subject: 'Pharmacology', score: 100, peer_score: 50, peer_score_unit: 'percent', question_count: 1 },
      { subject: 'Nutrition', score: 100, peer_score: 73, peer_score_unit: 'percent', question_count: 1 }
    ], {});
    const ngn = window.AssessmentImport.parseArcherSubjectRows('ngn', [
      { subject: 'Adult Health', score: 83, peer_score: 2, peer_score_unit: 'percent', question_count: 37 },
      { subject: 'Leadership & Management', score: 0, peer_score: 50, peer_score_unit: 'percent', question_count: 1 },
      { subject: 'Maternal & Newborn Health', score: 44, peer_score: 33, peer_score_unit: 'percent', question_count: 2 },
      { subject: 'Mental Health', score: 62, peer_score: 4, peer_score_unit: 'percent', question_count: 13 },
      { subject: 'Pharmacology', score: 60, peer_score: 40, peer_score_unit: 'percent', question_count: 2 }
    ], {
      question_count: 55,
      overall_percent: 75,
      overall_points: { earned_points: 144, possible_points: 193 }
    });

    assert.equal(classic.view, 'subject_lesson');
    assert.equal(ngn.view, 'subject_lesson');
    assert.deepEqual(
      Object.fromEntries(Object.entries(classic.subjects).map(([subject, row]) =>
        [subject, [row.score, row.peer_score, row.peer_score_unit, row.question_count]])),
      {
        'Adult Health': [75, 70, 'percent', 8],
        'Child Health': [75, 76, 'percent', 4],
        'Critical Care': [33, 49, 'percent', 3],
        'Fundamentals': [75, 59, 'percent', 4],
        'Leadership & Management': [100, 72, 'percent', 6],
        'Maternal & Newborn Health': [100, 53, 'percent', 1],
        'Mental Health': [100, 67, 'percent', 2],
        'Pharmacology': [100, 50, 'percent', 1],
        'Nutrition': [100, 73, 'percent', 1]
      }
    );
    assert.deepEqual(
      Object.fromEntries(Object.entries(ngn.subjects).map(([subject, row]) =>
        [subject, [row.score, row.peer_score, row.peer_score_unit, row.question_count]])),
      {
        'Adult Health': [83, 2, 'percent', 37],
        'Leadership & Management': [0, 50, 'percent', 1],
        'Maternal & Newborn Health': [44, 33, 'percent', 2],
        'Mental Health': [62, 4, 'percent', 13],
        'Pharmacology': [60, 40, 'percent', 2]
      }
    );
    assert.equal(ngn.question_count, 55);
    assert.equal(ngn.overall_percent, 75);
    assert.deepEqual(ngn.overall_points, { earned_points: 144, possible_points: 193 });
    assert.equal(classic.subjects['Adult Health'].score, 75);
    assert.equal(ngn.subjects['Adult Health'].score, 83);
    assert.equal(classic.categories, undefined);
    assert.equal(ngn.categories, undefined);
    assert.equal(classic.reviewRequired, true);
    assert.equal(ngn.reviewRequired, true);
  });

  assert.equal(incomplete.categories['Physiological Adaptation'].score, 70);
  assert.equal(incomplete.categories['Physiological Adaptation'].peer_score, null);
  assert.equal(incomplete.question_count, null);
  assert.deepEqual(incomplete.result_counts, { correct: 24, incorrect: 6, omitted: null });
  assert.equal(incomplete.categories['Psychosocial Integrity'], undefined);
  assert.ok(incomplete.ambiguousCategories.includes('Psychosocial Integrity'));
  assert.ok(incomplete.missingCategories.includes('Physiological Adaptation'));
  assert.ok(incomplete.missingFields.includes('overall_percent'));
  assert.ok(incomplete.missingFields.includes('result_counts'));
  assert.equal(incomplete.reviewRequired, true);
});

test('Archer report import does not invent a combined score from section percentages', () => {
  const result = window.AssessmentImport.parseText(
    'Archer Review Test Report Average Peer Score: 75% Your Score: 71% ' +
    'NGN Average Peer Score: 70 Your Score: 68 Your Result: PASS Test Id: 123'
  );

  assert.equal(result.overall, null);
  assert.equal(result.sections.classic.overall_percent, 71);
  assert.equal(result.sections.ngn.overall_percent, 68);
  assert.equal(result.result, 'PASS');
});

test('Archer category aliases map to official Client Needs names', () => {
  assert.equal(window.ArcherCAT.categoryName('Safety & Infection Control'), 'Safety and Infection Control');
  assert.equal(window.ArcherCAT.categoryName('Basic Care & Comfort'), 'Basic Care and Comfort');
  assert.equal(window.ArcherCAT.categoryName('unknown'), null);
});

test('combined scores require actual point totals for both sections', () => {
  const classic = {
    overall_points: { earned_points: 3, possible_points: 4 },
    categories: { 'Management of Care': { earned_points: 2, possible_points: 3 } }
  };
  const ngn = {
    overall_points: { earned_points: 5, possible_points: 8 },
    categories: { 'Management of Care': { earned_points: 3, possible_points: 5 } }
  };
  const combined = window.ArcherCAT.combine(classic, ngn);

  assert.deepEqual(combined.overall, {
    score: 66.67,
    method: 'earned-points-over-possible-points',
    earned_points: 8,
    possible_points: 12
  });
  assert.deepEqual(combined.categories['Management of Care'], {
    score: 62.5,
    method: 'earned-points-over-possible-points',
    earned_points: 5,
    possible_points: 8
  });
  assert.equal(window.ArcherCAT.combine({ overall_percent: 80 }, { overall_percent: 70 }).overall.score, null);
  assert.equal(window.ArcherCAT.combine(classic, {}).overall.method, 'insufficient-data');
});

test('missing exposure and missing score remain distinct', () => {
  assert.equal(window.ArcherCAT.status({ question_count: 0, score: null }), 'not-tested');
  assert.equal(window.ArcherCAT.status({ question_count: null, score: null }), 'not-reported');
  assert.equal(window.ArcherCAT.status({ question_count: 3, score: 0 }), 'reported');
});
