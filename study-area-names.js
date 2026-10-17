(function(){
  const NAMES=[
    'Adult Health / Medical-Surgical',
    'Maternal & Newborn',
    'Pediatrics',
    'Mental Health',
    'Pharmacology & Medication Safety',
    'Fundamentals, Safety & Infection Control',
    'Leadership & Professional Practice',
    'Health Promotion & Maintenance'
  ];

  function isKnown(value){
    return NAMES.includes(String(value||'').trim());
  }

  window.NCLEXStudyAreas={NAMES:NAMES,isKnown:isKnown};
})();
