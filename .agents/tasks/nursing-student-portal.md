# Task: Nursing Student Portal Variant
Branch: `claude/nursing-student-portal`
Status: **PR ready — awaiting migration run and review**
Author: Claude (Cowork), 2026-09-01

## Summary
Added a nursing-school student portal experience inside the existing `student-dashboard.html`.
NCLEX students are completely unaffected — all existing behaviour preserved.

## Class-scoped module assignments (local feature follow-up)

The `feat/nursing-course-modules` branch adds a class picker to the Success
Center module section of `madison-assignments.html` for nursing-school students.
For example: select Jack, choose NUR 312, check Module 4 - Cardiac, and save.
Use the student preview's NUR 312 tab and Learning Library to check the result.
NCLEX students retain the existing student-wide module assignment workflow.

Class links use `student_class_module_assignments`, with a primary key on
student, class, and module. `save_nursing_class_modules` is an admin-only RPC
that replaces one class's module selections atomically, including an empty
selection. Other classes and unrelated resources are not changed. Concurrent
saves are serialized per student; saves to the same class use last-save-wins
snapshot semantics. The database key prevents duplicate class links.

Module access continues through `student_module_access`. The new
`independent_enabled` column distinguishes independent grants from course-only
access. Effective access remains enabled while either source exists. The
access trigger records later independent writes from existing tools, including
upserts of an already-enabled module. Removing the last course link disables
course-only access, but never clears independent access. Existing enabled rows
are conservatively treated as independent because their original source is
unknown; no attempt is made to guess or revoke legacy grants.

The nursing library filters modules by the selected class. Existing enabled
modules without any class link remain visible separately as "Other assigned
modules" rather than being silently moved or removed. Existing class defaults
are shared between admin and student screens, with saved schedule/resource
class codes also included.

### Required database change and release order

`supabase-nursing-course-modules.sql` **must be reviewed and applied after
approval, before deploying the updated UI**. It requires the existing
nursing-student, class-schedule, class-notes/uploads, and secure-access schema
(including `students.student_type`, `students.archived_at`,
`student_resources.class_code`, `modules`, and `is_app_admin()`).

The migration creates the class-assignment table, student/admin read RLS,
admin-only transactional save RPC, independent-access column, and access
trigger. Direct writes to the new table are not granted to authenticated
clients. Existing class-tagged study-guide resources matching module guide
URLs are imported once and deduplicated into the new table, without deleting
or changing any original resource records. Reapplying the migration does not
restore removed links. Legacy guide resources are no longer the authority for
module assignments. Missing-schema/query errors block saving and are shown
explicitly.

Do not deploy the earlier additive UI after this migration: it does not write
the new table. A frontend rollback to the pre-feature main is possible, but
leave the additive database changes in place pending a separately reviewed
database rollback. Do not drop provenance or disable the access trigger while
course-only access exists.

Validation commands:

- `node --test tests/*.test.cjs tests/*.test.mjs`
- `bash tests/nursing-course-modules-local.sh`

The database runner uses a disposable PostgreSQL 17 Docker container with
synthetic auth identities and RLS roles, not a hosted Supabase project. It tests
atomic save/removal, independent grants, rollback, repeat migration, real
concurrent connections, and persistence from a fresh connection. The JavaScript
tests reload fresh application contexts and check library filtering. This is
not a hosted PostgREST/Supabase Auth end-to-end validation; that remains a
staging check after migration approval.

Integration validation against main `6c20c92`: all 298 Node regression tests
passed on a combined-tree export, including the recent question-editor and
Safe Delete tests. The disposable database runner passed. Browser checks used
isolated, session-persisted mocks and verified add, empty-class save, actual
page refresh, preservation of the other class, final removal, reassignment,
and matching library placement. No production student data was used.

Local code does not assign Jack automatically. Production data changes,
migrations, merging, and deployment require separate approval.

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
