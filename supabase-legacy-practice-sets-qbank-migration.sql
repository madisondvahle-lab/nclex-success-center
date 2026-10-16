-- Move the NCLEX practice sets shown on the student practice page into the
-- master questions bank without changing their stems, options, answers, or
-- rationales. Exact existing bank matches are reused rather than duplicated.
-- Run after supabase-question-bank-review.sql,
-- supabase-question-item-types.sql, and supabase-question-numbers.sql.
--
-- The rows are already used in assigned practice. Exact inactive bank matches
-- are activated; the mapping table stores set membership and order. Safe to
-- rerun. Active questions remain governed by the existing question-bank RLS.
-- Staging and import stay in one DO block so the temporary table remains in
-- scope for the full operation in the Supabase SQL Editor.

BEGIN;
DO $$
BEGIN
  IF to_regclass('public.questions') IS NULL THEN
    RAISE EXCEPTION 'Run supabase-questions.sql before this migration.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'source_key'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'item_type'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'item_data'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'question_no'
      AND column_default IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_questions_source_key_unique'
  ) THEN
    RAISE EXCEPTION 'Run the question-bank review, item-type, and question-number migrations first.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.question_set_items (
  set_key text NOT NULL,
  legacy_id text NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  PRIMARY KEY (set_key, legacy_id),
  UNIQUE (set_key, position)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_set_items TO authenticated;
ALTER TABLE public.question_set_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "students read active question set items" ON public.question_set_items;
CREATE POLICY "students read active question set items"
  ON public.question_set_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.questions q
    WHERE q.id = public.question_set_items.question_id AND q.active IS TRUE
  ));
DROP POLICY IF EXISTS "admins manage question set items" ON public.question_set_items;
CREATE POLICY "admins manage question set items"
  ON public.question_set_items
  FOR ALL TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

DO $$
DECLARE
  conflict_details text;
