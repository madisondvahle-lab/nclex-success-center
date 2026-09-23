-- NCLEX Success Center — class-specific nursing-student schedules
-- Apply once in Supabase SQL Editor.
--
-- The existing students.exam_date remains available as a transition fallback.
-- This table is the future source of truth for class-specific exam dates.

CREATE TABLE IF NOT EXISTS public.student_class_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_code text NOT NULL CHECK (class_code IN ('NUR 312', 'NUR 321', 'NUR 416')),
  class_name text NOT NULL,
  next_exam_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_code)
);

CREATE INDEX IF NOT EXISTS student_class_schedules_student_idx
  ON public.student_class_schedules(student_id);

ALTER TABLE public.student_class_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can read their class schedules"
  ON public.student_class_schedules;
CREATE POLICY "Students can read their class schedules"
  ON public.student_class_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND s.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can update their class schedules"
  ON public.student_class_schedules;
CREATE POLICY "Students can update their class schedules"
  ON public.student_class_schedules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND s.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND s.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can create their class schedules"
  ON public.student_class_schedules;
CREATE POLICY "Students can create their class schedules"
  ON public.student_class_schedules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND s.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage class schedules"
  ON public.student_class_schedules;
CREATE POLICY "Admins can manage class schedules"
  ON public.student_class_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_admins a
      WHERE a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_admins a
      WHERE a.user_id = auth.uid()
    )
  );
