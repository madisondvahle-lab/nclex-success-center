// Assessment-history personalization for the NCLEX Success Center.
// This file contains no clinical question content. It normalizes category scores from
// external readiness/CAT platforms and turns the most recent evidence into modest
// selection weights. Required safety coverage always takes precedence.
(function () {
  const categories = [
    'Management of Care',
    'Safety & Infection Prevention',
    'Health Promotion & Maintenance',
    'Psychosocial Integrity',
    'Basic Care & Comfort',
    'Pharmacological & Parenteral Therapies',
    'Reduction of Risk Potential',
    'Physiological Adaptation'
  ];
  const aliases = {
    'management of care': 'Management of Care', 'management': 'Management of Care', 'care management': 'Management of Care',
    'safety & infection prevention': 'Safety & Infection Prevention', 'safety and infection prevention': 'Safety & Infection Prevention', 'safety/infection control': 'Safety & Infection Prevention', 'infection control': 'Safety & Infection Prevention',
    'health promotion & maintenance': 'Health Promotion & Maintenance', 'health promotion and maintenance': 'Health Promotion & Maintenance', 'health promotion': 'Health Promotion & Maintenance',
    'psychosocial integrity': 'Psychosocial Integrity', 'psychosocial': 'Psychosocial Integrity', 'mental health': 'Psychosocial Integrity',
    'basic care & comfort': 'Basic Care & Comfort', 'basic care and comfort': 'Basic Care & Comfort', 'basic care': 'Basic Care & Comfort',
    'pharmacological & parenteral therapies': 'Pharmacological & Parenteral Therapies', 'pharmacological and parenteral therapies': 'Pharmacological & Parenteral Therapies', 'pharmacology': 'Pharmacological & Parenteral Therapies', 'pharm': 'Pharmacological & Parenteral Therapies',
    'reduction of risk potential': 'Reduction of Risk Potential', 'risk reduction': 'Reduction of Risk Potential',
    'physiological adaptation': 'Physiological Adaptation', 'physiological': 'Physiological Adaptation'
  };
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const canonicalCategory = value => aliases[String(value || '').trim().toLowerCase()] || null;
  function normalizedScores(rawScores) {
    const scores = {};
    if (!rawScores || typeof rawScores !== 'object' || Array.isArray(rawScores)) return scores;
    Object.entries(rawScores).forEach(([label, rawScore]) => {
      const category = canonicalCategory(label);
      const score = Number(rawScore);
      if (category && Number.isFinite(score) && score >= 0 && score <= 100) scores[category] = score;
    });
    return scores;
  }
  function assessmentAgeWeight(takenAt) {
    if (!takenAt) return 1;
    const timestamp = new Date(takenAt).getTime();
    if (!Number.isFinite(timestamp)) return 1;
    const ageDays = Math.max(0, (Date.now() - timestamp) / 86400000);
    return Math.pow(0.5, ageDays / 120);
  }
  function buildProfile(assessments) {
    const totals = {}, weights = {};
    const usable = Array.isArray(assessments) ? assessments : [];
    usable.forEach(assessment => {
      const recency = assessmentAgeWeight(assessment.taken_at || assessment.created_at);
      Object.entries(normalizedScores(assessment.category_scores)).forEach(([category, score]) => {
        totals[category] = (totals[category] || 0) + score * recency;
        weights[category] = (weights[category] || 0) + recency;
      });
    });
    const categoryScores = {}, categoryWeights = {};
    categories.forEach(category => {
      if (!weights[category]) return;
      const score = totals[category] / weights[category];
      categoryScores[category] = Math.round(score);
      // Scores below 75 receive a modest boost. The cap prevents external data
      // from overwhelming CAT ability matching or the NCLEX blueprint.
      categoryWeights[category] = Number(clamp(1 + (75 - score) / 55, 0.8, 1.65).toFixed(2));
    });
    const focusCategories = Object.entries(categoryScores).sort(([, a], [, b]) => a - b).slice(0, 3).map(([category]) => category);
    return { assessmentCount: usable.length, categoryScores, categoryWeights, focusCategories, hasPersonalization: Object.keys(categoryScores).length > 0 };
  }
  window.NCLEX_ASSESSMENT_PERSONALIZATION = { categories, canonicalCategory, normalizedScores, buildProfile };
})();