BEGIN
CREATE TEMP TABLE legacy_practice_items AS
SELECT *
FROM jsonb_to_recordset($legacy_questions$
[
  {
    "set_key": "safety-priority-01",
    "legacy_id": "sp01-q01",
    "position": 1,
    "source_key": "legacy-practice-set:safety-priority-01:sp01-q01",
    "stem": "A nurse receives change-of-shift report on four clients. Which client should the nurse assess first?",
    "options": [
      "A client 8 hours after a thyroidectomy who reports tingling around the mouth",
      "A client with heart failure who gained 0.9 kg (2 lb) since yesterday",
      "A client with pneumonia whose temperature is 38.2 C (100.8 F)",
      "A client 1 day after hip surgery who reports pain of 7 on a 0-to-10 scale"
    ],
    "correct": [
      0
    ],
    "rationale": "Tingling after thyroidectomy can signal hypocalcemia from parathyroid injury and can progress to airway-threatening laryngospasm. It is the priority finding.",
    "topic": "Safety & Priority",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "safety-priority-01",
    "legacy_id": "sp01-q02",
    "position": 2,
    "source_key": "legacy-practice-set:safety-priority-01:sp01-q02",
    "stem": "Which task is appropriate for the RN to delegate to unlicensed assistive personnel (UAP)?",
    "options": [
      "Reinforce teaching about incentive spirometry",
      "Obtain routine vital signs for a stable client",
      "Assess a new complaint of chest pressure",
      "Evaluate whether a new analgesic relieved pain"
    ],
    "correct": [
      1
    ],
    "rationale": "Routine, predictable tasks for a stable client can be delegated to UAP. Teaching, assessment, and evaluation remain RN responsibilities.",
    "topic": "Safety & Priority",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "safety-priority-01",
    "legacy_id": "sp01-q03",
    "position": 3,
    "source_key": "legacy-practice-set:safety-priority-01:sp01-q03",
    "stem": "A nurse discovers a client on the floor beside the bed. Which action should the nurse take first?",
    "options": [
      "Assess the client for injury",
      "Notify the health care provider",
      "Complete an incident report",
      "Assist the client back to bed"
    ],
    "correct": [
      0
    ],
    "rationale": "Assess first. The nurse needs to determine immediate safety needs before moving the client, notifying the provider, or completing documentation.",
    "topic": "Safety & Priority",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "safety-priority-01",
    "legacy_id": "sp01-q04",
    "position": 4,
    "source_key": "legacy-practice-set:safety-priority-01:sp01-q04",
    "stem": "Which finding should the nurse report immediately for a client receiving a heparin infusion?",
    "options": [
      "aPTT within the prescribed therapeutic range",
      "New black, tarry stool",
      "Small bruise at a previous venipuncture site",
      "Heart rate of 92/min after ambulation"
    ],
    "correct": [
      1
    ],
    "rationale": "Black, tarry stool can indicate gastrointestinal bleeding, a serious complication of anticoagulation that requires prompt action.",
    "topic": "Safety & Priority",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "safety-priority-01",
    "legacy_id": "sp01-q05",
    "position": 5,
    "source_key": "legacy-practice-set:safety-priority-01:sp01-q05",
    "stem": "A nurse enters a room and finds smoke coming from a wastebasket. What is the nurse’s first action?",
    "options": [
      "Remove the client from immediate danger",
      "Activate the fire alarm",
      "Close the room door",
      "Attempt to extinguish the fire"
    ],
    "correct": [
      0
    ],
    "rationale": "Use RACE: Rescue, Alarm, Contain, Extinguish/Evacuate. The first priority is to remove anyone in immediate danger.",
    "topic": "Safety & Priority",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "med-procedure-01",
    "legacy_id": "mp01-q01",
    "position": 1,
    "source_key": "legacy-practice-set:med-procedure-01:mp01-q01",
    "stem": "Before administering a newly prescribed cephalosporin to a client who reports a penicillin allergy, what is the nurse’s priority action?",
    "options": [
      "Ask the client to describe the previous allergic reaction",
      "Administer the medication with food",
      "Request a prescription for an antihistamine",
      "Withhold all antibiotics for 24 hours"
    ],
    "correct": [
      0
    ],
    "rationale": "The nurse first clarifies the type and severity of the reported reaction. This information guides safe follow-up and does not assume every allergy has the same risk.",
    "topic": "Medication & Procedure Safety",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "med-procedure-01",
    "legacy_id": "mp01-q02",
    "position": 2,
    "source_key": "legacy-practice-set:med-procedure-01:mp01-q02",
    "stem": "The provider prescribes 750 mg of a medication. The available concentration is 250 mg per tablet. How many tablets should the nurse administer?",
    "options": [
      "1 tablet",
      "2 tablets",
      "3 tablets",
      "4 tablets"
    ],
    "correct": [
      2
    ],
    "rationale": "750 mg divided by 250 mg per tablet equals 3 tablets.",
    "topic": "Medication & Procedure Safety",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "med-procedure-01",
    "legacy_id": "mp01-q03",
    "position": 3,
    "source_key": "legacy-practice-set:med-procedure-01:mp01-q03",
    "stem": "Which action is most important before accessing a central venous catheter hub?",
    "options": [
      "Scrub the hub with the approved antiseptic",
      "Flush the catheter with sterile water",
      "Replace the catheter every 48 hours",
      "Apply a warm compress to the insertion site"
    ],
    "correct": [
      0
    ],
    "rationale": "Hand hygiene, aseptic technique, and disinfection of the access hub immediately before use reduce catheter-related infection risk.",
    "topic": "Medication & Procedure Safety",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "med-procedure-01",
    "legacy_id": "mp01-q04",
    "position": 4,
    "source_key": "legacy-practice-set:med-procedure-01:mp01-q04",
    "stem": "A nurse prepares to administer rapid-acting insulin before a meal. Which action is most important?",
    "options": [
      "Verify that the meal tray is available before giving the dose",
      "Give the insulin 1 hour before the meal",
      "Hold the insulin if the client is thirsty",
      "Administer the insulin only at bedtime"
    ],
    "correct": [
      0
    ],
    "rationale": "Rapid-acting insulin has a quick onset. Confirm that food is available to reduce the risk of hypoglycemia.",
    "topic": "Medication & Procedure Safety",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "med-procedure-01",
    "legacy_id": "mp01-q05",
    "position": 5,
    "source_key": "legacy-practice-set:med-procedure-01:mp01-q05",
    "stem": "Which finding is most concerning for a client receiving IV potassium chloride?",
    "options": [
      "Burning at the IV site during the infusion",
      "Heart rate of 88/min",
      "Urine output of 55 mL/hr",
      "Mild thirst after breakfast"
    ],
    "correct": [
      0
    ],
    "rationale": "Potassium infusions are irritating and must be assessed for infiltration or phlebitis. Never give IV potassium by direct IV push.",
    "topic": "Medication & Procedure Safety",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "ngn-acute-01",
    "legacy_id": "ng01-q01",
    "position": 1,
    "source_key": "legacy-practice-set:ngn-acute-01:ng01-q01",
    "stem": "A client with a urinary tract infection has a temperature of 39.2 C (102.6 F), heart rate 122/min, blood pressure 86/48 mm Hg, and new confusion. Which concern is the priority?",
    "options": [
      "Possible sepsis with poor perfusion",
      "Expected fever response to infection",
      "Uncontrolled chronic hypertension",
      "Medication-related constipation"
    ],
    "correct": [
      0
    ],
    "rationale": "Infection plus hypotension, tachycardia, fever, and new confusion suggests sepsis with impaired perfusion. This is an emergency.",
    "topic": "NGN Acute Care Judgment",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "ngn-acute-01",
    "legacy_id": "ng01-q02",
    "position": 2,
    "source_key": "legacy-practice-set:ngn-acute-01:ng01-q02",
    "stem": "For the client with suspected sepsis, which action should the nurse take first?",
    "options": [
      "Activate the facility’s rapid response or sepsis process",
      "Offer a cool drink for fever",
      "Obtain a routine daily weight",
      "Provide discharge teaching about antibiotics"
    ],
    "correct": [
      0
    ],
    "rationale": "Suspected sepsis with signs of instability requires immediate escalation and treatment using the facility’s emergency process.",
    "topic": "NGN Acute Care Judgment",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "ngn-acute-01",
    "legacy_id": "ng01-q03",
    "position": 3,
    "source_key": "legacy-practice-set:ngn-acute-01:ng01-q03",
    "stem": "A client with a new tracheostomy is in respiratory distress and the tracheostomy tube has become dislodged. Which action is the priority?",
    "options": [
      "Maintain the airway using the emergency tracheostomy equipment",
      "Apply a dry dressing and wait for the provider",
      "Offer oral fluids to reduce anxiety",
      "Reposition the client flat in bed"
    ],
    "correct": [
      0
    ],
    "rationale": "Airway is the priority. Use emergency equipment and call for assistance according to facility protocol.",
    "topic": "NGN Acute Care Judgment",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "ngn-acute-01",
    "legacy_id": "ng01-q04",
    "position": 4,
    "source_key": "legacy-practice-set:ngn-acute-01:ng01-q04",
    "stem": "A client with heart failure suddenly develops crackles, severe dyspnea, and oxygen saturation of 84% on room air. Which action should the nurse take first?",
    "options": [
      "Sit the client upright and apply oxygen",
      "Encourage the client to drink water",
      "Assist the client to ambulate",
      "Obtain the client’s daily weight"
    ],
    "correct": [
      0
    ],
    "rationale": "Acute pulmonary edema compromises breathing. Positioning upright and applying oxygen address the immediate ABC priority while escalating care.",
    "topic": "NGN Acute Care Judgment",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "ngn-acute-01",
    "legacy_id": "ng01-q05",
    "position": 5,
    "source_key": "legacy-practice-set:ngn-acute-01:ng01-q05",
    "stem": "After interventions for a client with shock, which finding best indicates improved perfusion?",
    "options": [
      "Urine output increases to 35 mL/hr",
      "Skin becomes more pale",
      "Level of consciousness declines",
      "Blood pressure continues to decrease"
    ],
    "correct": [
      0
    ],
    "rationale": "Improving urine output supports improved renal perfusion. Worsening color, mentation, or blood pressure indicates deterioration.",
    "topic": "NGN Acute Care Judgment",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-001",
    "position": 1,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-001",
    "stem": "A patient says, “I am not sure I can handle this diagnosis.” Which response by the nurse is most therapeutic?",
    "options": [
      "“You will be fine; many people have this.”",
      "“Tell me more about what feels hardest right now.”",
      "“Why do you think you cannot handle it?”",
      "“You should focus on the treatment plan.”"
    ],
    "correct": [
      1
    ],
    "rationale": "The broad opening invites the patient to describe concerns without imposing an answer or judgment. Incorrect options: A “You will be fine; many people have this.” is not the best answer for this question. B “Tell me more about what feels hardest right now.” is correct. C “Why do you think you cannot handle it?” is not the best answer for this question. D “You should focus on the treatment plan.” is not the best answer for this question.",
    "topic": "Therapeutic communication",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-002",
    "position": 2,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-002",
    "stem": "A patient is silent after discussing a frightening experience. Which action should the nurse take first?",
    "options": [
      "Change the subject to reduce discomfort.",
      "Remain present and allow time for the patient to respond.",
      "Ask several questions quickly.",
      "Offer reassurance that the experience is over."
    ],
    "correct": [
      1
    ],
    "rationale": "Silence and offering self communicate acceptance and give the patient control of the pace. Incorrect options: A Change the subject to reduce discomfort. is not the best answer for this question. B Remain present and allow time for the patient to respond. is correct. C Ask several questions quickly. is not the best answer for this question. D Offer reassurance that the experience is over. is not the best answer for this question.",
    "topic": "Therapeutic communication",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-003",
    "position": 3,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-003",
    "stem": "The nurse says, “You noticed your hands shaking when your family arrived.” Which technique is being used?",
    "options": [
      "Making observations",
      "Giving advice",
      "Focusing",
      "Voicing doubt"
    ],
    "correct": [
      0
    ],
    "rationale": "Naming a directly observed behavior is making observations; it can help the patient notice and explore the experience. Incorrect options: A Making observations is correct. B Giving advice is not the best answer for this question. C Focusing is not the best answer for this question. D Voicing doubt is not the best answer for this question.",
    "topic": "Therapeutic communication",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-004",
    "position": 4,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-004",
    "stem": "A patient says, “I feel abandoned.” Which response best demonstrates reflection?",
    "options": [
      "“You feel abandoned.”",
      "“Why would your family abandon you?”",
      "“At least your friends visit.”",
      "“You need to call your family.”"
    ],
    "correct": [
      0
    ],
    "rationale": "Reflection returns the patient’s feeling or idea for further exploration without adding judgment or advice. Incorrect options: A “You feel abandoned.” is correct. B “Why would your family abandon you?” is not the best answer for this question. C “At least your friends visit.” is not the best answer for this question. D “You need to call your family.” is not the best answer for this question.",
    "topic": "Therapeutic communication",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-005",
    "position": 5,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-005",
    "stem": "The patient says, “The staff is talking about me.” Which response is best?",
    "options": [
      "“Yes, they are discussing your care.”",
      "“That sounds frightening. I do not hear staff talking about you.”",
      "“Why are you being paranoid?”",
      "“Do not think about it.”"
    ],
    "correct": [
      1
    ],
    "rationale": "The nurse acknowledges the feeling, presents reality, and does not reinforce an unsubstantiated belief. Incorrect options: A “Yes, they are discussing your care.” is not the best answer for this question. B “That sounds frightening. I do not hear staff talking about you.” is correct. C “Why are you being paranoid?” is not the best answer for this question. D “Do not think about it.” is not the best answer for this question.",
    "topic": "Therapeutic communication",
    "difficulty": "hard",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-006",
    "position": 6,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-006",
    "stem": "Which nurse statements are therapeutic communication techniques? (Select all that apply)",
    "options": [
      "“I am here with you while we talk.”",
      "“What do you mean by ‘unsafe’?”",
      "“You seem quieter than usual today.”",
      "“Why did you make that decision?”",
      "“Everything will definitely work out.”"
    ],
    "correct": [
      0,
      1,
      2
    ],
    "rationale": "Offering self, clarification, and making observations promote communication. “Why” can sound accusatory, and false reassurance blocks exploration. Incorrect options: A “I am here with you while we talk.” is correct. B “What do you mean by ‘unsafe’?” is correct. C “You seem quieter than usual today.” is correct. D “Why did you make that decision?” is not the best answer for this question. E “Everything will definitely work out.” is not the best answer for this question.",
    "topic": "Therapeutic communication",
    "difficulty": "medium",
    "item_type": "sata"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-007",
    "position": 7,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-007",
    "stem": "A nurse summarizes the patient’s concerns before ending the interview. What is the primary purpose?",
    "options": [
      "To prove the nurse understood every detail",
      "To organize shared meaning and identify anything needing correction",
      "To persuade the patient to accept the plan",
      "To replace the patient’s explanation"
    ],
    "correct": [
      1
    ],
    "rationale": "Summarizing reviews major points and allows the patient to correct misunderstandings or add information. Incorrect options: A To prove the nurse understood every detail is not the best answer for this question. B To organize shared meaning and identify anything needing correction is correct. C To persuade the patient to accept the plan is not the best answer for this question. D To replace the patient’s explanation is not the best answer for this question.",
    "topic": "Therapeutic communication",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-008",
    "position": 8,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-008",
    "stem": "A competent adult refuses a blood transfusion after receiving relevant information. Respecting the refusal supports which principle?",
    "options": [
      "Beneficence",
      "Autonomy",
      "Justice",
      "Fidelity"
    ],
    "correct": [
      1
    ],
    "rationale": "Autonomy protects a competent person’s right to make an informed decision, including refusal. Incorrect options: A Beneficence is not the best answer for this question. B Autonomy is correct. C Justice is not the best answer for this question. D Fidelity is not the best answer for this question.",
    "topic": "Ethics and values",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-009",
    "position": 9,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-009",
    "stem": "The nurse chooses an intervention because it is expected to benefit the patient. Which ethical principle is demonstrated?",
    "options": [
      "Nonmaleficence",
      "Beneficence",
      "Veracity",
      "Justice"
    ],
    "correct": [
      1
    ],
    "rationale": "Beneficence means acting to promote the patient’s well-being. Incorrect options: A Nonmaleficence is not the best answer for this question. B Beneficence is correct. C Veracity is not the best answer for this question. D Justice is not the best answer for this question.",
    "topic": "Ethics and values",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-010",
    "position": 10,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-010",
    "stem": "A nurse refuses to falsify a chart even though a colleague says it will prevent trouble. Which principle is most directly upheld?",
    "options": [
      "Fidelity",
      "Autonomy",
      "Utility",
      "Paternalism"
    ],
    "correct": [
      0
    ],
    "rationale": "Fidelity involves keeping professional commitments and responsibilities; falsifying documentation violates professional standards. Incorrect options: A Fidelity is correct. B Autonomy is not the best answer for this question. C Utility is not the best answer for this question. D Paternalism is not the best answer for this question.",
    "topic": "Ethics and values",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-011",
    "position": 11,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-011",
    "stem": "Which statements accurately distinguish values, beliefs, and attitudes? (Select all that apply)",
    "options": [
      "Values are enduring ideas about what is important or desirable.",
      "Beliefs are convictions a person accepts as true.",
      "Attitudes are learned tendencies to respond favorably or unfavorably.",
      "Values are identical to institutional policies.",
      "Beliefs are always supported by scientific evidence."
    ],
    "correct": [
      0,
      1,
      2
    ],
    "rationale": "Values, beliefs, and attitudes influence perspectives but are not interchangeable with policy or evidence. Incorrect options: A Values are enduring ideas about what is important or desirable. is correct. B Beliefs are convictions a person accepts as true. is correct. C Attitudes are learned tendencies to respond favorably or unfavorably. is correct. D Values are identical to institutional policies. is not the best answer for this question. E Beliefs are always supported by scientific evidence. is not the best answer for this question.",
    "topic": "Ethics and values",
    "difficulty": "medium",
    "item_type": "sata"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-012",
    "position": 12,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-012",
    "stem": "A nurse helps a patient express a treatment preference that differs from the nurse’s personal beliefs. This best demonstrates:",
    "options": [
      "Value neutrality",
      "Moral outrage",
      "Coercion",
      "False reassurance"
    ],
    "correct": [
      0
    ],
    "rationale": "Value neutrality means recognizing personal values while supporting the patient’s informed choices without imposing those values. Incorrect options: A Value neutrality is correct. B Moral outrage is not the best answer for this question. C Coercion is not the best answer for this question. D False reassurance is not the best answer for this question.",
    "topic": "Ethics and values",
    "difficulty": "hard",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-013",
    "position": 13,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-013",
    "stem": "A nurse feels distressed because an unsafe staffing decision prevents the care the nurse believes is right, despite knowing the appropriate action. This is:",
    "options": [
      "Moral distress",
      "Moral outrage",
      "Whistleblowing",
      "Malpractice"
    ],
    "correct": [
      0
    ],
    "rationale": "Moral distress occurs when a person recognizes the ethically appropriate action but feels constrained from taking it. Incorrect options: A Moral distress is correct. B Moral outrage is not the best answer for this question. C Whistleblowing is not the best answer for this question. D Malpractice is not the best answer for this question.",
    "topic": "Moral issues",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-014",
    "position": 14,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-014",
    "stem": "A nurse reports a supervisor’s repeated falsification of medication records through the appropriate external channel after internal reporting fails. This is:",
    "options": [
      "Moral distress",
      "Whistleblowing",
      "Slander",
      "Delegation"
    ],
    "correct": [
      1
    ],
    "rationale": "Whistleblowing is reporting wrongdoing or unsafe practice through an appropriate protected channel. Incorrect options: A Moral distress is not the best answer for this question. B Whistleblowing is correct. C Slander is not the best answer for this question. D Delegation is not the best answer for this question.",
    "topic": "Moral issues",
    "difficulty": "hard",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-015",
    "position": 15,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-015",
    "stem": "Which elements must all be established for a malpractice claim? (Select all that apply)",
    "options": [
      "Duty",
      "Breach of duty",
      "Causation",
      "Damages",
      "A patient’s dissatisfaction alone"
    ],
    "correct": [
      0,
      1,
      2,
      3
    ],
    "rationale": "Malpractice requires duty, breach, causation, and damages; dissatisfaction alone does not establish liability. Incorrect options: A Duty is correct. B Breach of duty is correct. C Causation is correct. D Damages is correct. E A patient’s dissatisfaction alone is not the best answer for this question.",
    "topic": "Legal accountability",
    "difficulty": "easy",
    "item_type": "sata"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-016",
    "position": 16,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-016",
    "stem": "An RN fails to implement a required fall precaution, and the patient fractures a hip in a fall caused by that omission. Which malpractice element connects the omission to the injury?",
    "options": [
      "Duty",
      "Breach",
      "Causation",
      "Damages"
    ],
    "correct": [
      2
    ],
    "rationale": "Causation links the breach to the patient’s injury; the fracture is the resulting damage. Incorrect options: A Duty is not the best answer for this question. B Breach is not the best answer for this question. C Causation is correct. D Damages is not the best answer for this question.",
    "topic": "Legal accountability",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-017",
    "position": 17,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-017",
    "stem": "A nurse owes a patient a professional standard of care, but the patient has no injury. Which malpractice element is missing?",
    "options": [
      "Duty",
      "Breach",
      "Causation or damages",
      "Professional status"
    ],
    "correct": [
      2
    ],
    "rationale": "A malpractice claim requires harm or damages connected to the breach; duty alone is insufficient. Incorrect options: A Duty is not the best answer for this question. B Breach is not the best answer for this question. C Causation or damages is correct. D Professional status is not the best answer for this question.",
    "topic": "Legal accountability",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-018",
    "position": 18,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-018",
    "stem": "Which statement correctly differentiates negligence from malpractice?",
    "options": [
      "Negligence is intentional; malpractice is never professional.",
      "Malpractice is professional negligence by a licensed professional.",
      "Negligence requires damages; malpractice does not.",
      "They are intentional torts."
    ],
    "correct": [
      1
    ],
    "rationale": "Malpractice is professional negligence; both are unintentional and require analysis of duty, breach, causation, and harm. Incorrect options: A Negligence is intentional; malpractice is never professional. is not the best answer for this question. B Malpractice is professional negligence by a licensed professional. is correct. C Negligence requires damages; malpractice does not. is not the best answer for this question. D They are intentional torts. is not the best answer for this question.",
    "topic": "Legal accountability",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-019",
    "position": 19,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-019",
    "stem": "A state legislature passes a Nurse Practice Act defining scope of practice. This is an example of:",
    "options": [
      "Constitutional law",
      "Statutory law",
      "Administrative law",
      "Common law"
    ],
    "correct": [
      1
    ],
    "rationale": "A Nurse Practice Act is enacted by a legislature, making it statutory law. Incorrect options: A Constitutional law is not the best answer for this question. B Statutory law is correct. C Administrative law is not the best answer for this question. D Common law is not the best answer for this question.",
    "topic": "Sources of law",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-020",
    "position": 20,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-020",
    "stem": "The State Board of Nursing issues rules enforcing the Nurse Practice Act. These rules are:",
    "options": [
      "Administrative law",
      "Constitutional law",
      "Private morals",
      "Common law"
    ],
    "correct": [
      0
    ],
    "rationale": "Administrative law includes rules and regulations created and enforced by government agencies such as a State Board of Nursing. Incorrect options: A Administrative law is correct. B Constitutional law is not the best answer for this question. C Private morals is not the best answer for this question. D Common law is not the best answer for this question.",
    "topic": "Sources of law",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-021",
    "position": 21,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-021",
    "stem": "A court decision establishes how a similar negligence case should be interpreted. This is most closely associated with:",
    "options": [
      "Statutory law",
      "Common or judicial law",
      "Administrative law",
      "Constitutional amendment"
    ],
    "correct": [
      1
    ],
    "rationale": "Court decisions and case law are common or judicial law. Incorrect options: A Statutory law is not the best answer for this question. B Common or judicial law is correct. C Administrative law is not the best answer for this question. D Constitutional amendment is not the best answer for this question.",
    "topic": "Sources of law",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-022",
    "position": 22,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-022",
    "stem": "A nurse tells a patient, “If you try to leave, I will hold you down,” but does not touch the patient. Which tort is most likely?",
    "options": [
      "Battery",
      "Assault",
      "False imprisonment",
      "Libel"
    ],
    "correct": [
      1
    ],
    "rationale": "Assault is a threat creating fear of unwanted contact; battery requires actual harmful or unwanted contact. Incorrect options: A Battery is not the best answer for this question. B Assault is correct. C False imprisonment is not the best answer for this question. D Libel is not the best answer for this question.",
    "topic": "Torts",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-023",
    "position": 23,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-023",
    "stem": "Without consent or an emergency exception, a nurse injects a medication into a patient who clearly refused it. This is:",
    "options": [
      "Assault",
      "Battery",
      "Slander",
      "Negligence"
    ],
    "correct": [
      1
    ],
    "rationale": "Battery is intentional unwanted physical contact, including treatment without consent. Incorrect options: A Assault is not the best answer for this question. B Battery is correct. C Slander is not the best answer for this question. D Negligence is not the best answer for this question.",
    "topic": "Torts",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-024",
    "position": 24,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-024",
    "stem": "A nurse locks a competent patient in a room solely because the patient is annoying, without an order or safety basis. This may constitute:",
    "options": [
      "False imprisonment",
      "Beneficence",
      "Appropriate restraint",
      "Veracity"
    ],
    "correct": [
      0
    ],
    "rationale": "Restricting a person’s freedom without legal or safety justification can be false imprisonment. Incorrect options: A False imprisonment is correct. B Beneficence is not the best answer for this question. C Appropriate restraint is not the best answer for this question. D Veracity is not the best answer for this question.",
    "topic": "Torts",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-025",
    "position": 25,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-025",
    "stem": "Which examples are defamation? (Select all that apply)",
    "options": [
      "A nurse falsely tells coworkers that a patient steals drugs.",
      "A nurse posts a false accusation about a colleague online.",
      "A nurse documents an objective assessment finding.",
      "A nurse makes a false spoken accusation in the hallway.",
      "A nurse privately asks a patient a relevant assessment question."
    ],
    "correct": [
      0,
      1,
      3
    ],
    "rationale": "Defamation is false communication that harms reputation; spoken defamation is slander and written or published defamation is libel. Objective documentation and assessment are not defamation. Incorrect options: A A nurse falsely tells coworkers that a patient steals drugs. is correct. B A nurse posts a false accusation about a colleague online. is correct. C A nurse documents an objective assessment finding. is not the best answer for this question. D A nurse makes a false spoken accusation in the hallway. is correct. E A nurse privately asks a patient a relevant assessment question. is not the best answer for this question.",
    "topic": "Torts",
    "difficulty": "hard",
    "item_type": "sata"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-026",
    "position": 26,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-026",
    "stem": "A nurse tells a visitor, falsely, that a patient has a communicable disease. The statement is spoken. Which tort is most specific?",
    "options": [
      "Libel",
      "Slander",
      "Battery",
      "Fraud"
    ],
    "correct": [
      1
    ],
    "rationale": "Slander is spoken defamation; libel is written or published defamation. Incorrect options: A Libel is not the best answer for this question. B Slander is correct. C Battery is not the best answer for this question. D Fraud is not the best answer for this question.",
    "topic": "Torts",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-027",
    "position": 27,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-027",
    "stem": "Before signing consent, a patient asks the nurse, “What are the procedure’s risks and alternatives?” What should the nurse do?",
    "options": [
      "Explain the procedure in place of the provider.",
      "Ask the patient to sign and learn details later.",
      "Pause the process and contact the provider for procedure-specific explanation.",
      "Tell the patient risks are minor."
    ],
    "correct": [
      2
    ],
    "rationale": "The provider explains risks, benefits, alternatives, and procedure-specific details. The nurse verifies understanding and stops when clarification is needed. Incorrect options: A Explain the procedure in place of the provider. is not the best answer for this question. B Ask the patient to sign and learn details later. is not the best answer for this question. C Pause the process and contact the provider for procedure-specific explanation. is correct. D Tell the patient risks are minor. is not the best answer for this question.",
    "topic": "Informed consent",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-028",
    "position": 28,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-028",
    "stem": "Which findings should cause the nurse to question whether consent is valid? (Select all that apply)",
    "options": [
      "The patient cannot explain the procedure in their own words.",
      "The patient appears coerced by a family member.",
      "The patient is competent and asks appropriate questions.",
      "The signature is obtained after adequate explanation and voluntarily.",
      "The patient is too sedated to participate meaningfully."
    ],
    "correct": [
      0,
      1,
      4
    ],
    "rationale": "Valid consent requires comprehension, voluntariness, and competence. Sedation, coercion, or inability to explain the decision require follow-up. Incorrect options: A The patient cannot explain the procedure in their own words. is correct. B The patient appears coerced by a family member. is correct. C The patient is competent and asks appropriate questions. is not the best answer for this question. D The signature is obtained after adequate explanation and voluntarily. is not the best answer for this question. E The patient is too sedated to participate meaningfully. is correct.",
    "topic": "Informed consent",
    "difficulty": "hard",
    "item_type": "sata"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-029",
    "position": 29,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-029",
    "stem": "Which statement correctly distinguishes advance directives?",
    "options": [
      "A living will names the decision-maker; durable power of attorney states treatment wishes.",
      "A living will states desired care; durable power of attorney names a healthcare decision-maker.",
      "Both documents apply only to financial decisions.",
      "Neither document guides care when the patient loses capacity."
    ],
    "correct": [
      1
    ],
    "rationale": "A living will describes what treatments the patient wants or refuses; a durable power of attorney for healthcare identifies who decides if the patient cannot. Incorrect options: A A living will names the decision-maker; durable power of attorney states treatment wishes. is not the best answer for this question. B A living will states desired care; durable power of attorney names a healthcare decision-maker. is correct. C Both documents apply only to financial decisions. is not the best answer for this question. D Neither document guides care when the patient loses capacity. is not the best answer for this question.",
    "topic": "Patient rights and advance directives",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-030",
    "position": 30,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-030",
    "stem": "The Patient Self-Determination Act primarily supports:",
    "options": [
      "Hospital profit decisions",
      "Patient participation in healthcare decisions and advance directives",
      "Automatic treatment for every patient",
      "Disclosure of records to employers"
    ],
    "correct": [
      1
    ],
    "rationale": "The Act supports informing patients about decision-making rights and advance directives. Incorrect options: A Hospital profit decisions is not the best answer for this question. B Patient participation in healthcare decisions and advance directives is correct. C Automatic treatment for every patient is not the best answer for this question. D Disclosure of records to employers is not the best answer for this question.",
    "topic": "Patient rights and advance directives",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-031",
    "position": 31,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-031",
    "stem": "Under HIPAA, which action is most appropriate?",
    "options": [
      "Discussing a patient in a public elevator because no name is used",
      "Accessing only the information needed for the nurse’s role",
      "Posting a de-identified-looking patient story on social media",
      "Sharing the chart with a curious neighbor"
    ],
    "correct": [
      1
    ],
    "rationale": "HIPAA supports privacy and minimum-necessary access to protected health information. Incorrect options: A Discussing a patient in a public elevator because no name is used is not the best answer for this question. B Accessing only the information needed for the nurse’s role is correct. C Posting a de-identified-looking patient story on social media is not the best answer for this question. D Sharing the chart with a curious neighbor is not the best answer for this question.",
    "topic": "Federal laws",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-032",
    "position": 32,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-032",
    "stem": "A hospital emergency department must provide an emergency medical screening to a person who cannot pay. Which law applies?",
    "options": [
      "EMTALA",
      "HITECH",
      "ADA only",
      "Patient Self-Determination Act"
    ],
    "correct": [
      0
    ],
    "rationale": "EMTALA requires emergency screening regardless of ability to pay, citizenship, or legal status and requires stabilization before applicable transfer. Incorrect options: A EMTALA is correct. B HITECH is not the best answer for this question. C ADA only is not the best answer for this question. D Patient Self-Determination Act is not the best answer for this question.",
    "topic": "Federal laws",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-033",
    "position": 33,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-033",
    "stem": "Which actions support electronic health information privacy? (Select all that apply)",
    "options": [
      "Use an individual login rather than sharing passwords.",
      "Report a suspected breach according to policy.",
      "Leave an open chart visible at a public workstation.",
      "Access records only for a care-related need.",
      "Send patient information through an unapproved personal account."
    ],
    "correct": [
      0,
      1,
      3
    ],
    "rationale": "Individual authentication, prompt breach reporting, and role-based access protect electronic information under HIPAA/HITECH expectations. Incorrect options: A Use an individual login rather than sharing passwords. is correct. B Report a suspected breach according to policy. is correct. C Leave an open chart visible at a public workstation. is not the best answer for this question. D Access records only for a care-related need. is correct. E Send patient information through an unapproved personal account. is not the best answer for this question.",
    "topic": "Federal laws",
    "difficulty": "medium",
    "item_type": "sata"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-034",
    "position": 34,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-034",
    "stem": "A patient with a mobility disability asks for an accessible treatment area. The nurse should recognize this request as related to:",
    "options": [
      "ADA reasonable accommodation",
      "EMTALA transfer requirements",
      "Malpractice damages",
      "Whistleblowing"
    ],
    "correct": [
      0
    ],
    "rationale": "The Americans with Disabilities Act protects against disability discrimination and supports reasonable accommodations. Incorrect options: A ADA reasonable accommodation is correct. B EMTALA transfer requirements is not the best answer for this question. C Malpractice damages is not the best answer for this question. D Whistleblowing is not the best answer for this question.",
    "topic": "Federal laws",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-035",
    "position": 35,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-035",
    "stem": "A nurse is required by state law to report suspected child abuse. What is the nurse’s best action?",
    "options": [
      "Wait until proof is obtained.",
      "Report reasonable suspicion through the required pathway and document objectively.",
      "Ask the suspected abuser to approve the report.",
      "Post the concern in a staff group chat."
    ],
    "correct": [
      1
    ],
    "rationale": "Mandatory reporting generally requires reporting reasonable suspicion, not proving abuse; documentation should be factual and confidential. Incorrect options: A Wait until proof is obtained. is not the best answer for this question. B Report reasonable suspicion through the required pathway and document objectively. is correct. C Ask the suspected abuser to approve the report. is not the best answer for this question. D Post the concern in a staff group chat. is not the best answer for this question.",
    "topic": "Mandatory reporting",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-036",
    "position": 36,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-036",
    "stem": "Which situations commonly require mandatory reporting under applicable law? (Select all that apply)",
    "options": [
      "Suspected child abuse",
      "Suspected elder abuse",
      "Certain reportable communicable diseases",
      "A patient’s unpopular political belief",
      "Suspected neglect of a legally protected vulnerable person"
    ],
    "correct": [
      0,
      1,
      2,
      4
    ],
    "rationale": "Mandatory reporting varies by jurisdiction but commonly includes suspected abuse or neglect of protected persons and specified communicable diseases. Incorrect options: A Suspected child abuse is correct. B Suspected elder abuse is correct. C Certain reportable communicable diseases is correct. D A patient’s unpopular political belief is not the best answer for this question. E Suspected neglect of a legally protected vulnerable person is correct.",
    "topic": "Mandatory reporting",
    "difficulty": "medium",
    "item_type": "sata"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-037",
    "position": 37,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-037",
    "stem": "A nurse provides unpaid emergency assistance at an accident scene, stays within competence, and did not cause the emergency. Which protection may apply?",
    "options": [
      "Good Samaritan law",
      "HIPAA authorization",
      "False imprisonment",
      "Respondeat superior only"
    ],
    "correct": [
      0
    ],
    "rationale": "Good Samaritan protections generally apply to voluntary, reasonable emergency aid within competence when conditions in the jurisdiction are met. Incorrect options: A Good Samaritan law is correct. B HIPAA authorization is not the best answer for this question. C False imprisonment is not the best answer for this question. D Respondeat superior only is not the best answer for this question.",
    "topic": "Good Samaritan laws",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-038",
    "position": 38,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-038",
    "stem": "Which action is most consistent with professional accountability?",
    "options": [
      "Delegating the RN’s evaluation responsibility to an assistant",
      "Following the Nurse Practice Act and institutional policy while accepting responsibility for one’s actions",
      "Ignoring a policy that is inconvenient",
      "Assuming another nurse’s license makes the RN’s decision safe"
    ],
    "correct": [
      1
    ],
    "rationale": "The Nurse Practice Act, Board rules, institutional policies, ANA standards, and the nurse’s own judgment guide accountability; responsibility cannot simply be delegated away. Incorrect options: A Delegating the RN’s evaluation responsibility to an assistant is not the best answer for this question. B Following the Nurse Practice Act and institutional policy while accepting responsibility for one’s actions is correct. C Ignoring a policy that is inconvenient is not the best answer for this question. D Assuming another nurse’s license makes the RN’s decision safe is not the best answer for this question.",
    "topic": "Professional standards",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-039",
    "position": 39,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-039",
    "stem": "A nurse manager organizes staffing, schedules, and supplies for a unit. This behavior is primarily:",
    "options": [
      "Leadership",
      "Management",
      "Mentoring",
      "Followership"
    ],
    "correct": [
      1
    ],
    "rationale": "Management emphasizes formal authority, planning, organizing, coordinating, and resource allocation. Incorrect options: A Leadership is not the best answer for this question. B Management is correct. C Mentoring is not the best answer for this question. D Followership is not the best answer for this question.",
    "topic": "Leadership and management",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-040",
    "position": 40,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-040",
    "stem": "A nurse inspires the team with a shared vision and coaches staff to develop new skills. This best reflects:",
    "options": [
      "Transformational leadership",
      "Transactional leadership",
      "Laissez-faire leadership",
      "Coercive power"
    ],
    "correct": [
      0
    ],
    "rationale": "Transformational leaders use vision, inspiration, empowerment, trust, and coaching to motivate growth beyond immediate exchanges. Incorrect options: A Transformational leadership is correct. B Transactional leadership is not the best answer for this question. C Laissez-faire leadership is not the best answer for this question. D Coercive power is not the best answer for this question.",
    "topic": "Leadership theories",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-041",
    "position": 41,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-041",
    "stem": "During a rapidly deteriorating situation, the charge nurse gives clear immediate directions and makes the decision without group discussion. Which style is most useful here?",
    "options": [
      "Democratic",
      "Autocratic",
      "Laissez-faire",
      "Servant"
    ],
    "correct": [
      1
    ],
    "rationale": "Autocratic leadership can be appropriate when rapid, directive decisions are needed for safety. Incorrect options: A Democratic is not the best answer for this question. B Autocratic is correct. C Laissez-faire is not the best answer for this question. D Servant is not the best answer for this question.",
    "topic": "Leadership styles",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-042",
    "position": 42,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-042",
    "stem": "A charge nurse invites staff input, discusses options, and uses group agreement for a nonurgent workflow change. This is:",
    "options": [
      "Democratic leadership",
      "Autocratic leadership",
      "Coercive leadership",
      "Laissez-faire leadership"
    ],
    "correct": [
      0
    ],
    "rationale": "Democratic leadership uses participation and shared decision-making. Incorrect options: A Democratic leadership is correct. B Autocratic leadership is not the best answer for this question. C Coercive leadership is not the best answer for this question. D Laissez-faire leadership is not the best answer for this question.",
    "topic": "Leadership styles",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-043",
    "position": 43,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-043",
    "stem": "Which behaviors demonstrate emotional intelligence? (Select all that apply)",
    "options": [
      "Recognizing one’s frustration before responding",
      "Using self-management to speak respectfully during conflict",
      "Noticing a colleague’s distress and responding with empathy",
      "Ignoring the effect of one’s behavior on others",
      "Adjusting communication to preserve a working relationship"
    ],
    "correct": [
      0,
      1,
      2,
      4
    ],
    "rationale": "Self-awareness, self-management, social awareness, empathy, and relationship management are components of emotional intelligence. Incorrect options: A Recognizing one’s frustration before responding is correct. B Using self-management to speak respectfully during conflict is correct. C Noticing a colleague’s distress and responding with empathy is correct. D Ignoring the effect of one’s behavior on others is not the best answer for this question. E Adjusting communication to preserve a working relationship is correct.",
    "topic": "Emotional intelligence",
    "difficulty": "medium",
    "item_type": "sata"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-044",
    "position": 44,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-044",
    "stem": "A new graduate receives hands-on orientation and role-specific feedback from an experienced nurse for the first six weeks. The experienced nurse is acting as a:",
    "options": [
      "Mentor",
      "Preceptor",
      "Whistleblower",
      "Mediator"
    ],
    "correct": [
      1
    ],
    "rationale": "A preceptor provides practical teaching and orientation for a specific role; mentoring is typically longer-term career development. Incorrect options: A Mentor is not the best answer for this question. B Preceptor is correct. C Whistleblower is not the best answer for this question. D Mediator is not the best answer for this question.",
    "topic": "Preceptor versus mentor",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-045",
    "position": 45,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-045",
    "stem": "A nurse supports the team mission but respectfully presents evidence that a proposed workflow may harm patients. This demonstrates:",
    "options": [
      "Effective followership",
      "Disloyalty",
      "Laissez-faire leadership",
      "Coercive power"
    ],
    "correct": [
      0
    ],
    "rationale": "Effective followers think critically, offer truthful feedback, take responsibility, and address disagreement appropriately. Incorrect options: A Effective followership is correct. B Disloyalty is not the best answer for this question. C Laissez-faire leadership is not the best answer for this question. D Coercive power is not the best answer for this question.",
    "topic": "Followership",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-046",
    "position": 46,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-046",
    "stem": "Staff seek a nurse’s advice because of deep knowledge and clinical skill. Which source of power is this?",
    "options": [
      "Legitimate power",
      "Expert power",
      "Reward power",
      "Coercive power"
    ],
    "correct": [
      1
    ],
    "rationale": "Expert power comes from knowledge, competence, or specialized skill. Incorrect options: A Legitimate power is not the best answer for this question. B Expert power is correct. C Reward power is not the best answer for this question. D Coercive power is not the best answer for this question.",
    "topic": "Power",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-047",
    "position": 47,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-047",
    "stem": "A nurse manager gives a staff member a preferred schedule in exchange for completing a project. This uses:",
    "options": [
      "Referent power",
      "Reward power",
      "Expert power",
      "Informational privacy"
    ],
    "correct": [
      1
    ],
    "rationale": "Reward power influences behavior through valued benefits or incentives. Incorrect options: A Referent power is not the best answer for this question. B Reward power is correct. C Expert power is not the best answer for this question. D Informational privacy is not the best answer for this question.",
    "topic": "Power",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-048",
    "position": 48,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-048",
    "stem": "A nurse-led group identifies why staff resist a new electronic handoff, tests the workflow, and then incorporates the successful process into routine practice. Which sequence is represented?",
    "options": [
      "Unfreezing, implementing change, and refreezing/integrating",
      "Punishment, delegation, and discharge",
      "Assessment, diagnosis, and informed consent",
      "Slander, libel, and fraud"
    ],
    "correct": [
      0
    ],
    "rationale": "Change work begins by preparing or unfreezing, proceeds through implementation, and stabilizes when integrated into normal practice. Incorrect options: A Unfreezing, implementing change, and refreezing/integrating is correct. B Punishment, delegation, and discharge is not the best answer for this question. C Assessment, diagnosis, and informed consent is not the best answer for this question. D Slander, libel, and fraud is not the best answer for this question.",
    "topic": "Change management",
    "difficulty": "hard",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-049",
    "position": 49,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-049",
    "stem": "Which action is most likely to reduce resistance to a proposed practice change?",
    "options": [
      "Withhold the reason for the change.",
      "Invite affected staff to discuss concerns and participate in planning.",
      "Threaten anyone who asks questions.",
      "Implement it without training."
    ],
    "correct": [
      1
    ],
    "rationale": "Transparent communication, participation, education, and support help staff understand and adopt change. Incorrect options: A Withhold the reason for the change. is not the best answer for this question. B Invite affected staff to discuss concerns and participate in planning. is correct. C Threaten anyone who asks questions. is not the best answer for this question. D Implement it without training. is not the best answer for this question.",
    "topic": "Change management",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-050",
    "position": 50,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-050",
    "stem": "Two nurses disagree about assignment fairness. Which response best supports conflict resolution?",
    "options": [
      "Avoid the issue and complain to coworkers.",
      "State each concern, identify shared patient-safety goals, and negotiate a workable solution.",
      "Insist on winning before listening.",
      "Ask a patient to choose who is correct."
    ],
    "correct": [
      1
    ],
    "rationale": "Respectful communication, shared goals, and negotiation can produce a win-win solution. Incorrect options: A Avoid the issue and complain to coworkers. is not the best answer for this question. B State each concern, identify shared patient-safety goals, and negotiate a workable solution. is correct. C Insist on winning before listening. is not the best answer for this question. D Ask a patient to choose who is correct. is not the best answer for this question.",
    "topic": "Conflict management",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-051",
    "position": 51,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-051",
    "stem": "A nurse uses a calm, private conversation to clarify facts before responding to an angry colleague. This primarily demonstrates:",
    "options": [
      "Emotional intelligence and constructive conflict communication",
      "False imprisonment",
      "Coercive power",
      "Moral outrage"
    ],
    "correct": [
      0
    ],
    "rationale": "Self-management and respectful clarification reduce escalation and support relationship management. Incorrect options: A Emotional intelligence and constructive conflict communication is correct. B False imprisonment is not the best answer for this question. C Coercive power is not the best answer for this question. D Moral outrage is not the best answer for this question.",
    "topic": "Conflict management",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-052",
    "position": 52,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-052",
    "stem": "Which task is appropriate for the RN to delegate to an experienced UAP for a stable patient?",
    "options": [
      "Initial nursing assessment",
      "Evaluation of response to a new intervention",
      "Routine measurement of vital signs",
      "Development of the nursing care plan"
    ],
    "correct": [
      2
    ],
    "rationale": "Routine vital signs for a stable patient can be delegated when the UAP is competent and the RN provides supervision; assessment, evaluation, and care-plan decisions require nursing judgment. Incorrect options: A Initial nursing assessment is not the best answer for this question. B Evaluation of response to a new intervention is not the best answer for this question. C Routine measurement of vital signs is correct. D Development of the nursing care plan is not the best answer for this question.",
    "topic": "Delegation",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-053",
    "position": 53,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-053",
    "stem": "Which activity must the RN perform rather than delegate?",
    "options": [
      "Ambulating a stable patient who has walked before",
      "Assisting with a bath",
      "Initial assessment of a newly admitted patient",
      "Recording intake and output"
    ],
    "correct": [
      2
    ],
    "rationale": "Initial assessment requires professional nursing judgment and cannot be delegated to UAP personnel. Incorrect options: A Ambulating a stable patient who has walked before is not the best answer for this question. B Assisting with a bath is not the best answer for this question. C Initial assessment of a newly admitted patient is correct. D Recording intake and output is not the best answer for this question.",
    "topic": "Delegation",
    "difficulty": "easy",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-054",
    "position": 54,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-054",
    "stem": "The RN asks an LPN to administer a routine medication within the LPN’s scope. What remains the RN’s responsibility?",
    "options": [
      "Nothing after assigning it",
      "Appropriate delegation, patient-specific assignment, and follow-up of outcomes",
      "The LPN’s license and personal decisions",
      "Only the patient’s meal preference"
    ],
    "correct": [
      1
    ],
    "rationale": "The RN retains responsibility for deciding whether delegation is appropriate, supervising as required, and following up on patient outcomes. Incorrect options: A Nothing after assigning it is not the best answer for this question. B Appropriate delegation, patient-specific assignment, and follow-up of outcomes is correct. C The LPN’s license and personal decisions is not the best answer for this question. D Only the patient’s meal preference is not the best answer for this question.",
    "topic": "Delegation",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-055",
    "position": 55,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-055",
    "stem": "Which assignments are unsafe to delegate to a UAP? (Select all that apply)",
    "options": [
      "Initial assessment of a patient with new chest discomfort",
      "Evaluation of whether a care goal was met",
      "Routine ambulation of a stable patient",
      "Teaching a patient how to manage a new ostomy",
      "Collecting a routine urine specimen from a stable patient"
    ],
    "correct": [
      0,
      1,
      3
    ],
    "rationale": "Initial assessment, evaluation, and teaching require nursing knowledge and judgment. Routine ambulation or specimen collection may be appropriate if the patient is stable and the UAP is competent. Incorrect options: A Initial assessment of a patient with new chest discomfort is correct. B Evaluation of whether a care goal was met is correct. C Routine ambulation of a stable patient is not the best answer for this question. D Teaching a patient how to manage a new ostomy is correct. E Collecting a routine urine specimen from a stable patient is not the best answer for this question.",
    "topic": "Delegation",
    "difficulty": "hard",
    "item_type": "sata"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-056",
    "position": 56,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-056",
    "stem": "A UAP reports that a stable patient’s blood pressure is much lower than earlier. What should the RN do first?",
    "options": [
      "Tell the UAP to recheck it at the end of the shift.",
      "Assess the patient and verify the finding promptly.",
      "Ask the UAP to decide whether treatment is needed.",
      "Document that the UAP is responsible."
    ],
    "correct": [
      1
    ],
    "rationale": "The RN must assess a potentially significant change and validate data before deciding interventions; delegation does not transfer nursing judgment. Incorrect options: A Tell the UAP to recheck it at the end of the shift. is not the best answer for this question. B Assess the patient and verify the finding promptly. is correct. C Ask the UAP to decide whether treatment is needed. is not the best answer for this question. D Document that the UAP is responsible. is not the best answer for this question.",
    "topic": "Delegation",
    "difficulty": "hard",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-057",
    "position": 57,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-057",
    "stem": "A nurse is asked to perform a procedure for which the nurse has no training. Which response is best?",
    "options": [
      "Perform it quickly to avoid disappointing the team.",
      "Accept it and ask the patient for instructions.",
      "State the limitation and seek qualified assistance or education.",
      "Delegate it to an untrained student."
    ],
    "correct": [
      2
    ],
    "rationale": "Professional standards require the nurse to practice within competence and protect the patient by obtaining qualified help. Incorrect options: A Perform it quickly to avoid disappointing the team. is not the best answer for this question. B Accept it and ask the patient for instructions. is not the best answer for this question. C State the limitation and seek qualified assistance or education. is correct. D Delegate it to an untrained student. is not the best answer for this question.",
    "topic": "Professional standards",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-058",
    "position": 58,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-058",
    "stem": "A servant leader notices that staff lack resources for safe discharge teaching. Which action best reflects servant leadership?",
    "options": [
      "Blame staff for poor performance.",
      "Remove barriers, secure resources, and support staff development.",
      "Use threats to increase compliance.",
      "Avoid involvement so the team is independent."
    ],
    "correct": [
      1
    ],
    "rationale": "Servant leadership centers on serving and developing others, building trust, and removing barriers to effective work. Incorrect options: A Blame staff for poor performance. is not the best answer for this question. B Remove barriers, secure resources, and support staff development. is correct. C Use threats to increase compliance. is not the best answer for this question. D Avoid involvement so the team is independent. is not the best answer for this question.",
    "topic": "Leadership theories",
    "difficulty": "medium",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-059",
    "position": 59,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-059",
    "stem": "A nurse recognizes that a colleague’s unsafe practice may harm a patient. Which action is the priority?",
    "options": [
      "Protect the colleague from consequences.",
      "Take immediate steps to protect the patient and report through the appropriate chain.",
      "Discuss the situation on social media.",
      "Wait until annual evaluation."
    ],
    "correct": [
      1
    ],
    "rationale": "Patient safety comes first; the nurse should intervene within role and report concerns through appropriate professional channels. Incorrect options: A Protect the colleague from consequences. is not the best answer for this question. B Take immediate steps to protect the patient and report through the appropriate chain. is correct. C Discuss the situation on social media. is not the best answer for this question. D Wait until annual evaluation. is not the best answer for this question.",
    "topic": "Patient advocacy",
    "difficulty": "hard",
    "item_type": "mcq"
  },
  {
    "set_key": "nur215-foundations-practice",
    "legacy_id": "nur215-060",
    "position": 60,
    "source_key": "legacy-practice-set:nur215-foundations-practice:nur215-060",
    "stem": "Which statement by a student nurse demonstrates correct understanding of delegation?",
    "options": [
      "“If I delegate a task, I no longer have responsibility for the patient.”",
      "“I may delegate nursing judgment if the UAP has worked here for years.”",
      "“I must match the task and patient to the team member’s competence and follow up on outcomes.”",
      "“Any task can be delegated when the unit is busy.”"
    ],
    "correct": [
      2
    ],
    "rationale": "Safe delegation matches the task, circumstance, person, and supervision requirements; the RN retains accountability for nursing judgment and follow-up. Incorrect options: A “If I delegate a task, I no longer have responsibility for the patient.” is not the best answer for this question. B “I may delegate nursing judgment if the UAP has worked here for years.” is not the best answer for this question. C “I must match the task and patient to the team member’s competence and follow up on outcomes.” is correct. D “Any task can be delegated when the unit is busy.” is not the best answer for this question.",
    "topic": "Delegation",
    "difficulty": "hard",
    "item_type": "mcq"
  }
]
$legacy_questions$::jsonb) AS item(
  set_key text,
  legacy_id text,
  position integer,
  source_key text,
  stem text,
  options jsonb,
  correct jsonb,
  rationale text,
  topic text,
  difficulty text,
  item_type text
);

  IF EXISTS (
    SELECT 1 FROM legacy_practice_items item
    WHERE item.item_type NOT IN ('mcq', 'sata')
      OR jsonb_typeof(item.options) <> 'array'
      OR jsonb_array_length(item.options) < 4
      OR jsonb_typeof(item.correct) <> 'array'
      OR jsonb_array_length(item.correct) = 0
      OR item.difficulty NOT IN ('easy', 'medium', 'hard')
      OR (item.item_type = 'mcq' AND (
        jsonb_array_length(item.options) <> 4
        OR jsonb_array_length(item.correct) <> 1
        OR (item.correct->>0)::integer NOT BETWEEN 0 AND 3
      ))
      OR (item.item_type = 'sata' AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(item.correct) AS answer_index(value)
        WHERE value::integer < 0 OR value::integer >= jsonb_array_length(item.options)
      ))
  ) THEN
    RAISE EXCEPTION 'Legacy practice migration contains an invalid question or answer structure.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM legacy_practice_items first_item
    JOIN legacy_practice_items second_item
      ON lower(trim(first_item.stem)) = lower(trim(second_item.stem))
     AND (first_item.set_key, first_item.position) < (second_item.set_key, second_item.position)
  ) THEN
    RAISE EXCEPTION 'The migration payload contains repeated question stems; review before importing.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM legacy_practice_items item
    JOIN public.questions q ON q.source_key = item.source_key
    WHERE q.stem IS DISTINCT FROM item.stem
      OR q.item_type IS DISTINCT FROM item.item_type
      OR q.rationale IS DISTINCT FROM item.rationale
      OR (
        item.item_type = 'mcq'
        AND (
          jsonb_build_array(q.option_a, q.option_b, q.option_c, q.option_d) IS DISTINCT FROM item.options
          OR q.correct_answer IS DISTINCT FROM chr(97 + (item.correct->>0)::integer)
        )
      )
      OR (
        item.item_type = 'sata'
        AND (
          q.item_data->'options' IS DISTINCT FROM item.options
          OR q.item_data->'correct' IS DISTINCT FROM item.correct
        )
      )
  ) THEN
    RAISE EXCEPTION 'A legacy source key already belongs to different question content; resolve it before migrating.';
  END IF;

  SELECT string_agg(
    format('%s/%s conflicts with bank question %s%s',
      item.set_key,
      item.legacy_id,
      q.id,
      CASE WHEN q.active IS TRUE THEN ' (active)' ELSE ' (inactive)' END
    ),
    E'\n'
  )
  INTO conflict_details
  FROM legacy_practice_items item
  JOIN public.questions q
    ON lower(trim(q.stem)) = lower(trim(item.stem))
   AND q.item_type = item.item_type
   AND (
     (item.item_type = 'mcq'
      AND jsonb_build_array(q.option_a, q.option_b, q.option_c, q.option_d) = item.options
      AND q.correct_answer = chr(97 + (item.correct->>0)::integer))
     OR
     (item.item_type = 'sata'
      AND q.item_data->'options' = item.options
      AND q.item_data->'correct' = item.correct)
   )
  WHERE q.rationale IS DISTINCT FROM item.rationale;

  IF conflict_details IS NOT NULL THEN
    RAISE EXCEPTION 'A matching question has a different rationale; resolve the content before migrating.'
      USING DETAIL = conflict_details;
  END IF;
