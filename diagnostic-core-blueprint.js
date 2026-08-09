// Core RN safety blueprint used by the CAT diagnostic and full mock simulations.
// Item IDs are intentionally mapped rather than clinical wording being duplicated.
(function () {
  const requirements = [
    { key: 'delegation', label: 'Delegation, assignment, and supervision', itemIds: ['m1', 'm2', 'x001', 'x002', 'x009', 'x100'] },
    { key: 'consent_rights', label: 'Informed consent, autonomy, and client rights', itemIds: ['x003', 'x004', 'x008'] },
    { key: 'infection_prevention', label: 'Infection prevention and transmission-based precautions', itemIds: ['si1', 'si2', 'x011', 'x012', 'x013', 'x015', 'x018', 'x095'] },
    { key: 'insulin_glucose', label: 'Insulin and hypoglycemia safety', itemIds: ['ph1', 'x049', 'x058', 'x096'] },
    { key: 'high_alert_medications', label: 'High-alert medication and electrolyte safety', itemIds: ['ph2', 'ph3', 'ph4', 'x050', 'x053', 'x054', 'x056'] },
    { key: 'blood_administration', label: 'Blood administration and transfusion reaction response', itemIds: ['x060'] },
    { key: 'airway_breathing', label: 'Airway, breathing, and respiratory emergency response', itemIds: ['pa1', 'x047', 'x061', 'x072', 'x073', 'x074', 'x091'] },
    { key: 'circulation_shock', label: 'Cardiac perfusion, sepsis, shock, and dysrhythmia risk', itemIds: ['pa2', 'pa3', 'x066', 'x069', 'x070', 'x071', 'x075'] },
    { key: 'fluids_electrolytes', label: 'Fluids, electrolytes, and acid-base safety', itemIds: ['rr1', 'rr2', 'x064', 'x065', 'x066', 'x090', 'x092', 'x096'] },
    { key: 'postoperative_risk', label: 'Postoperative and acute-complication recognition', itemIds: ['bc2', 'rr3', 'x042', 'x061', 'x062', 'x063', 'x081', 'x082', 'x093'] },
    { key: 'maternal_newborn', label: 'Maternal, fetal, postpartum, and newborn safety', itemIds: ['hp6', 'x021', 'x022', 'x028', 'x077', 'x078', 'x079', 'x080', 'x098'] },
    { key: 'pediatrics', label: 'Pediatric growth, hydration, and safety', itemIds: ['hp3', 'x024', 'x025', 'x030', 'x076'] },
    { key: 'psych_safety', label: 'Mental-health crisis, suicide, and therapeutic communication', itemIds: ['ps1', 'ps2', 'ps3', 'ps4', 'ps5', 'ps6', 'x031', 'x032', 'x033', 'x034', 'x035', 'x037', 'x038', 'x040'] }
  ];

  const nclexCategoryTargets = {
    'Management of Care': 15,
    'Safety & Infection Prevention': 11,
    'Health Promotion & Maintenance': 8,
    'Psychosocial Integrity': 8,
    'Basic Care & Comfort': 8,
    'Pharmacological & Parenteral Therapies': 14,
    'Reduction of Risk Potential': 10,
    'Physiological Adaptation': 11
  };

  const byItemId = {};
  requirements.forEach(requirement => {
    requirement.itemIds.forEach(id => {
      if (!byItemId[id]) byItemId[id] = [];
      byItemId[id].push(requirement.key);
    });
  });

  window.NCLEX_CORE_BLUEPRINT = {
    requirements,
    nclexCategoryTargets,
    tagsForItem: item => byItemId[item.id] || []
  };
})();
