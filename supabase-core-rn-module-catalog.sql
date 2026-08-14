-- NCLEX Success Center — Core RN Safety Pathway catalog
-- Run once after supabase-secure-access-migration.sql.
-- This adds five assignable pathway modules without changing or removing
-- existing Module 1–6 records or current student access.

INSERT INTO modules (module_key, module_number, name, emoji, description, guide_url, quiz_url, is_available)
VALUES
  ('core-safety-priority', 101, 'Core 1 · Safe Care, Priorities & Delegation', '🛡️', 'Priority decisions, delegation, infection prevention, blood administration, and safe procedures.', 'core-rn-pathway.html?module=core-safety-priority', 'supplemental-practice.html?set=safety-priority-01', true),
  ('core-medication-calculations', 102, 'Core 2 · Medication, Fluids & Calculations', '💊', 'High-alert medication safety, electrolytes, ABGs, and medication calculations.', 'core-rn-pathway.html?module=core-medication-calculations', 'supplemental-practice.html?set=med-procedure-01', true),
  ('core-lifespan-reproductive', 103, 'Core 3 · OB, Newborn & Pediatric Safety', '👶', 'Preeclampsia, fetal monitoring, postpartum, newborn, and pediatric safety.', 'core-rn-pathway.html?module=core-lifespan-reproductive', 'module2-guide.html', true),
  ('core-acute-systems', 104, 'Core 4 · Acute Care, Systems & Procedures', '🫁', 'Airway, sepsis, shock, fluids, postoperative complications, and acute systems care.', 'core-rn-pathway.html?module=core-acute-systems', 'supplemental-practice.html?set=ngn-acute-01', true),
  ('core-psych-judgment', 105, 'Core 5 · Psych, Clinical Judgment & Integration', '🧠', 'Psych safety, neuroleptic malignant syndrome, therapeutic communication, and the clinical-judgment process.', 'core-rn-pathway.html?module=core-psych-judgment', 'diagnostic.html?mode=practice', true)
ON CONFLICT (module_key) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  description = EXCLUDED.description,
  guide_url = EXCLUDED.guide_url,
  quiz_url = EXCLUDED.quiz_url,
  is_available = EXCLUDED.is_available,
  updated_at = now();
