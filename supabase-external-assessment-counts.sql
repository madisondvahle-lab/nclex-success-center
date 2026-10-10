-- Question counts per category, so small samples can be flagged as unreliable.
ALTER TABLE external_assessments
  ADD COLUMN IF NOT EXISTS category_counts jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Dulce's two UWorld CATs (Test 8 = Sep 22, Test 15 = Sep 30)
UPDATE external_assessments SET category_counts =
 '{"Management of Care":10,"Safety and Infection Control":2,"Health Promotion and Maintenance":14,"Psychosocial Integrity":19,"Basic Care and Comfort":2,"Pharmacological and Parenteral Therapies":15,"Reduction of Risk Potential":5,"Physiological Adaptation":18}'::jsonb
WHERE assessment_name = 'CAT (Test 8) · 129/199'
  AND student_id = (SELECT id FROM students WHERE name ILIKE 'Dulce%' ORDER BY created_at LIMIT 1);
UPDATE external_assessments SET category_counts =
 '{"Management of Care":12,"Safety and Infection Control":1,"Health Promotion and Maintenance":11,"Psychosocial Integrity":1,"Basic Care and Comfort":2,"Pharmacological and Parenteral Therapies":21,"Reduction of Risk Potential":9,"Physiological Adaptation":28}'::jsonb
WHERE assessment_name = 'CAT (Test 15) · 136/215'
  AND student_id = (SELECT id FROM students WHERE name ILIKE 'Dulce%' ORDER BY created_at LIMIT 1);
