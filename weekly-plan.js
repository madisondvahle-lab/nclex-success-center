/* Shared weekly study plan helpers (coach plan page + student dashboard). */
(function () {
  'use strict';
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  var LONG = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  var PORTAL = 'Portal Question Bank';
  var PLATFORMS = ['UWorld', 'Archer', 'Kaplan', 'Bootcamp', 'Remar', 'NurseMeg', PORTAL, 'Other'];
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
  function catAssignments(value, fallback) {
    var out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    DAYS.forEach(function (day) {
      var item = value[day];
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      var task = {
        platform: platform(item.platform, fallback),
        title: String(item.title || '').trim().slice(0, 120),
        instructions: String(item.instructions || '').trim().slice(0, 500)
      };
      if (task.platform !== fallback || task.title || task.instructions) out[day] = task;
    });
    return out;
  }
  /* Per-day practice distribution: { platform, total, mixed, targets: [{ kind, name, count }] }.
     Counts are kept as entered so validation can report mismatches instead of silently fixing them. */
  var MAX_TARGETS = 8;
  function count(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }
  function target(item) {
    if (!item || typeof item !== 'object') return null;
    var kind = item.kind === 'topic' ? 'topic' : 'category';
    var name = String(item.name == null ? '' : item.name).trim().replace(/\s+/g, ' ').slice(0, 80);
    if (kind === 'category' && window.NCLEXCats) name = window.NCLEXCats.canon(name, name);
    return { kind: kind, name: name, count: count(item.count) };
  }
  function dayDistribution(item, fallbackPlatform) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    return {
      platform: platform(item.platform, fallbackPlatform),
      total: count(item.total),
      mixed: count(item.mixed),
      targets: (Array.isArray(item.targets) ? item.targets : []).map(target).filter(Boolean)
    };
  }
  function practiceDayAssignments(value, practiceDays, fallbackPlatform) {
    var out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    practiceDays.forEach(function (day) {
      var item = dayDistribution(value[day], fallbackPlatform);
      if (item) out[day] = item;
    });
    return out;
  }
  function wholeCount(n, min) { return Number.isInteger(n) && n >= min && n <= 300; }
  // Mirrors public.practice_distribution_error in supabase-practice-day-distribution-migration.sql.
  function distributionError(item) {
    if (!item) return 'Choose a practice day to customize.';
    if (!wholeCount(item.total, 1)) return 'Total questions must be a whole number from 1 to 300.';
    if (!wholeCount(item.mixed, 0)) return 'Mixed questions must be a whole number from 0 to 300.';
    if (item.targets.length > MAX_TARGETS) return 'Use up to ' + MAX_TARGETS + ' targeted areas per day.';
    var seen = {}, sum = item.mixed;
    for (var i = 0; i < item.targets.length; i++) {
      var t = item.targets[i];
      if (!t.name) return 'Choose a category or enter a topic for each targeted row.';
      if (t.kind === 'category' && window.NCLEXCats && window.NCLEXCats.NAMES.indexOf(t.name) < 0) return '“' + t.name + '” is not an NCLEX client-needs category.';
      if (!wholeCount(t.count, 1)) return 'Each targeted area needs a whole-number count from 1 to 300.';
      var key = t.kind + ':' + t.name.toLowerCase();
      if (seen[key]) return '“' + t.name + '” is listed more than once.';
      seen[key] = true;
      sum += t.count;
    }
    if (sum !== item.total) return 'Mixed and targeted questions add up to ' + sum + ', but the day total is ' + item.total + '.';
    return '';
  }
  function assigned(item) {
    return (Number.isFinite(item.mixed) ? item.mixed : 0) + item.targets.reduce(function (n, t) { return n + (Number.isFinite(t.count) ? t.count : 0); }, 0);
  }
  function distributionLines(item) {
    var lines = [];
    if (item.mixed > 0) lines.push(item.mixed + ' Mixed NCLEX Questions');
    item.targets.forEach(function (t) { lines.push(t.count + ' ' + t.name + ' Questions'); });
    return lines;
  }
  function remediationFocus(item) {
    return item.targets.map(function (t) { return t.name; }).join(', ');
  }
  function distributionShort(item) {
    return [item.mixed > 0 ? item.mixed + ' mixed' : ''].concat(item.targets.map(function (t) { return t.count + ' ' + t.name; })).filter(Boolean).join(' + ');
  }
  function setupInstructions(item) {
    if (item.platform === PORTAL) return 'Open the assignment in the portal; all ' + item.total + ' questions are included.';
    var parts = [];
    if (item.mixed > 0) parts.push(item.mixed + ' questions with all client-needs categories selected');
    item.targets.forEach(function (t) { parts.push(t.count + ' questions with only ' + t.name + ' selected'); });
    return 'Set this up yourself in ' + item.platform + ': create ' +
      (parts.length > 1 ? 'separate practice tests — ' + parts.join('; ') : 'a practice test with ' + parts[0]) +
      '. This portal does not create or configure tests in ' + item.platform + '.';
  }
  // Student-facing breakdown for a recurring plan day or a generated assignment's distribution snapshot.
  function describe(item) {
    return {
      heading: item.platform + ' Practice, ' + item.total + ' Questions',
      lines: distributionLines(item),
      focus: remediationFocus(item),
      setup: setupInstructions(item)
    };
  }
  function assignmentDistribution(resource) {
    var d = resource && resource.assignment_details;
    if (!d || !d.distribution || typeof d.distribution !== 'object') return null;
    var item = dayDistribution({ platform: d.platform, total: d.question_count, mixed: d.distribution.mixed, targets: d.distribution.targets }, d.platform || '');
    return item && !distributionError(item) ? item : null;
  }

  function normalize(row) {
    row = row || {};
    var n = Number(row.practice_questions_per_day);
    var practiceDays = days(row.practice_days, DEFAULTS.practice_days);
    var practicePlatform = platform(row.practice_platform, DEFAULTS.practice_platform);
    return {
      practice_days: practiceDays,
      practice_questions_per_day: Number.isInteger(n) && n >= 1 && n <= 300 ? n : DEFAULTS.practice_questions_per_day,
      practice_platform: practicePlatform,
      practice_day_assignments: practiceDayAssignments(row.practice_day_assignments, practiceDays, practicePlatform),
      cat_days: days(row.cat_days, DEFAULTS.cat_days),
      cat_platform: platform(row.cat_platform, DEFAULTS.cat_platform),
      cat_assignments: catAssignments(row.cat_assignments, platform(row.cat_platform, DEFAULTS.cat_platform)),
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
  function dayChangeError(plan, practiceDays, catDays) {
    var p = normalize(plan);
    if (!Array.isArray(practiceDays) || !Array.isArray(catDays) ||
        practiceDays.concat(catDays).some(function (d) { return DAYS.indexOf(d) < 0; })) {
      return 'Choose valid days from Monday through Sunday.';
    }
    if (days(practiceDays, []).length !== practiceDays.length || days(catDays, []).length !== catDays.length) {
      return 'Choose each day only once.';
    }
    if (practiceDays.length !== p.practice_days.length || catDays.length !== p.cat_days.length) {
      return 'Choose ' + p.practice_days.length + ' practice days and ' + p.cat_days.length + ' CAT days to keep your assigned weekly workload.';
    }
    if (practiceDays.some(function (d) { return catDays.indexOf(d) >= 0; })) {
      return 'Choose separate days for practice and CAT exams.';
    }
    if (!catSpacingOk(catDays)) return 'Leave at least one day between CAT exams, including across weeks.';
    return '';
  }
  function practiceTotal(p) {
    return p.practice_days.reduce(function (n, d) {
      var item = p.practice_day_assignments[d];
      return n + (item && Number.isInteger(item.total) ? item.total : p.practice_questions_per_day);
    }, 0);
  }
  function week(plan) {
    var p = normalize(plan);
    return DAYS.map(function (d) {
      var practice = p.practice_days.indexOf(d) >= 0;
      return { day: d, label: LABELS[d], long: LONG[d], practice: practice, cat: p.cat_days.indexOf(d) >= 0,
        custom: practice && p.practice_day_assignments[d] ? p.practice_day_assignments[d] : null };
    });
  }
  function summary(plan) {
    var p = normalize(plan);
    var total = practiceTotal(p);
    var lbl = function (arr) { return arr.map(function (d) { return LABELS[d]; }).join('/') || 'none'; };
    var base = p.practice_days.length + '× ' + p.practice_questions_per_day + ' Qs (' + lbl(p.practice_days) + ', ' + p.practice_platform + ') · ' +
      p.cat_days.length + ' CAT' + (p.cat_days.length === 1 ? '' : 's') + ' (' + lbl(p.cat_days) + ', ' + p.cat_platform + ') · ' + total + ' Qs/week';
    var custom = p.practice_days.filter(function (d) { return p.practice_day_assignments[d]; }).map(function (d) {
      var item = p.practice_day_assignments[d];
      return LABELS[d] + ': ' + item.total + ' Qs' + (item.platform !== p.practice_platform ? ' on ' + item.platform : '') + ' (' + distributionShort(item) + ')';
    });
    var details = p.cat_days.map(function (day) {
      var item = p.cat_assignments[day];
      if (!item || (item.platform === p.cat_platform && !item.title && !item.instructions)) return '';
      return LABELS[day] + ': ' + item.platform + (item.title ? ' — ' + item.title : '') +
        (item.instructions ? ' (' + item.instructions + ')' : '');
    }).filter(Boolean);
    return base + (custom.length ? ' · Custom days: ' + custom.join('; ') : '') + (details.length ? ' · CAT details: ' + details.join('; ') : '');
  }
  window.WeeklyPlan = {
    DAYS: DAYS, LABELS: LABELS, LONG: LONG, PLATFORMS: PLATFORMS, PORTAL: PORTAL, DEFAULTS: DEFAULTS,
    MIN_PRACTICE_DAYS: MIN_PRACTICE_DAYS, normalize: normalize, catSpacingOk: catSpacingOk, practiceOnlyDays: practiceOnlyDays, meetsPracticeMinimum: meetsPracticeMinimum, dayChangeError: dayChangeError, week: week, summary: summary, topics: list,
    MAX_TARGETS: MAX_TARGETS, dayDistribution: dayDistribution, distributionError: distributionError, assigned: assigned, practiceTotal: practiceTotal,
    distributionLines: distributionLines, distributionShort: distributionShort, remediationFocus: remediationFocus, setupInstructions: setupInstructions,
    describe: describe, assignmentDistribution: assignmentDistribution
  };
})();