UPDATE public.questions q
SET active = TRUE,
    source_key = COALESCE(q.source_key, item.source_key)
FROM legacy_practice_items item
WHERE q.id = (
  SELECT match.id
  FROM public.questions match
  WHERE match.stem = item.stem
    AND match.item_type = item.item_type
    AND match.rationale IS NOT DISTINCT FROM item.rationale
    AND (
      (item.item_type = 'mcq'
       AND jsonb_build_array(match.option_a, match.option_b, match.option_c, match.option_d) = item.options
       AND match.correct_answer = chr(97 + (item.correct->>0)::integer))
      OR
      (item.item_type = 'sata'
       AND match.item_data->'options' = item.options
       AND match.item_data->'correct' = item.correct)
    )
  ORDER BY match.active DESC, match.question_no NULLS LAST, match.id
  LIMIT 1
)
AND q.active IS DISTINCT FROM TRUE;

INSERT INTO public.questions (
  stem, option_a, option_b, option_c, option_d, correct_answer, rationale,
  module_key, nclex_category, nclex_sub, topic, difficulty, is_ngn, active,
  source_key, item_type, item_data
)
SELECT
  item.stem,
  CASE WHEN item.item_type = 'mcq' THEN item.options->>0 END,
  CASE WHEN item.item_type = 'mcq' THEN item.options->>1 END,
  CASE WHEN item.item_type = 'mcq' THEN item.options->>2 END,
  CASE WHEN item.item_type = 'mcq' THEN item.options->>3 END,
  CASE WHEN item.item_type = 'mcq' THEN chr(97 + (item.correct->>0)::integer) END,
  item.rationale,
  NULL,
  NULL,
  NULL,
  item.topic,
  item.difficulty,
  item.item_type <> 'mcq',
  TRUE,
  item.source_key,
  item.item_type,
  CASE WHEN item.item_type = 'sata'
    THEN jsonb_build_object('options', item.options, 'correct', item.correct)
    ELSE NULL
  END
