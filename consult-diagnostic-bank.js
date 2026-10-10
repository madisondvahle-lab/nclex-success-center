// NCLEX Success Center — Consult Diagnostic item set v1 (original items).
// Used by madison-diagnostic.html for tutor-led consultation screenshares.
// Tags: category = NCLEX client-need area, topic = content area,
// pattern = how the question is asked (used to separate content gaps from test-taking gaps),
// difficulty 1 (foundational) to 3 (higher-level judgment).
(function () {
  const P = {
    priority: 'Priority / first action',
    teaching: 'Teaching & needs follow-up',
    recognize: 'Recognizing findings',
    action: 'Nursing actions & interventions',
    comm: 'Therapeutic communication',
    delegate: 'Safety, assignment & placement',
    math: 'Medication math'
  };
  const C = {
    mgmt: 'Management of Care', safety: 'Safety & Infection Control', health: 'Health Promotion & Maintenance',
    psych: 'Psychosocial Integrity', pharm: 'Pharmacological & Parenteral Therapies',
    risk: 'Reduction of Risk Potential', physio: 'Physiological Adaptation'
  };
  const q = (id, type, category, topic, pattern, difficulty, stem, options, correct, rationale) =>
    ({ id, type, category, topic, pattern: P[pattern], difficulty, stem, options, correct: [].concat(correct), rationale });

  window.CONSULT_DIAGNOSTIC_PATTERNS = P;
  window.CONSULT_DIAGNOSTIC_BANK = [
    q('cd001', 'mcq', C.pharm, 'Pharmacology', 'teaching', 2,
      'The nurse is teaching a client who has started lithium for bipolar disorder. Which statement by the client indicates a need for <b>further teaching</b>?',
      ['"I will drink 2 to 3 liters of fluid every day."', '"I will cut back on salt in my diet to help control my blood pressure."', '"I will have my lithium blood level checked as scheduled."', '"I will call the clinic if I have vomiting or diarrhea."'], 1,
      'Low sodium intake makes the kidneys reabsorb more lithium, which raises the level and risks toxicity. Clients need steady sodium and fluid intake, and vomiting or diarrhea (sodium and fluid loss) should be reported.'),
    q('cd002', 'mcq', C.risk, 'Fundamentals', 'priority', 1,
      'A client is receiving a unit of packed red blood cells. Fifteen minutes after the start, the client reports chills and low back pain, and has a temperature of 101.2 F (38.4 C) and a blood pressure of 94/58 mm Hg. Which action should the nurse take <b>first</b>?',
      ['Notify the healthcare provider.', 'Stop the transfusion.', 'Infuse 0.9% sodium chloride through new IV tubing.', 'Send the blood bag and tubing to the blood bank.'], 1,
      'These findings suggest an acute hemolytic reaction. The first action is to stop the transfusion so no more incompatible blood enters the client. Then keep the vein open with saline through new tubing, notify the provider, and return the bag and tubing.'),
    q('cd003', 'mcq', C.physio, 'Respiratory', 'priority', 2,
      'A client is hospitalized with an acute asthma exacerbation and has been wheezing loudly. On reassessment, the wheezing is no longer audible, the client is drowsy, and respiratory effort is weak. Which action should the nurse take <b>first</b>?',
      ['Document that the wheezing has resolved.', 'Encourage the client to cough and deep breathe.', 'Place the client supine to rest.', 'Call for emergency help and prepare for airway support.'], 3,
      'Disappearing wheezes with drowsiness and weak effort indicate little air movement and impending respiratory failure ("silent chest"), not improvement. This is an emergency that needs immediate airway support.'),
    q('cd004', 'mcq', C.physio, 'Endocrine', 'priority', 3,
      'The nurse is caring for a client admitted with diabetic ketoacidosis. Blood glucose is 560 mg/dL (31.1 mmol/L), respirations are deep and rapid, mucous membranes are dry, and the heart rate is 126/min. Which prescribed intervention should the nurse implement <b>first</b>?',
      ['Regular insulin IV bolus', 'Isotonic IV fluid bolus', 'Sodium bicarbonate IV', 'Potassium chloride infusion'], 1,
      'Severe volume depletion drives DKA. Isotonic fluids restore perfusion first and also begin to lower glucose. Insulin follows once the serum potassium is known to be adequate, potassium replacement is guided by the level, and bicarbonate is reserved for severe acidosis.'),
    q('cd005', 'mcq', C.physio, 'Maternal & OB', 'action', 2,
      'The nurse is assessing a client 1 hour after a vaginal birth. The fundus is soft, 2 cm above the umbilicus, and displaced to the right, and there is a moderate amount of bright red lochia. Which action should the nurse take <b>first</b>?',
      ['Administer the prescribed oxytocin.', 'Assist the client to empty her bladder.', 'Notify the healthcare provider.', 'Begin fundal massage.'], 1,
      'A full bladder pushes the uterus up and to the side and prevents it from contracting, which causes atony and bleeding. Emptying the bladder comes first; then reassess and massage the fundus if it remains boggy.'),
    q('cd006', 'sata', C.pharm, 'Pharmacology', 'recognize', 2,
      'The nurse is caring for a client who takes digoxin and has possible digoxin toxicity. Which findings support this concern? <b>Select all that apply.</b>',
      ['Anorexia and nausea', 'Yellow-green halos around lights', 'Tinnitus', 'Heart rate of 48/min', 'Constipation'], [0, 1, 3],
      'Digoxin toxicity causes GI symptoms (anorexia, nausea, vomiting), visual changes (blurred vision, yellow-green halos), and dysrhythmias such as bradycardia. Tinnitus is associated with salicylates and aminoglycosides; constipation is not a typical sign.'),
    q('cd007', 'mcq', C.psych, 'Mental Health', 'comm', 2,
      'A client with schizophrenia tells the nurse, "The voices say the staff is poisoning my food." Which response by the nurse is <b>most appropriate</b>?',
      ['"There are no voices. No one is poisoning your food."', '"Why do you think the staff would want to poison you?"', '"I do not hear the voices, but I can see this is frightening. I will stay with you while you eat."', '"Let\'s talk about something more pleasant."'], 2,
      'Acknowledge the feeling, present reality without arguing, and offer presence. Denying the experience, asking "why," or changing the subject break trust and do not reduce fear.'),
    q('cd008', 'mcq', C.safety, 'Infection Control', 'delegate', 2,
      'The charge nurse must place a client with <i>Clostridioides difficile</i> infection in a semi-private room because no private rooms are available. Which client is the <b>most appropriate</b> roommate?',
      ['A client with neutropenia after chemotherapy', 'A client who is 1 day after a total hip arthroplasty', 'A client with a new kidney transplant', 'A client who also has <i>C. difficile</i> infection'], 3,
      'Clients with the same active infection can be cohorted. Immunocompromised clients (neutropenia, transplant) and surgical clients should never share a room with an infectious client.'),
    q('cd009', 'mcq', C.pharm, 'Renal', 'teaching', 2,
      'The nurse is teaching a client who has a new arteriovenous fistula in the left forearm for hemodialysis. Which statement by the client indicates a need for <b>further teaching</b>?',
      ['"I will feel for a vibration over the site each day."', '"I will avoid sleeping on my left arm."', '"I will not carry heavy bags on my left arm."', '"It is fine for staff to take my blood pressure in either arm."'], 3,
      'Blood pressure measurements, venipuncture, and IV access should never be done on the fistula arm because they can damage or clot the access. A daily thrill/bruit check and avoiding pressure or heavy loads are correct.'),
    q('cd010', 'mcq', C.pharm, 'Pharmacology', 'action', 2,
      'A client receiving a continuous heparin infusion has an aPTT of 112 seconds and bleeding gums. After the infusion is stopped, which medication should the nurse anticipate administering?',
      ['Phytonadione (vitamin K)', 'Idarucizumab', 'Protamine sulfate', 'Acetylcysteine'], 2,
      'Protamine sulfate neutralizes heparin. Vitamin K reverses warfarin, idarucizumab reverses dabigatran, and acetylcysteine is the antidote for acetaminophen overdose.'),
    q('cd011', 'sata', C.physio, 'Pediatrics', 'recognize', 2,
      'The nurse is caring for a 3-year-old child with suspected Kawasaki disease. Which findings are consistent with this diagnosis? <b>Select all that apply.</b>',
      ['Fever lasting 5 days or longer', 'Strawberry tongue and red, cracked lips', 'Purulent drainage from both eyes', 'Peeling skin on the fingertips', 'Fluid-filled blisters on the trunk'], [0, 1, 3],
      'Kawasaki disease causes prolonged fever, oral changes (strawberry tongue, cracked red lips), non-purulent conjunctivitis, swollen hands and feet with later peeling, rash, and cervical lymphadenopathy. Purulent eye drainage and vesicles point to other illnesses.'),
    q('cd012', 'mcq', C.risk, 'Endocrine', 'priority', 2,
      'The nurse is caring for a client 6 hours after a total thyroidectomy. Which finding requires the nurse\'s <b>immediate</b> attention?',
      ['Mild hoarseness of the voice', 'Incisional pain rated 4/10', 'Tingling in the fingertips', 'Neck swelling with noisy, high-pitched breathing'], 3,
      'Neck swelling with stridor suggests bleeding or hematoma compressing the airway. Airway comes first. Hoarseness and mild pain are common; tingling suggests hypocalcemia and needs prompt follow-up, but does not outrank airway compromise.'),
    q('cd013', 'mcq', C.safety, 'Neurologic', 'action', 1,
      'A client sitting in the day room begins a generalized tonic-clonic seizure. Which action should the nurse take <b>first</b>?',
      ['Place a padded tongue blade between the teeth.', 'Restrain the arms and legs.', 'Administer IV lorazepam.', 'Ease the client to the floor and protect the head.'], 3,
      'Protecting the client from injury is the first priority. Never put anything in the mouth or restrain the client. Time the seizure, turn the client to the side when movements stop, and give medication as prescribed.'),
    q('cd014', 'sata', C.health, 'Oncology', 'teaching', 2,
      'The nurse is teaching a client with neutropenia from chemotherapy. Which statements by the client indicate understanding? <b>Select all that apply.</b>',
      ['"I will check my temperature daily and call if it is 100.4 F (38 C) or higher."', '"If I get a fever, I will take acetaminophen first and call only if it does not help."', '"I will keep cleaning my cat\'s litter box each day."', '"I will avoid crowded places such as shopping malls."', '"I will use a soft-bristled toothbrush."'], [0, 3, 4],
      'Fever may be the only sign of infection in neutropenia and must be reported right away; acetaminophen can mask it. Avoid crowds and animal waste, and protect the mucosa with a soft toothbrush.'),
    q('cd015', 'mcq', C.physio, 'Fluids & Electrolytes', 'recognize', 2,
      'A client who takes furosemide has a serum potassium of 2.9 mEq/L (2.9 mmol/L). Which ECG finding should the nurse expect?',
      ['Tall, peaked T waves', 'Prominent U waves', 'Widened QRS complex', 'Shortened QT interval'], 1,
      'Hypokalemia produces flattened T waves, ST depression, and U waves, and can prolong the QT interval. Peaked T waves and a widened QRS are findings of hyperkalemia.'),
    q('cd016', 'mcq', C.pharm, 'Endocrine', 'teaching', 2,
      'The nurse is teaching a client who has a new prescription for levothyroxine. Which statement by the client requires <b>follow-up</b>?',
      ['"I will take it in the morning on an empty stomach."', '"I will take it at the same time as my calcium supplement."', '"I will report chest pain or a racing heart."', '"I will have my thyroid level checked as scheduled."'], 1,
      'Calcium, iron, and antacids decrease levothyroxine absorption; they should be separated by about 4 hours. Chest pain or tachycardia can signal too much thyroid hormone and should be reported.'),
    q('cd017', 'mcq', C.pharm, 'Mental Health', 'action', 2,
      'A client admitted for pneumonia last drank alcohol 2 days ago. The client is now tremulous and diaphoretic, with a heart rate of 122/min and blood pressure of 170/98 mm Hg, and reports seeing insects on the wall. The nurse should anticipate a prescription for which medication?',
      ['Naltrexone', 'Haloperidol', 'Disulfiram', 'Lorazepam'], 3,
      'This is alcohol withdrawal with autonomic hyperactivity and hallucinations. Benzodiazepines such as lorazepam are first-line treatment and prevent seizures and delirium tremens. Naltrexone and disulfiram are for relapse prevention, and antipsychotics can lower the seizure threshold.'),
    q('cd018', 'sata', C.physio, 'Cardiac', 'recognize', 2,
      'The nurse is assessing a client with left-sided heart failure. Which findings should the nurse expect? <b>Select all that apply.</b>',
      ['Jugular vein distention', 'Bibasilar crackles', 'Hepatomegaly', 'Orthopnea', 'Pink, frothy sputum'], [1, 3, 4],
      'Left-sided failure backs blood up into the lungs: crackles, orthopnea, cough, and, in pulmonary edema, pink frothy sputum. JVD, hepatomegaly, and dependent edema reflect right-sided failure.'),
    q('cd019', 'mcq', C.pharm, 'Maternal & OB', 'recognize', 2,
      'The nurse is caring for a client with severe preeclampsia who is receiving a magnesium sulfate infusion. Which finding requires <b>immediate</b> intervention?',
      ['Feeling warm and flushed', 'Patellar reflexes of 2+', 'Respiratory rate of 10/min', 'Urine output of 45 mL/hr'], 2,
      'A respiratory rate below 12/min suggests magnesium toxicity with respiratory depression. Stop the infusion, support breathing, and prepare calcium gluconate. Warmth is an expected effect, and reflexes of 2+ and adequate urine output are reassuring.'),
    q('cd020', 'mcq', C.physio, 'Neurologic', 'recognize', 3,
      'The nurse is caring for a client with a head injury. Which finding is a <b>late</b> sign of increased intracranial pressure?',
      ['Restlessness and irritability', 'Headache that worsens with coughing', 'Slowed pupillary response to light', 'Heart rate of 48/min, blood pressure of 188/82 mm Hg, and irregular respirations'], 3,
      'Cushing triad (bradycardia, widening pulse pressure with hypertension, irregular respirations) is a late sign of brain stem compression. Restlessness and a change in level of consciousness are the earliest signs.'),
    q('cd021', 'mcq', C.risk, 'GI / Nutrition', 'action', 1,
      'The nurse has inserted a new small-bore nasogastric feeding tube. Which method is the most reliable for confirming placement before the first feeding?',
      ['Auscultate over the stomach while injecting air.', 'Obtain an abdominal x-ray.', 'Place the tube end in water and look for bubbling.', 'Ask the client to speak.'], 1,
      'Radiographic confirmation is the standard before initial use of a small-bore feeding tube. Auscultation of injected air and bubbling in water are unreliable and can miss lung placement.'),
    q('cd022', 'mcq', C.physio, 'Respiratory', 'action', 2,
      'A client has a chest tube connected to a three-chamber drainage system. The nurse notes continuous bubbling in the water-seal chamber. Which action should the nurse take <b>first</b>?',
      ['Clamp the chest tube close to the insertion site.', 'Document this as an expected finding.', 'Assess the client and check the system for loose connections.', 'Add sterile water to the suction chamber.'], 2,
      'Continuous bubbling in the water seal indicates an air leak, from the client or the system. Assess the client\'s respiratory status and check connections. Do not clamp the tube, which can cause a tension pneumothorax.'),
    q('cd023', 'fill', C.pharm, 'Pharmacology', 'math', 1,
      'The provider prescribes amoxicillin 250 mg PO every 8 hours for a child. The oral suspension available is 125 mg per 5 mL. How many mL should the nurse administer per dose? <b>Enter a number only.</b>',
      null, 10,
      '250 mg ÷ 125 mg × 5 mL = 10 mL per dose.'),
    q('cd024', 'mcq', C.mgmt, 'Priority Setting', 'priority', 2,
      'The nurse receives report on four clients. Which client should the nurse assess <b>first</b>?',
      ['A client 1 day after a total knee arthroplasty with incisional pain rated 6/10', 'A client with type 2 diabetes with a morning blood glucose of 210 mg/dL (11.7 mmol/L)', 'A client 2 hours after a femoral-access cardiac catheterization with a new cool, pale foot and a weak pedal pulse', 'A client with pneumonia and a temperature of 100.6 F (38.1 C)'], 2,
      'A new cool, pale foot with a weak pulse after arterial access suggests an arterial occlusion or bleeding that threatens the limb. The other findings are expected or less urgent.'),

    {
      kind: 'case', id: 'cdcase1', category: C.physio, topic: 'Cardiac', difficulty: 3,
      title: 'Heart failure case study',
      scenario: 'The nurse is caring for a 68-year-old male client admitted to the medical unit.',
      tabs: [
        {
          id: 'hp', label: 'History and Physical', html: `<table class="ex-table"><thead><tr><th>Body System</th><th>Findings</th></tr></thead><tbody>
<tr><th>General</th><td>The client reports 3 days of increasing shortness of breath and now sleeps sitting up on 3 pillows. He has gained 6 lb (2.7 kg) in 4 days. History of hypertension, type 2 diabetes mellitus, and heart failure. Home medications include furosemide, lisinopril, and metformin. Fingerstick glucose is 182 mg/dL (10.1 mmol/L). The client appears anxious.</td></tr>
<tr><th>Pulmonary</th><td>RR 26/min, SpO<sub>2</sub> 89% on room air. Bilateral crackles to the mid-lung fields. Cough with white, frothy sputum.</td></tr>
<tr><th>Cardiovascular</th><td>HR 112/min, BP 156/94 mm Hg. S<sub>3</sub> gallop present. Jugular vein distention to the angle of the jaw. Temperature 98.6 F (37 C).</td></tr>
<tr><th>Gastrointestinal</th><td>Abdomen is soft with mild distention. Reports early satiety.</td></tr>
<tr><th>Extremities</th><td>3+ pitting edema of both lower legs extending to the knees. Skin is cool.</td></tr>
<tr><th>Neurologic</th><td>Alert and oriented. Anxious but follows commands.</td></tr></tbody></table>`
        },
        {
          id: 'lab', label: 'Laboratory Results', fromItem: 3, html: `<table class="ex-table"><thead><tr><th>Laboratory Test and Reference Range</th><th>Admission</th></tr></thead><tbody>
<tr><th>B-type natriuretic peptide<br><span style="font-weight:400">Less than 100 pg/mL</span></th><td>1,250 pg/mL</td></tr>
<tr><th>Sodium<br><span style="font-weight:400">135-145 mEq/L (135-145 mmol/L)</span></th><td>133 mEq/L (133 mmol/L)</td></tr>
<tr><th>Potassium<br><span style="font-weight:400">3.5-5.0 mEq/L (3.5-5.0 mmol/L)</span></th><td>3.4 mEq/L (3.4 mmol/L)</td></tr>
<tr><th>BUN<br><span style="font-weight:400">10-20 mg/dL (3.6-7.1 mmol/L)</span></th><td>28 mg/dL (10 mmol/L)</td></tr>
<tr><th>Creatinine<br><span style="font-weight:400">0.6-1.2 mg/dL (53-106 micromol/L)</span></th><td>1.4 mg/dL (124 micromol/L)</td></tr>
<tr><th>Troponin I<br><span style="font-weight:400">Less than 0.04 ng/mL</span></th><td>0.02 ng/mL</td></tr></tbody></table>`
        },
        {
          id: 'pn', label: 'Progress Notes', fromItem: 5, html: `<p><b>Cardiac Unit — Hospital Day 2</b></p><p>The client has received IV furosemide and supplemental oxygen overnight. Review the progress note in the response area.</p>`
        }
      ],
      items: [
        {
          id: 'cdcase1-1', type: 'sata', pattern: P.recognize,
          prompt: 'Which of the following client findings require <b>immediate</b> follow-up? <b>Select all that apply.</b>',
          options: ['Oxygen saturation of 89%', 'Respiratory rate of 26/min', 'Blood pressure of 156/94 mm Hg', 'Fingerstick glucose of 182 mg/dL', 'Bilateral crackles with frothy sputum', 'Temperature of 98.6 F (37 C)'], correct: [0, 1, 4],
          rationale: 'Hypoxemia, tachypnea, and crackles with frothy sputum show impaired gas exchange from pulmonary congestion and need immediate action. The blood pressure and glucose should be addressed but are not immediately life-threatening; the temperature is normal.'
        },
        {
          id: 'cdcase1-2', type: 'matrix', pattern: P.recognize,
          prompt: 'For each finding below, click to specify whether the finding is consistent with <b>left-sided</b> or <b>right-sided</b> heart failure. Each finding may support more than one condition.',
          rowLabel: 'Finding', cols: ['Left-sided', 'Right-sided'],
          rows: ['Bilateral crackles', 'Jugular vein distention', 'Orthopnea', 'Dependent pitting edema', 'Fatigue and activity intolerance'],
          correct: ['0:0', '1:1', '2:0', '3:1', '4:0', '4:1'], note: 'Note: Each row must have at least 1 response option selected.',
          rationale: 'Left-sided failure backs blood into the lungs (crackles, orthopnea). Right-sided failure backs blood into the systemic veins (JVD, dependent edema). Fatigue and reduced activity tolerance result from reduced cardiac output in either.'
        },
        {
          id: 'cdcase1-3', type: 'cloze', pattern: P.recognize,
          intro: 'The nurse has reviewed the information from the History and Physical and Laboratory Results.',
          prompt: 'Complete the following sentence by choosing from the lists of options.',
          template: 'The nurse is <b>most</b> concerned about the client\'s risk for developing {{0}} due to {{1}}.',
          dropdowns: [
            { options: ['pulmonary embolism', 'pulmonary edema', 'pneumothorax'], correct: 1 },
            { options: ['clots forming in the leg veins', 'air entering the pleural space', 'fluid backing up into the lungs from left ventricular failure'], correct: 2 }
          ],
          rationale: 'The elevated BNP, crackles, S3, and weight gain show fluid overload from a failing left ventricle; unchecked, that pressure drives fluid into the alveoli (pulmonary edema).'
        },
        {
          id: 'cdcase1-4', type: 'sata', pattern: P.action,
          prompt: 'Which of the following actions should the nurse implement? <b>Select all that apply.</b>',
          options: ['Place the client in a high-Fowler position', 'Encourage the client to drink 3 L of fluid daily', 'Administer supplemental oxygen and titrate to SpO\u2082', 'Monitor intake and output strictly', 'Keep the client flat in bed to rest', 'Administer IV furosemide as prescribed'], correct: [0, 2, 3, 5],
          rationale: 'Upright positioning eases breathing, oxygen corrects hypoxemia, the diuretic removes excess fluid, and strict intake and output measure response. Extra fluids and lying flat worsen congestion.'
        },
        {
          id: 'cdcase1-5', type: 'highlight', pattern: P.recognize,
          intro: 'The nurse has reviewed the information from the Progress Notes.',
          prompt: 'Click to highlight below the findings that indicate the client is <b>progressing as expected</b>.',
          segments: [
            { t: 'Hospital Day 2: The client says, "I only needed ' }, { id: 'h1', t: 'one pillow', correct: true }, { t: ' to sleep last night." Weight is ' },
            { id: 'h2', t: 'down 6 lb (2.7 kg)', correct: true }, { t: ' from admission. ' }, { id: 'h3', t: 'SpO\u2082 is 95% on 2 L/min by nasal cannula', correct: true },
            { t: ' and ' }, { id: 'h4', t: 'respiratory rate is 20/min', correct: true }, { t: '. ' }, { id: 'h5', t: 'Crackles are heard at the bases only', correct: true },
            { t: '. The client reports ' }, { id: 'h6', t: 'leg cramps' }, { t: ' and ' }, { id: 'h7', t: 'lightheadedness when standing' },
            { t: '. Morning laboratory results show ' }, { id: 'h8', t: 'potassium 3.1 mEq/L (3.1 mmol/L)' }, { t: '.' }
          ],
          rationale: 'Fewer pillows, weight loss, improved oxygenation and respiratory rate, and clearing lung sounds show effective diuresis. Leg cramps, lightheadedness, and a lower potassium are adverse effects of diuresis that need follow-up, not signs of expected progress.'
        },
        {
          id: 'cdcase1-6', type: 'mcq', pattern: P.action,
          intro: 'The nurse has reviewed the information from the Progress Notes.',
          prompt: 'Which prescription should the nurse anticipate for the client\'s leg cramps and potassium of 3.1 mEq/L?',
          options: ['Potassium chloride replacement', 'Sodium polystyrene sulfonate', 'Calcium gluconate IV', 'A potassium-restricted diet'], correct: [0],
          rationale: 'Loop diuretics waste potassium. Hypokalemia increases the risk of dysrhythmias, so potassium replacement is expected. Sodium polystyrene and a potassium restriction treat hyperkalemia; calcium gluconate protects the heart in hyperkalemia.'
        }
      ]
    }
  ];
})();
