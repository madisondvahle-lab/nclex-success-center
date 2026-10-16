-- Nursing class-specific tutor reminders and student uploads.
-- Apply once in the Supabase SQL Editor before deploying the dashboard change.

ALTER TABLE public.student_resources
  ADD COLUMN IF NOT EXISTS class_code text;

CREATE TABLE IF NOT EXISTS public.student_class_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_code text NOT NULL,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_code)
);

ALTER TABLE public.student_class_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_class_notes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_class_notes TO authenticated;

DROP POLICY IF EXISTS "Students read their class notes" ON public.student_class_notes;
CREATE POLICY "Students read their class notes"
  ON public.student_class_notes FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_class_notes.student_id
        AND s.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins manage class notes" ON public.student_class_notes;
CREATE POLICY "Admins manage class notes"
  ON public.student_class_notes FOR ALL TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());
