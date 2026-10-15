/* Shared weekly study plan helpers (coach plan page + student dashboard). */
(function () {
  'use strict';
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  var LONG = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  var PORTAL = 'Portal Question Bank';
  var PLATFORMS = ['UWorld', 'Archer', 'Kaplan', 'Bootcamp', PORTAL, 'Other'];
  var DEFAULTS = Object.freeze({
    practice_days: ['mon', 'wed', 'fri'],
    practice_questions_per_day: 50,
    practice_platform: 'UWorld',
    cat_days: ['tue', 'sat'],
    cat_platform: 'UWorld'
  });

  function days(value, fallback) {
    if (!Array.isArray(value)) return fallback.slice();
    var seen = {};
    value.forEach(function (d) { d = String(d || '').trim().toLowerCase().slice(0, 3); if (LABELS[d]) seen[d] = true; });
    return DAYS.filter(function (d) { return seen[d]; });
  }
  function platform(value, fallback) {
    var v = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
    if (!v) return fallback;
    if (/^portal/i.test(v)) return PORTAL;
    return window.AssessmentPlatforms ? window.AssessmentPlatforms.name(v, fallback) : v;
  }
  function list(value) {
    var out = [];
    (Array.isArray(value) ? value : String(value || '').split(',')).forEach(function (item) {
      var v = String(item == null ? '' : item).trim().replace(/\s+/g, ' ');
      if (v && out.map(function (x) { return x.toLowerCase(); }).indexOf(v.toLowerCase()) < 0) out.push(v.slice(0, 80));
    });
    return out;
  }
  function categories(value) {
    var C = window.NCLEXCats;
    var picked = list(value).map(function (v) { return C ? C.canon(v, null) : v; }).filter(Boolean);
    return C ? C.NAMES.filter(function (n) { return picked.indexOf(n) >= 0; }) : picked;
  }
  function normalize(row) {
    row = row || {};
    var n = Number(row.practice_questions_per_day);
    return {
      practice_days: days(row.practice_days, DEFAULTS.practice_days),
      practice_questions_per_day: Number.isInteger(n) && n >= 1 && n <= 300 ? n : DEFAULTS.practice_questions_per_day,
      practice_platform: platform(row.practice_platform, DEFAULTS.practice_platform),
      cat_days: days(row.cat_days, DEFAULTS.cat_days),
      cat_platform: platform(row.cat_platform, DEFAULTS.cat_platform),
      focus_categories: categories(row.focus_categories),
      focus_topics: list(row.focus_topics),
      plan_notes: String(row.plan_notes || '').trim()
    };
  }
  // CATs closer than 2 days apart (including across the week boundary) are not "spaced out".
  function catSpacingOk(catDays) {
    var idx = days(catDays, []).map(function (d) { return DAYS.indexOf(d); });
    if (idx.length < 2) return true;
    for (var i = 0; i < idx.length; i++) {
      var next = i + 1 < idx.length ? idx[i + 1] : idx[0] + 7;
      if (next - idx[i] < 2) return false;
    }
    return true;
  }
  var MIN_PRACTICE_DAYS = 3;
  // Practice days that are not also CAT days; Madison wants at least 3 per week.
  function practiceOnlyDays(plan) {
    var p = normalize(plan);
    return p.practice_days.filter(function (d) { return p.cat_days.indexOf(d) < 0; });
  }
  function meetsPracticeMinimum(plan) { return practiceOnlyDays(plan).length >= MIN_PRACTICE_DAYS; }
  function week(plan) {
    var p = normalize(plan);
    return DAYS.map(function (d) {
      return { day: d, label: LABELS[d], long: LONG[d], practice: p.practice_days.indexOf(d) >= 0, cat: p.cat_days.indexOf(d) >= 0 };
    });
  }
  function summary(plan) {
    var p = normalize(plan);
    var total = p.practice_days.length * p.practice_questions_per_day;
    var lbl = function (arr) { return arr.map(function (d) { return LABELS[d]; }).join('/') || 'none'; };
    return p.practice_days.length + '× ' + p.practice_questions_per_day + ' Qs (' + lbl(p.practice_days) + ', ' + p.practice_platform + ') · ' +
      p.cat_days.length + ' CAT' + (p.cat_days.length === 1 ? '' : 's') + ' (' + lbl(p.cat_days) + ', ' + p.cat_platform + ') · ' + total + ' Qs/week';
  }
  window.WeeklyPlan = {
    DAYS: DAYS, LABELS: LABELS, LONG: LONG, PLATFORMS: PLATFORMS, PORTAL: PORTAL, DEFAULTS: DEFAULTS,
    MIN_PRACTICE_DAYS: MIN_PRACTICE_DAYS, normalize: normalize, catSpacingOk: catSpacingOk, practiceOnlyDays: practiceOnlyDays, meetsPracticeMinimum: meetsPracticeMinimum, week: week, summary: summary, topics: list
  };
})();
