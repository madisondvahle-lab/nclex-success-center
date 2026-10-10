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
    q('cd025', 'mcq', C.mgmt, 'Priority Setting', 'priority', 2,
      'The nurse in the emergency department is caring for assigned clients. The nurse should <b>first</b> assess the client who is',
      ['14 years old and has scrotal pain and swelling with elevation of the right testis', '16 years old and has sickle cell disease with generalized body pain', '34 years old and has right-sided flank pain radiating to the groin', '46 years old and has diverticulitis with cramping pain in the left lower abdomen'], 0,
      'Sudden scrotal pain and swelling with an elevated testis suggests testicular torsion, a surgical emergency. The testis can lose blood supply within hours, so this client is assessed first. The other clients need care but are not at immediate risk of losing an organ.'),
    q('cd026', 'mcq', C.physio, 'Respiratory', 'action', 2,
      'The nurse enters the room of a client who had a tracheostomy created 2 months ago. The nurse notes that the client is in respiratory distress and the tracheostomy tube is lying on the bed next to the client. Which of the following actions should the nurse take?',
      ['Administer supplemental oxygen via simple face mask.', 'Insert a new tracheostomy tube using the bedside obturator.', 'Insert a sterile catheter into the stoma and suction the airway.', 'Place dry, sterile gauze over the stoma and secure it with tape.'], 1,
      'A mature tracheostomy (about 2 months) has an established tract, so the nurse can reinsert a new tube with the obturator to restore the airway right away. Oxygen by face mask or gauze over the stoma does not secure the airway, and suctioning without a tube in place does not relieve the obstruction.'),
    q('cd027', 'sata', C.physio, 'Respiratory', 'recognize', 2,
      'The nurse is caring for a client who has a pulmonary embolism. Which of the following findings would the nurse expect to observe? <b>Select all that apply.</b>',
      ['Dyspnea', 'Chest pain', 'Tachypnea', 'Hypoxemia', 'Bradycardia', 'Tracheal deviation'], [0, 1, 2, 3],
      'A clot blocking pulmonary blood flow creates a ventilation-perfusion mismatch, causing dyspnea, pleuritic chest pain, tachypnea, and hypoxemia. Tachycardia, not bradycardia, is expected. Tracheal deviation points to a tension pneumothorax.'),
    q('cd028', 'mcq', C.physio, 'Pediatrics', 'priority', 2,
      'The nurse is caring for a 5-week-old client with hypertrophic pyloric stenosis. It would be a <b>priority</b> for the nurse to monitor the client for an increased',
      ['BUN', 'WBC count', 'Serum IgE level', 'Serum chloride level'], 0,
      'Projectile vomiting and poor intake cause dehydration, which raises the BUN. Vomiting of gastric acid lowers, not raises, the serum chloride and leads to metabolic alkalosis. WBC and IgE are not the priority findings in this condition.'),
    q('cd029', 'mcq', C.mgmt, 'Documentation', 'action', 2,
      'The nurse is completing documentation for a client who experienced a fall. Which of the following is the <b>best</b> example of correct documentation to include in the electronic medical record?',
      ['"Client found on floor this morning at 0650. No verbalized symptoms. I think client tripped over a cord. Client instructed on safety during ambulation."', '"Client reports IV pole hit head at 0730. Denies pain. IV pole removed for client safety. Will continue to monitor. Health care provider (HCP) notified."', '"Peripheral IV site in right hand is red and swollen at 0930. Removed IV, covered with gauze dressing, and applied cold compress to the site at 0940."', '"Package of unknown substance found in client drawer at 1300. Client acting suspicious. HCP and facility security notified. Client has scars consistent with substance abuse."'], 2,
      'Good documentation is factual, objective, and timed, and records the assessment and the actions taken. Guesses ("I think"), subjective labels ("acting suspicious"), and mention of incident reports or events not tied to the client\'s care do not belong in the record.'),
    q('cd030', 'mcq', C.risk, 'Post-operative Care', 'priority', 2,
      'The nurse is assessing a client who had an abdominal aortic aneurysm resection 24 hours ago. Which of the following findings would be a <b>priority</b> to follow up?',
      ['Urinary output of 90 mL in the past 4 hours', 'Hypoactive bowel sounds in all 4 quadrants', 'Diminished breath sounds in the lung bases', 'Warm extremities with 1+ bilateral pedal pulses'], 0,
      'About 22 mL/hr is below the minimum of 30 mL/hr and suggests decreased renal perfusion, which can signal graft problems or bleeding after aortic surgery. Hypoactive bowel sounds, diminished bases, and equal warm extremities with pulses are common or expected at 24 hours.'),
    q('cd031', 'mcq', C.health, 'Growth & Development', 'recognize', 1,
      'The nurse is observing a group of 4-year-old clients playing. The nurse would <b>most</b> likely expect to observe the clients playing',
      ['With toys independently in separate areas of the room', 'Dress-up while talking with imaginary friends', 'A game of soccer with one another', 'With blocks alongside each other'], 1,
      'Preschoolers use associative and imaginative play, including make-believe and imaginary friends. Solitary play fits infants, parallel play (alongside each other) fits toddlers, and organized team games fit school-age children.'),
    q('cd032', 'mcq', C.physio, 'Respiratory', 'action', 3,
      'The nurse enters the room of a client who recently ate breakfast. The nurse notes that the client is experiencing respiratory distress and has an oxygen saturation level of 84% on room air. It would require <b>follow-up</b> if the nurse',
      ['Performs oropharyngeal suctioning', 'Auscultates the client\'s breath sounds', 'Places the client in the left lateral position', 'Administers 100% oxygen via a nonrebreather mask'], 2,
      'The client in respiratory distress should be upright in a high-Fowler position to expand the lungs, so lying on the side needs follow-up. Suctioning, assessing breath sounds, and high-flow oxygen are appropriate actions.'),
    q('cd033', 'mcq', C.risk, 'Neurologic', 'action', 2,
      'An 86-year-old client with diabetes and gastroparesis has had repeated hospitalizations for aspiration pneumonia following a stroke and is now hospitalized with altered level of consciousness. Which nursing action is <b>most appropriate</b> to decrease the client\'s risk for developing aspiration pneumonia?',
      ['Assessing the client\'s breath sounds every 2 hours', 'Placing the client in the side-lying position in bed', 'Titrating the client\'s oxygen to maintain saturation of 93% or greater', 'Turning and repositioning the client every 2 hours'], 1,
      'A client with a decreased level of consciousness cannot protect the airway. Side-lying lets secretions and gastric contents drain from the mouth instead of being aspirated. Assessing, oxygen titration, and routine turning do not prevent aspiration.'),
    q('cd034', 'sata', C.physio, 'Cardiovascular', 'recognize', 2,
      'The nurse is screening a female client for metabolic syndrome. The client\'s results include LDL 110 mg/dL, blood pressure 148/90 mm Hg, triglycerides 180 mg/dL, waist circumference 38 inches (96.5 cm), and fasting blood glucose 88 mg/dL. Which of the following findings would be consistent with metabolic syndrome? <b>Select all that apply.</b>',
      ['LDL level of 110 mg/dL', 'Blood pressure 148/90 mm Hg', 'Triglyceride level of 180 mg/dL', 'Waist circumference of 38 inches (96.5 cm)', 'Fasting blood glucose level of 88 mg/dL'], [1, 2, 3],
      'Metabolic syndrome is diagnosed with three or more of these: waist circumference over 35 inches in women, blood pressure of 130/85 or higher, triglycerides of 150 or higher, low HDL, and fasting glucose of 100 or higher. LDL is not one of the criteria, and a glucose of 88 is normal.'),
    q('cd035', 'sata', C.health, 'Post-operative Care', 'teaching', 2,
      'The nurse is providing discharge teaching for a client who had coronary artery bypass grafting surgery using the great saphenous vein. Which of the following information should the nurse include? <b>Select all that apply.</b>',
      ['"Wash your incisions in the shower and gently pat dry."', '"Increase your dietary intake of protein to promote healing."', '"Avoid elevating your affected leg while in a seated position."', '"Cleanse your incisions with hydrogen peroxide once weekly."', '"Report redness, swelling, or increased drainage from your incisions."'], [0, 1, 4],
      'Gentle washing, extra protein for wound healing, and reporting signs of infection are appropriate. The client should elevate the leg when seated to reduce swelling at the vein harvest site, and hydrogen peroxide damages healing tissue.'),
    q('cd036', 'sata', C.mgmt, 'Safety', 'recognize', 2,
      'Which would be the appropriate client criteria for activating a rapid response team at the hospital? <b>Select all that apply.</b>',
      ['Glasgow coma scale (GCS) score of 9 throughout the shift', 'Heart rate remaining at 58 beats/min for more than 1 hour', 'Postoperative pain rated at 10', 'Respiratory rate maintaining an increase to 30 breaths/min', 'Sustained change in level of consciousness for 10 minutes'], [3, 4],
      'Rapid response teams are called for acute deterioration, such as a sustained respiratory rate of 30 or a sudden change in level of consciousness. A stable low GCS that has not changed, a heart rate of 58, and pain alone do not show acute deterioration.'),
    q('cd039', 'mcq', C.health, 'Women\'s Health', 'teaching', 2,
      'A client suffering from bladder prolapse and subsequent stress urinary incontinence has discussed treatment options with the health care provider (HCP). The nurse evaluates that the client understands support pessary use when the client makes which statement?',
      ['"After the pessary is surgically placed, I\'ll experience bladder discomfort for several weeks."', '"I can remain sexually active while my pessary is in place."', '"I need to schedule weekly appointments to have the pessary removed and replaced."', '"I should report any vaginal discharge to my HCP immediately."'], 1,
      'A pessary is a removable support device placed in the vagina, not surgically, and many clients can remain sexually active with it. It is cleaned and replaced about every few months, not weekly, and mild discharge is common, so it does not need immediate reporting unless it is foul smelling or bloody.'),
    q('cd040', 'mcq', C.risk, 'Musculoskeletal', 'priority', 2,
      'The nurse is caring for a client who sustained a fracture of the femur 24 hours ago. Which of the following actions would be a <b>priority</b> for the nurse to take to reduce the client\'s risk for fat emboli?',
      ['Minimize movement of the affected extremity.', 'Apply a sequential compression device bilaterally.', 'Encourage frequent use of an incentive spirometer.', 'Administer IV morphine at regularly scheduled intervals.'], 0,
      'Fat droplets released from the marrow of a long-bone fracture can travel to the lungs. Immobilizing the fracture and limiting movement of the extremity reduces this risk. Compression devices prevent clots, and the other actions do not stop fat release.'),
    q('cd041', 'sata', C.physio, 'Oncology', 'recognize', 2,
      'The nurse is caring for an adult client at the clinic who asks the nurse to look at a "black skin lesion." What assessment findings would be a classic indication of a potential malignant skin neoplasm? <b>Select all that apply.</b>',
      ['Blanches with manual pressure', 'Half of the lesion is raised and half is flat', 'History of purulent drainage', 'Lesion is the size of a nickel', 'Various color shades are present'], [1, 3, 4],
      'Melanoma warning signs follow ABCDE: asymmetry, irregular border, varied color, diameter larger than 6 mm (about a pencil eraser; a nickel is larger), and evolving. Blanching and purulent drainage point to benign or infectious causes.'),
    {
      type: 'bowtie', id: 'cd037', category: C.physio, topic: 'Pediatrics', pattern: P.priority, difficulty: 3,
      stem: 'The nurse is caring for a 5-week-old infant.',
      tabs: [{ id: 'notes', label: 'Nurses\' Notes', html: '<p><b>Emergency Department</b></p><p>The parents report increasingly frequent, forceful vomiting after every feed over the last 4 days. The emesis appears to be undigested milk. The infant appears hungry again after each episode of vomiting. The infant is exclusively breastfed; the last bowel movement was yesterday; it was soft in consistency and yellow.</p><p>The anterior fontanel is mildly sunken, and mucous membranes are dry. There is prominent peristalsis in the epigastric region with a palpable olive-shaped mass.</p>' }],
      prompt: 'The nurse is reviewing the client\'s assessment data to prepare the client\'s plan of care. <br><br><span class="ex-chev">»</span>Complete the diagram by selecting from the choices below to specify what condition the client is most likely experiencing, 2 actions the nurse should take to address that condition, and 2 parameters the nurse should monitor to assess the client\'s progress.',
      bowtie: {
        actionsTitle: 'Actions to Take', conditionsTitle: 'Potential Conditions', complicationsTitle: 'Parameters to Monitor',
        actions: ['Initiate contact precautions', 'Prepare the client for an air enema', 'Prepare the infant for bowel resection surgery', 'Administer IV fluids', 'Prepare the infant for pyloromyotomy'],
        conditions: ['Rotavirus', 'Hirschsprung disease', 'Hypertrophic pyloric stenosis', 'Intussusception'],
        complications: ['Stool sample results', 'Postprandial vomiting', 'Passage of formed stool prior to the procedure', 'Abdominal girth', 'Serum electrolytes']
      },
      correct: { actions: [3, 4], condition: 2, complications: [1, 4] },
      rationale: 'Projectile non-bilious vomiting in a hungry infant with an olive-shaped epigastric mass is hypertrophic pyloric stenosis. The infant is dehydrated and loses gastric acid, so IV fluids and correction of electrolytes come first, followed by preparation for surgical pyloromyotomy. The nurse monitors postprandial vomiting and serum electrolytes. Air enema and bowel resection apply to intussusception, and contact precautions apply to rotavirus.'
    },
    {
      type: 'bowtie', id: 'cd038', category: C.physio, topic: 'Musculoskeletal', pattern: P.priority, difficulty: 3,
      stem: 'The nurse is caring for a 13-year-old client in the emergency department.',
      tabs: [{ id: 'notes', label: 'Nurses\' Notes', html: '<p><b>Emergency Department</b></p><p>The client\'s parents report that the client has had fever and worsening right leg pain for the past 7 days. There is no significant medical history or recent trauma. The client swims twice a week.</p><p>There is tenderness, erythema, and warmth over the proximal area of the tibia.</p>' }],
      prompt: 'The nurse is reviewing the client\'s assessment data to prepare the client\'s plan of care. <br><br><span class="ex-chev">»</span>Complete the diagram by selecting from the choices below to specify what condition the client is most likely experiencing, 2 actions the nurse should take to address that condition, and 2 complications the nurse should monitor for.',
      bowtie: {
        actionsTitle: 'Action to Take', conditionsTitle: 'Condition Most Likely Experiencing', complicationsTitle: 'Complication',
        actions: ['Administer an antibiotic', 'Administer hydroxyurea', 'Obtain a blood culture', 'Prepare the client for casting'],
        conditions: ['Osteomyelitis', 'Sickle cell disease', 'Bone fracture'],
        complications: ['Sepsis', 'Bone necrosis', 'Flexion contractures', 'Compartment syndrome']
      },
      correct: { actions: [0, 2], condition: 0, complications: [0, 1] },
      rationale: 'Fever with bone pain, tenderness, erythema, and warmth over the tibia without trauma points to osteomyelitis, a bone infection. The nurse obtains blood cultures before starting antibiotics. Untreated infection can spread to the blood (sepsis) or destroy bone tissue (bone necrosis). Hydroxyurea treats sickle cell disease, and casting and compartment syndrome relate to fractures.'
    },

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
