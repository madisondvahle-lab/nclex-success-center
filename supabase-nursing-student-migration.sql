-- NCLEX Success Center — Nursing student portal migration
-- Run once in Supabase SQL Editor.
--
-- Purpose: Adds student_type and exam_date columns to students so the
-- shared student-dashboard.html can render a nursing-school–optimised
-- experience for students like Jack, while the existing NCLEX experience
-- remains unchanged for all current NCLEX-prep students.
--
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS guards).

-- 1. student_type column
--    'nclex'           → existing NCLEX-prep experience (default, preserves all current students)
--    'nursing_student' → nursing-school student experience
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS student_type text
    NOT NULL DEFAULT 'nclex'
    CHECK (student_type IN ('nclex', 'nursing_student'));

-- 2. exam_date column
--    Stores a nursing student's *next* class exam date.
--    Replaces the nclex_target_date countdown for nursing_student portal type.
--    null = no upcoming exam set yet.
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS exam_date date;

-- 3. Set Jack McDaniel to nursing_student
--    Uses auth_user_id to be safe (matches the current RLS pattern).
UPDATE students
SET student_type = 'nursing_student'
WHERE auth_user_id = 'b105e916-7046-4aa9-b25c-43b98626fca4';

-- Verify:
-- SELECT id, name, student_type, exam_date, portal_stage
-- FROM students
-- WHERE auth_user_id = 'b105e916-7046-4aa9-b25c-43b98626fca4';
