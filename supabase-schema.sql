-- ============================================================
-- NCLEX Success Center — Student Admin Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. STUDENTS
CREATE TABLE IF NOT EXISTS students (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name             text NOT NULL,
  email            text,
  pin              text NOT NULL,
  nclex_target_date date,
  created_at       timestamptz DEFAULT now()
);

-- 2. MODULE ACCESS (which modules each student can see)
CREATE TABLE IF NOT EXISTS student_module_access (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  module_key text NOT NULL,   -- 'm1','m2',...'m21'
  enabled    boolean NOT NULL DEFAULT false,
  UNIQUE(student_id, module_key)
);

-- 3. SCORES (CAT, UWorld, ATI per student)
CREATE TABLE IF NOT EXISTS student_scores (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score_type  text NOT NULL,  -- 'cat' | 'uworld' | 'ati'
  score_value text,
  score_date  date,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

-- 4. SESSION NOTES
CREATE TABLE IF NOT EXISTS session_notes (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  note       text,
  created_at timestamptz DEFAULT now()
);

-- ── Disable RLS (page-level password protects access) ──
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE student_module_access DISABLE ROW LEVEL SECURITY;
ALTER TABLE student_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_notes DISABLE ROW LEVEL SECURITY;

-- ── Seed existing students with current PINs ──
INSERT INTO students (name, email, pin) VALUES
  ('Alyssa',   '', '7284'),
  ('Courtney', '', '0508'),
  ('Ahmed',    '', '1950')
ON CONFLICT DO NOTHING;

-- ── Seed Alyssa's current module access (M1 + M2 active) ──
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM students WHERE name = 'Alyssa';
  INSERT INTO student_module_access (student_id, module_key, enabled) VALUES
    (v_id, 'm1', true),
    (v_id, 'm2', true),
    (v_id, 'm3', false),
    (v_id, 'm4', false),
    (v_id, 'm5', false),
    (v_id, 'm6', false)
  ON CONFLICT (student_id, module_key) DO NOTHING;
END $$;

