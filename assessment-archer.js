(function (global) {
  'use strict';

  const categories = global.NCLEXCats?.NAMES || [
    'Management of Care',
    'Safety and Infection Control',
    'Health Promotion and Maintenance',
    'Psychosocial Integrity',
    'Basic Care and Comfort',
    'Pharmacological and Parenteral Therapies',
    'Reduction of Risk Potential',
    'Physiological Adaptation'
  ];

  function categoryName(value) {
    const index = global.NCLEXCats?.index(value);
    return index >= 0 ? categories[index] : null;
  }

  function finite(value) {
    const number = Number(value);
    return value !== '' && value != null && Number.isFinite(number) ? number : null;
  }

  function pointPair(value) {
    const earned = finite(value?.earned_points);
    const possible = finite(value?.possible_points);
    if (earned == null || possible == null || earned < 0 || possible <= 0 || earned > possible) return null;
    return { earned_points: earned, possible_points: possible };
  }

  function combinePair(classic, ngn) {
    const classicPoints = pointPair(classic);
    const ngnPoints = pointPair(ngn);
    if (!classicPoints || !ngnPoints) return null;
    const earned = classicPoints.earned_points + ngnPoints.earned_points;
    const possible = classicPoints.possible_points + ngnPoints.possible_points;
    return {
      score: Math.round((earned / possible) * 10000) / 100,
      method: 'earned-points-over-possible-points',
      earned_points: earned,
      possible_points: possible
    };
  }

  function combine(classic, ngn) {
    const overall = combinePair(classic?.overall_points, ngn?.overall_points);
    const categoryResults = {};
    categories.forEach(category => {
      const value = combinePair(classic?.categories?.[category], ngn?.categories?.[category]);
      if (value) categoryResults[category] = value;
    });
    return {
      overall: overall || { score: null, method: 'insufficient-data', earned_points: null, possible_points: null },
      categories: categoryResults
    };
  }

  function status(category) {
    if (category?.question_count === 0) return 'not-tested';
    if (category?.score == null) return 'not-reported';
    return 'reported';
  }

  global.ArcherCAT = { categories, categoryName, combine, status };
}(window));
