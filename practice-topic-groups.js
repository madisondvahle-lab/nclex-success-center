(function () {
  const GROUPS = Object.freeze([
    'Cardiovascular',
    'Respiratory',
    'Neurological',
    'Endocrine',
    'Maternal–Newborn',
    'Pediatrics',
    'Mental Health',
    'Safety, Infection Prevention & Fundamentals',
    'Renal & Urinary',
    'Gastrointestinal',
    'Hematology & Oncology',
    'Musculoskeletal & Mobility',
    'Pharmacology & Medication Safety',
    'Leadership & Professional Practice',
    'Health Promotion & Screening',
    'Other Topics'
  ]);

  const GROUP_BY_TOPIC = Object.freeze({
    '24-hour urine collection': 'Renal & Urinary',
    'Acute anxiety support': 'Mental Health',
    'Acute decompensated heart failure': 'Cardiovascular',
    'Anticoagulants — Warfarin vs. Heparin': 'Pharmacology & Medication Safety',
    'Aseptic multidose vial access': 'Safety, Infection Prevention & Fundamentals',
    'Assessing potentially harmful auditory hallucinations': 'Mental Health',
    'Autonomic dysreflexia': 'Neurological',
    'Average-risk colorectal cancer screening age': 'Health Promotion & Screening',
    'Bleeding precautions with apixaban': 'Pharmacology & Medication Safety',
    'Breast cancer screening and individualized risk': 'Health Promotion & Screening',
    'C difficile transmission prevention': 'Safety, Infection Prevention & Fundamentals',
    'Catheter urine culture collection': 'Renal & Urinary',
    'Chest tube air leak troubleshooting': 'Respiratory',
    'CKD and Hyperkalemia': 'Renal & Urinary',
    'Clean-catch urine collection': 'Renal & Urinary',
    'Colostomy stoma assessment': 'Gastrointestinal',
    'Concurrent acute priorities and resource allocation': 'Leadership & Professional Practice',
    'Confidentiality and information sharing': 'Leadership & Professional Practice',
    'COPD exacerbation with hypercapnic acidosis': 'Respiratory',
    'Delegation': 'Leadership & Professional Practice',
    'Delegation and monitoring diuretic response': 'Leadership & Professional Practice',
    'Delegation of routine personal care': 'Leadership & Professional Practice',
    'Digoxin administration and toxicity precautions': 'Pharmacology & Medication Safety',
    'Disinfecting reusable noncritical patient equipment': 'Safety, Infection Prevention & Fundamentals',
    'DVT Prevention': 'Safety, Infection Prevention & Fundamentals',
    'Elder Abuse and Neglect': 'Safety, Infection Prevention & Fundamentals',
    'Escalation of unresolved deterioration': 'Leadership & Professional Practice',
    'Ethics and values': 'Leadership & Professional Practice',
    'Fall prevention during assisted transfer': 'Safety, Infection Prevention & Fundamentals',
    'Febrile neutropenia': 'Hematology & Oncology',
    'Follow-up after a positive stool-based colorectal cancer screening test': 'Health Promotion & Screening',
    'Haloperidol adverse effects': 'Pharmacology & Medication Safety',
    'Hand hygiene and glove use': 'Safety, Infection Prevention & Fundamentals',
    'Hand hygiene during central line dressing change': 'Safety, Infection Prevention & Fundamentals',
    'Heart failure daily weight monitoring': 'Cardiovascular',
    'Heel pressure prevention': 'Safety, Infection Prevention & Fundamentals',
    'Hemodialysis fistula assessment': 'Renal & Urinary',
    'Heparin-induced thrombocytopenia risk': 'Hematology & Oncology',
    'Home blood pressure measurement': 'Cardiovascular',
    'Hydration during infant bronchiolitis': 'Pediatrics',
    'Hyperglycemic crises and electrolyte management': 'Endocrine',
    'Immediate needlestick exposure response': 'Safety, Infection Prevention & Fundamentals',
    'Incentive spirometry technique': 'Respiratory',
    'Individualized fall-risk reduction': 'Safety, Infection Prevention & Fundamentals',
    'Infant formula hydration': 'Pediatrics',
    'Infant safe sleep': 'Pediatrics',
    'Influenza vaccination in pregnancy': 'Maternal–Newborn',
    'Informed consent and patient autonomy': 'Leadership & Professional Practice',
    'Inhaled corticosteroid administration teaching': 'Pharmacology & Medication Safety',
    'Intramuscular vaccine technique': 'Safety, Infection Prevention & Fundamentals',
    'Least-restrictive verbal de-escalation while maintaining immediate safety': 'Mental Health',
    'Lithium medication safety during dehydration': 'Pharmacology & Medication Safety',
    'LPN/VN assignment': 'Leadership & Professional Practice',
    'Magnesium sulfate toxicity risk': 'Pharmacology & Medication Safety',
    'Maternal hypotension after epidural analgesia': 'Maternal–Newborn',
    'Medication & Procedure Safety': 'Safety, Infection Prevention & Fundamentals',
    'Medication error immediate response': 'Safety, Infection Prevention & Fundamentals',
    'Medication identity verification': 'Safety, Infection Prevention & Fundamentals',
    'Medication reconciliation and dose discrepancy': 'Pharmacology & Medication Safety',
    'Medication reconciliation and interaction prevention': 'Pharmacology & Medication Safety',
    'Metoprolol succinate extended-release administration': 'Pharmacology & Medication Safety',
    'Monitoring acute kidney injury and complications': 'Renal & Urinary',
    'Monitoring and reporting heart-failure symptoms': 'Cardiovascular',
    'Monitoring and responding after naloxone': 'Pharmacology & Medication Safety',
    'Neurovascular compromise under a cast': 'Musculoskeletal & Mobility',
    'New deficit after subarachnoid hemorrhage': 'Neurological',
    'Newborn': 'Maternal–Newborn',
    'Nurse assignment by changing clinical acuity': 'Leadership & Professional Practice',
    'Nutrition and stimulation during mania': 'Mental Health',
    'OB': 'Maternal–Newborn',
    'Oral iron supplementation': 'Pharmacology & Medication Safety',
    'Oxytocin-associated excessive uterine activity': 'Maternal–Newborn',
    'Pediatric upper-airway compromise': 'Pediatrics',
    'Peripheral IV infiltration': 'Safety, Infection Prevention & Fundamentals',
    'Possible adrenal crisis after missed glucocorticoids': 'Endocrine',
    'Possible right ventricular infarction and nitrates': 'Cardiovascular',
    'Post-thoracentesis respiratory deterioration': 'Respiratory',
    'Postoperative pituitary water balance': 'Endocrine',
    'Postoperative urinary retention': 'Renal & Urinary',
    'Postpartum hemorrhage': 'Maternal–Newborn',
    'Postpartum hemorrhage and uterine atony': 'Maternal–Newborn',
    'Postpartum warning symptoms': 'Maternal–Newborn',
    'Potassium-Sparing Diuretics': 'Pharmacology & Medication Safety',
    'Preconception folic acid': 'Maternal–Newborn',
    'Pressure injury prevention': 'Safety, Infection Prevention & Fundamentals',
    'Qualified interpretation and privacy': 'Leadership & Professional Practice',
    'Radial-artery access-site bleeding': 'Cardiovascular',
    'Recognition of postpartum lochia rubra': 'Maternal–Newborn',
    'Recognizing an emergency COPD exacerbation': 'Respiratory',
    'Recognizing and responding to hypoglycemia': 'Endocrine',
    'Recognizing dehydration in a child': 'Pediatrics',
    'Recognizing gastrointestinal bleeding': 'Gastrointestinal',
    'Recognizing genital-tract laceration after birth': 'Maternal–Newborn',
    'Recognizing postpartum maternal warning signs': 'Maternal–Newborn',
    'Recognizing postpartum psychosis as an emergency': 'Mental Health',
    'Recognizing symptoms that may indicate preterm labor': 'Maternal–Newborn',
    'Rescue response to witnessed seizure': 'Neurological',
    'Respecting trauma-related treatment preferences': 'Mental Health',
    'Responsive feeding in toddlerhood': 'Pediatrics',
    'Safe administration of concentrated electrolytes': 'Pharmacology & Medication Safety',
    'Safety & Priority': 'Safety, Infection Prevention & Fundamentals',
    'SBAR escalation of deteriorating perfusion': 'Leadership & Professional Practice',
    'Severe asthma deterioration during treatment': 'Respiratory',
    'Single-dose vial handling': 'Safety, Infection Prevention & Fundamentals',
    'Sterile-field moisture contamination': 'Safety, Infection Prevention & Fundamentals',
    'Structured handoff and closed-loop communication': 'Leadership & Professional Practice',
    'Suicide risk screening': 'Mental Health',
    'Suspected C. difficile infection precautions': 'Safety, Infection Prevention & Fundamentals',
    'Suspected measles precautions': 'Safety, Infection Prevention & Fundamentals',
    'Suspected preterm prelabor rupture of membranes': 'Maternal–Newborn',
    'Suspected pulmonary TB precautions': 'Safety, Infection Prevention & Fundamentals',
    'Suspected transfusion reaction': 'Hematology & Oncology',
    'Symptomatic bradycardia after beta-blocker': 'Pharmacology & Medication Safety',
    'Tdap during pregnancy': 'Maternal–Newborn',
    'Teach-back and return demonstration': 'Safety, Infection Prevention & Fundamentals',
    'Therapeutic communication for anxiety': 'Mental Health',
    'Therapeutic response to persecutory belief and poor intake': 'Mental Health',
    'Thrombolytic therapy complication recognition': 'Pharmacology & Medication Safety',
    'Transmission precautions for disseminated zoster': 'Safety, Infection Prevention & Fundamentals',
    'Transporting a client with suspected pulmonary tuberculosis': 'Safety, Infection Prevention & Fundamentals',
    'Treatment of conscious hypoglycemia': 'Endocrine',
    'Using an epinephrine auto-injector for anaphylaxis': 'Pharmacology & Medication Safety',
    'Verification of discharge self-injection skill': 'Pharmacology & Medication Safety',
    'Walker-assisted ambulation': 'Musculoskeletal & Mobility',
    'Warfarin and TMP-SMX interaction': 'Pharmacology & Medication Safety'
  });

  const REVIEW_TOPICS = Object.freeze({
    'Acute-stroke aspiration prevention': 'The learning objective could center on stroke care, aspiration prevention, or both.',
    'Aspiration prevention during gastric tube feeding': 'The learning objective could center on feeding safety, gastrointestinal care, or respiratory protection.',
    'Clinical deterioration in suspected sepsis': 'The primary system and nursing objective are not clear from the label alone.',
    'Communication with hearing impairment': 'Could be communication practice, accessibility, or safety; the stem is needed to identify the focus.',
    'Hemodynamic instability with gastrointestinal bleeding': 'Could be gastrointestinal, cardiovascular, or hematology-focused.',
    'Medication access and discharge coordination': 'Could be medication safety or discharge coordination and professional practice.',
    'New confusion and safety assessment': 'Could be neurological assessment or immediate safety precautions.',
    'Nutrition': 'The label does not identify the population or learning objective.',
    'Ophthalmic drop administration': 'Could focus on medication administration or procedural technique.',
    'Positioning for gastric tube feeding': 'Could focus on gastrointestinal feeding or aspiration-prevention procedure.',
    'Post-bolus reassessment of dehydration': 'The population and intended system focus are not clear from the label alone.',
    'Post-thyroidectomy airway compromise': 'Could focus on endocrine surgery or respiratory airway management.',
    'Post-Tonsillectomy Hemorrhage': 'Could focus on pediatric care, airway safety, or hemorrhage response.',
    'Postoperative opioid-related respiratory depression': 'Could focus on respiratory deterioration or opioid medication safety.',
    'Prioritization of competing acute nursing assessment needs': 'Could focus on patient safety, assessment, or professional prioritization.',
    'Recognizing possible pulmonary embolism': 'Could be classified as respiratory or cardiovascular based on the question objective.',
    'Recognizing severe RSV respiratory distress': 'Could be classified by the respiratory problem or the pediatric population.',
    'Recognizing worsening tissue perfusion': 'The affected system and intended assessment focus are not clear from the label alone.',
    'Safe discharge transition and caregiver readiness': 'Could focus on patient teaching, home safety, or discharge coordination.',
    'Severe hyperkalemia with ECG changes': 'Could be classified by the renal/electrolyte cause or the cardiac manifestation.',
    'Sickle cell acute pulmonary complication': 'Could be classified by the hematologic disease or pulmonary complication.',
    'Trauma-informed physical assessment': 'Could focus on trauma-informed mental health care or assessment technique.',
    'Treatment preference and adverse-effect communication': 'Could focus on medication effects, communication, or patient autonomy.'
  });

  function questionCount(question) {
    const count = Number(question?.questionCount);
    return Number.isInteger(count) && count > 0 ? count : 1;
  }

  function topicsForGroups(selectedGroups, topicLabels = []) {
    const selected = new Set((selectedGroups || []).map(value => String(value || '').trim()));
    const topics = new Set([
      ...Object.keys(GROUP_BY_TOPIC),
      ...Object.keys(REVIEW_TOPICS),
      ...(topicLabels || []).map(topic => String(topic || '').trim())
    ]);
    return [...topics]
      .filter(topic => selected.has(GROUP_BY_TOPIC[topic] || 'Other Topics'))
      .sort((left, right) => left.localeCompare(right));
  }

  function summarize(questions) {
    const counts = new Map(GROUPS.map(group => [group, 0]));
    const topicCounts = new Map();
    const seen = new Map();
    const duplicateQuestionIds = new Set();
    let totalQuestionCount = 0;
    let mappedQuestionCount = 0;
    let fallbackQuestionCount = 0;

    (questions || []).forEach((question, index) => {
      const id = String(question?.id ?? `missing-id-${index}`);
      const topic = String(question?.topic || '').trim();
      const previousTopic = seen.get(id);
      if (previousTopic !== undefined) {
        duplicateQuestionIds.add(id);
        return;
      }
      seen.set(id, topic);

      const count = questionCount(question);
      totalQuestionCount += count;
      const group = GROUP_BY_TOPIC[topic] || 'Other Topics';
      counts.set(group, counts.get(group) + count);
      if (GROUP_BY_TOPIC[topic]) {
        mappedQuestionCount += count;
      } else {
        fallbackQuestionCount += count;
        const label = topic || 'No topic label';
        topicCounts.set(label, (topicCounts.get(label) || 0) + count);
      }
    });

    const unmappedTopics = [...topicCounts].map(([name, count]) => ({
      name,
      count,
      reason: REVIEW_TOPICS[name] || 'This topic has no approved broad-category mapping yet.'
    })).sort((left, right) => left.name.localeCompare(right.name));

    return {
      groups: GROUPS.map(name => ({ name, count: counts.get(name) })),
      unmappedTopics,
      fallbackTopics: unmappedTopics,
      duplicateQuestionIds: [...duplicateQuestionIds].sort(),
      totalQuestionCount,
      mappedQuestionCount,
      fallbackQuestionCount,
      unmappedQuestionCount: totalQuestionCount - mappedQuestionCount - fallbackQuestionCount,
      mappedTopicCount: Object.keys(GROUP_BY_TOPIC).length,
      configuredTopicCount: Object.keys(GROUP_BY_TOPIC).length + Object.keys(REVIEW_TOPICS).length
    };
  }

  window.PracticeTopicGroups = {
    GROUPS,
    GROUP_BY_TOPIC,
    REVIEW_TOPICS,
    topicsForGroups,
    summarize
  };
})();
