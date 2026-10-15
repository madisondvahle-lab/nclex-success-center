(function () {
  'use strict';
  const names = {
    uworld: 'UWorld', archer: 'Archer', kaplan: 'Kaplan', bootcamp: 'Bootcamp',
    ati: 'ATI', hesi: 'HESI', ncsbn: 'NCSBN', other: 'Other'
  };
  const clean = value => String(value || '').trim().replace(/\s+/g, ' ');
  const key = value => clean(value).toLowerCase();
  window.AssessmentPlatforms = {
    key,
    name(value, fallback = 'Assessment') {
      const label = clean(value);
      return Object.hasOwn(names, key(label)) ? names[key(label)] : label || fallback;
    }
  };
})();
