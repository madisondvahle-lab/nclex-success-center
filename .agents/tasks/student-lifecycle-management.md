# Student lifecycle management

## Scope
Adds non-destructive lifecycle controls for students:

- `status`: active, paused, completed
- `archived_at`: reversible archive timestamp

`portal_stage` remains separate and controls onboarding/portal routing. Do not merge these concepts.

## Migration
`supabase-student-lifecycle-migration.sql` is additive and preserves all existing rows:

- adds `students.status` and `students.archived_at`
- backfills existing students to `status='active'`
- keeps `archived_at` null for existing students
- validates allowed statuses
- adds indexes for current/admin and archived lists
- does not change RLS, auth mappings, or child tables

Run the migration before deploying the HTML changes. The new admin UI expects both columns.

## Filtering policy
Operational/current lists exclude archived students with `archived_at IS NULL`:

- `madison-admin.html` current roster
- `madison-assignments.html` assignment/upload pickers
- `shared-progress.html` admin student picker
- `assessment-history-admin.html` new-entry student picker/roster

Historical and self-linked data intentionally remains inclusive:

- external assessment history joins
- shared progress history loaded by direct student ID
- supplemental practice history
- in-house assessment history
- student module access
- student authentication/self lookups
- leads/intake student matching

## Safety
Archive is not delete. Restore clears only `archived_at`. Status changes update only `status`. Authentication is not blocked by either lifecycle control.