FROM legacy_practice_items item
WHERE NOT EXISTS (
  SELECT 1
  FROM public.questions q
  WHERE q.stem = item.stem
    AND q.item_type = item.item_type
    AND q.rationale IS NOT DISTINCT FROM item.rationale
    AND (
      (item.item_type = 'mcq'
       AND jsonb_build_array(q.option_a, q.option_b, q.option_c, q.option_d) = item.options
       AND q.correct_answer = chr(97 + (item.correct->>0)::integer))
      OR
      (item.item_type = 'sata'
       AND q.item_data->'options' = item.options
       AND q.item_data->'correct' = item.correct)
    )
)
ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING;

INSERT INTO public.question_set_items (set_key, legacy_id, position, question_id)
SELECT
  item.set_key,
  item.legacy_id,
  item.position,
  COALESCE(
    (
      SELECT q.id FROM public.questions q
      WHERE q.source_key = item.source_key AND q.active IS TRUE
      LIMIT 1
    ),
    (
      SELECT q.id FROM public.questions q
      WHERE q.active IS TRUE
        AND q.stem = item.stem
        AND q.item_type = item.item_type
        AND q.rationale IS NOT DISTINCT FROM item.rationale
        AND (
          (item.item_type = 'mcq'
           AND jsonb_build_array(q.option_a, q.option_b, q.option_c, q.option_d) = item.options
           AND q.correct_answer = chr(97 + (item.correct->>0)::integer))
          OR
          (item.item_type = 'sata'
           AND q.item_data->'options' = item.options
           AND q.item_data->'correct' = item.correct)
        )
      ORDER BY q.question_no NULLS LAST, q.id
      LIMIT 1
    )
  )
FROM legacy_practice_items item
ON CONFLICT (set_key, legacy_id) DO UPDATE
SET position = EXCLUDED.position, question_id = EXCLUDED.question_id;

DROP TABLE legacy_practice_items;

END $$;

COMMIT;

SELECT set_key, count(*) AS question_count
FROM public.question_set_items
WHERE set_key IN (
  'safety-priority-01',
  'med-procedure-01',
  'ngn-acute-01',
  'nur215-foundations-practice'
)
GROUP BY set_key
ORDER BY set_key;
