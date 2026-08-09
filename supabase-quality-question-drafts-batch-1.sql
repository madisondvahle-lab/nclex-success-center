-- Quality Question Drafts — Batch 1
-- Eight private, inactive draft questions. Safe to run after
-- supabase-question-bank-review.sql. Nothing in this file is student-visible.
-- Clinical references reviewed August 2026:
-- https://www.cdc.gov/infection-control/hcp/isolation-precautions/precautions.html
-- https://www.cdc.gov/flu/hcp/infection-control/mask-guidance.html
-- https://www.cdc.gov/c-diff/hcp/clinical-overview/
-- https://www.cdc.gov/clean-hands/hcp/clinical-safety/index.html
-- https://diabetes.org/living-with-diabetes/hypoglycemia-low-blood-glucose/symptoms-treatment

insert into questions (
  stem, option_a, option_b, option_c, option_d, correct_answer, rationale,
  module_key, nclex_category, nclex_sub, topic, difficulty, is_ngn, active, source_key
) values
(
  'At emergency-department triage, a client reports fever, cough, conjunctivitis, and a new maculopapular rash after a known measles exposure. Which action should the nurse take first?',
  'Place a surgical mask on the client, then keep the client in the general waiting room until the provider evaluates the rash.',
  'Place the client in an airborne infection isolation room and use an appropriate respirator before entering.',
  'Initiate Droplet Precautions and obtain a sputum specimen before moving the client.',
  'Place the client on Contact Precautions and assign dedicated equipment.',
  'b',
  'Suspected measles requires Airborne Precautions. The preferred placement is an airborne infection isolation room (negative pressure), and personnel use respiratory protection before entry. Source: CDC isolation-precautions guidance.',
  null, 'Safety & Infection Prevention', 'Infection Control', 'Airborne precautions: suspected measles', 'hard', false, false, 'quality-b1-001'
),
(
  'A client on Droplet Precautions for confirmed seasonal influenza must travel to CT. Which action best reduces transmission during transport?',
  'Place a surgical mask on the client if tolerated, limit transport to the essential study, and notify CT of the precautions.',
  'Remove the client''s mask before leaving the room so the nurse can assess respiratory effort during transport.',
  'Ask CT to postpone cleaning the scanner until the end of the shift.',
  'Require the client to wear an N95 respirator and leave the room without notifying CT.',
  'a',
  'For influenza, limit transport to essential purposes. A client on Droplet Precautions should wear a mask when leaving the isolation room if tolerated, and receiving personnel need advance notice. Source: CDC seasonal influenza infection-control guidance.',
  null, 'Safety & Infection Prevention', 'Infection Control', 'Droplet precautions: influenza transport', 'medium', false, false, 'quality-b1-002'
),
(
  'A client has new watery diarrhea after a recent antibiotic course, and C. difficile testing is pending. Which nursing action is most appropriate now?',
  'Wait for the stool result before starting isolation precautions.',
  'Initiate Contact Precautions, use gown and gloves on room entry, and use dedicated patient-care equipment when possible.',
  'Use Droplet Precautions because diarrhea can spread through the air when the client coughs.',
  'Assign the client to a positive-pressure room to protect the client from other infections.',
  'b',
  'Patients with suspected infectious diarrhea should be promptly isolated and placed on Contact Precautions while evaluation is underway. Gown and gloves, appropriate hand hygiene, and dedicated equipment help limit spread. Source: CDC C. difficile clinical guidance.',
  null, 'Safety & Infection Prevention', 'Infection Control', 'Contact precautions: suspected C. difficile', 'medium', false, false, 'quality-b1-003'
),
(
  'The nurse is about to perform endotracheal suctioning for a client with copious secretions. Which personal protective equipment is most important to add because a spray of secretions is anticipated?',
  'A face shield or a mask with goggles.',
  'Sterile gloves only.',
  'A shoe cover and hair cover.',
  'A lead apron.',
  'a',
  'Standard Precautions require PPE based on anticipated exposure. Procedures that may generate sprays or splashes of secretions require protection of the eyes, nose, and mouth with a face shield or a mask plus goggles. Source: CDC isolation-precautions guidance.',
  null, 'Safety & Infection Prevention', 'Standard Precautions', 'PPE for secretion splash risk', 'medium', false, false, 'quality-b1-004'
),
(
  'After emptying a postoperative drain, the nurse''s hands are visibly soiled with sanguineous drainage. Which hand-hygiene action is best?',
  'Use alcohol-based hand rub because it is always preferred in clinical care.',
  'Wash hands with soap and water before leaving the client''s room.',
  'Put on a new pair of gloves without cleaning the hands.',
  'Wipe hands with a dry paper towel and complete charting first.',
  'b',
  'Alcohol-based hand rub is preferred in many routine clinical situations, but soap and water are indicated when hands are visibly soiled. Hand hygiene is also required after glove removal and contact with body fluids. Source: CDC clinical hand-hygiene guidance.',
  null, 'Safety & Infection Prevention', 'Standard Precautions', 'Hand hygiene: visibly soiled hands', 'easy', false, false, 'quality-b1-005'
),
(
  'An alert adult with diabetes has a capillary blood glucose of 58 mg/dL, is able to swallow safely, and has no IV access. Which action should the nurse take first?',
  'Give 15 g of fast-acting carbohydrate and recheck the glucose in 15 minutes.',
  'Give a high-protein snack and recheck the glucose at the next meal.',
  'Administer long-acting insulin to prevent rebound hyperglycemia.',
  'Keep the client NPO until the provider arrives.',
  'a',
  'For an alert person who can swallow and has glucose at or below 70 mg/dL, use 15 g of fast-acting carbohydrate, then recheck after 15 minutes and repeat if still low. Source: American Diabetes Association hypoglycemia guidance.',
  null, 'Pharmacological & Parenteral Therapies', 'Medication and Blood Products', 'Hypoglycemia: 15-15 treatment', 'medium', false, false, 'quality-b1-006'
),
(
  'A client with diabetes reports shakiness and diaphoresis before lunch. Capillary blood glucose is 62 mg/dL, and the client can swallow safely. Which item is the best initial treatment?',
  'Four ounces of regular fruit juice.',
  'A peanut-butter sandwich.',
  'A diet soft drink.',
  'A chocolate candy bar.',
  'a',
  'Fast-acting carbohydrate is needed for symptomatic hypoglycemia. Regular juice supplies rapidly absorbed carbohydrate; foods high in fat or protein slow absorption, and diet soda does not provide carbohydrate. Source: American Diabetes Association hypoglycemia guidance.',
  null, 'Pharmacological & Parenteral Therapies', 'Medication and Blood Products', 'Hypoglycemia: fast-acting carbohydrate selection', 'easy', false, false, 'quality-b1-007'
),
(
  'A nurse leaves the room of a client with confirmed C. difficile infection after providing hygiene care. Which action best helps prevent transmission to another client?',
  'Remove the gown and gloves before leaving the room, perform hand hygiene, and ensure reusable equipment is cleaned before another client uses it.',
  'Keep the gown and gloves on while documenting so they can be reused for the next task.',
  'Carry the client''s blood-pressure cuff to the next room because it is noncritical equipment.',
  'Remove gloves but leave the gown on while walking to the medication room.',
  'a',
  'Contact Precautions contain organisms on hands, clothing, and equipment. Remove PPE appropriately, perform hand hygiene, and dedicate or properly clean reusable equipment before another client uses it. Source: CDC C. difficile and isolation-precautions guidance.',
  null, 'Safety & Infection Prevention', 'Infection Control', 'C. difficile: preventing cross-transmission', 'medium', false, false, 'quality-b1-008'
)
on conflict (source_key) do nothing;
