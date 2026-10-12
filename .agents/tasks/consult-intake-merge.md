# Consult intake profile merge

## Status
Code is implemented; the database migration must be applied before the admin UI can merge profiles. Production records have not been changed.

## Admin workflow
- On `madison-leads.html`, choose the profile to keep and the duplicate profile to merge into it.
- The confirmation dialog shows both names, emails, and profile IDs.
- Kept profile values take precedence; blank fields are filled from the duplicate, and multi-value preference fields are combined.
- The merge moves CPR attempts, consultation-prep resources, private report metadata, consult diagnostic results, and consultation bookings.
- CPR attempt numbers from the duplicate are offset to avoid collisions with the kept profile.
- The source intake row and its conflicting prep-resource rows are captured in the admin-only `consult_intake_merge_audit` snapshot before the source row is deleted.
- Profiles linked to different `students` records are rejected. This tool merges intake profiles only; it does not merge student accounts.

## Database setup
Run `supabase-consult-intake-merge-migration.sql` in Supabase SQL Editor after:

1. `supabase-consult-intake-migration.sql`
2. `supabase-student-onboarding-migration.sql`
3. `supabase-calendly-consultations-migration.sql`
4. `supabase-consult-diagnostic-migration.sql`

The migration adds an admin-readable, RLS-protected audit table and a security-definer RPC. The RPC is executable only by authenticated users and independently checks `is_app_admin()` before changing data. Deploy the site from `main` after applying the migration.

## Not included
This change does not alter the CPR importer's single-file control or merge separate student accounts.
