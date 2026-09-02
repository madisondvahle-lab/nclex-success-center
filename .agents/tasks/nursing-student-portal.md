# Task: Nursing Student Portal Variant
Branch: `claude/nursing-student-portal`
Status: **PR ready — awaiting migration run and review**
Author: Claude (Cowork), 2026-09-01

## Summary
Added a nursing-school student portal experience inside the existing `student-dashboard.html`.
NCLEX students are completely unaffected — all existing behaviour preserved.

## What was changed

### `student-dashboard.html`
- Added `student_type` and `exam_date` to the students SELECT query
- Portal now branches on `student.student_type`:
  - `'nclex'` (default) → original NCLEX dashboard, pixel-for-pixel unchanged
  - `'nursing_student'` → new nursing student layout (see below)
- Nursing layout replaces NCLEX-specific language with class-focused language:
  - "Course plan" replaces "NCLEX Roadmap"
  - "What to study now" / weekly priorities replaces CAT/Archer framing
  - "Upcoming exam" card with exam date countdown (uses new `exam_date` column)
  - "Assigned practice" card — surfaces `resource_type='practice_set'` resources prominently
  - "Study resources" card — all other assigned resources
  - "Recent quiz scores" card — pulls from `student_supplemental_practice_results`
  - "Study guides & modules" card — same Supabase module access, relabeled
- Teal colour scheme for nursing portal (--teal: #2a7d6f) to visually distinguish it
- All existing auth, preview-as-student, portal_stage=assessment redirect preserved

### `supabase-nursing-student-migration.sql` (NEW)
Migration that must be run in Supabase SQL Editor before this branch is deployed:
```sql
ALTER TABLE students ADD COLUMN IF NOT EXISTS student_type text NOT NULL DEFAULT 'nclex' CHECK (student_type IN ('nclex', 'nursing_student'));
ALTER TABLE students ADD COLUMN IF NOT EXISTS exam_date date;
UPDATE students SET student_type = 'nursing_student' WHERE auth_user_id = 'b105e916-7046-4aa9-b25c-43b98626fca4';
```

## What was NOT changed
- M1–M7 curriculum files: untouched
- Authentication flow: untouched
- student-login.html: untouched
- assessment-dashboard.html: untouched
- All admin/shared-progress tooling: untouched
- RLS policies: untouched (new columns inherit existing admin/student policies)
- All other student hub pages: untouched

## Remaining work / next steps

### Before merging to main
1. Run `supabase-nursing-student-migration.sql` in the Supabase SQL Editor
2. Verify Jack can log in and sees the nursing portal (teal, class-focused)
3. Verify an existing NCLEX student (Alyssa, Courtney, etc.) sees the original layout unchanged
4. (Optional) Set Jack's `exam_date` in Supabase to enable the exam countdown

### Admin tooling to add later
The admin (`madison-assignments.html` / `admin.html`) does not yet have UI to:
- Set a student's `student_type`
- Set a student's `exam_date`
These currently require a direct Supabase row edit. A follow-up task should add dropdowns/fields for this.

### Jack's current Supabase data
- `students.id`: 5b66c9a5-c80e-424f-ad9c-49f003031c01
- `students.auth_user_id`: b105e916-7046-4aa9-b25c-43b98626fca4
- `portal_stage`: active
- Practice set already assigned: "NUR 321 OB · Exam 1 Practice" (25 questions)
- exam_date: not yet set — Madison should set this to Jack's upcoming exam date

### How the practice set shows up
Jack's "NUR 321 OB · Exam 1 Practice" resource is assigned via `student_resources` with
`resource_type='practice_set'`. The nursing portal already surfaces practice_set resources
in the dedicated "Assigned practice" card and links directly to them.

## Design decisions
- **One file, not two**: Branching on `student_type` inside the same `student-dashboard.html`
  keeps auth, routing, and data fetching unified. No duplication risk.
- **Same Supabase tables**: `student_study_plans`, `student_resources`, `student_module_access`
  serve both portal types — only the labels and layout differ.
- **Additive columns**: `student_type DEFAULT 'nclex'` means zero impact on existing students.
- **No clinical content touched**: This is a UI/routing change only.
