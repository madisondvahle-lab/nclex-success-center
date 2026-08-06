-- ============================================================
-- NCLEX Success Center — Question Bank Schema
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS questions (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  stem             text NOT NULL,
  option_a         text NOT NULL,
  option_b         text NOT NULL,
  option_c         text NOT NULL,
  option_d         text NOT NULL,
  correct_answer   text NOT NULL CHECK (correct_answer IN ('a','b','c','d')),
  rationale        text,
  module_key       text,                     -- 'm1'–'m21' or null = general
  nclex_category   text,                     -- top-level NCLEX category
  nclex_sub        text,                     -- subcategory
  topic            text,                     -- specific concept, e.g. 'preeclampsia'
  difficulty       text DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  is_ngn           boolean DEFAULT false,    -- Next Generation NCLEX style
  active           boolean DEFAULT true,     -- soft-delete / draft flag
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE questions DISABLE ROW LEVEL SECURITY;

-- index for fast filtering
CREATE INDEX IF NOT EXISTS idx_questions_module   ON questions(module_key);
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(nclex_category);
CREATE INDEX IF NOT EXISTS idx_questions_diff     ON questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_active   ON questions(active);

