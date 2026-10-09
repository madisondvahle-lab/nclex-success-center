# Calendly free-consultation workflow

## Findings (before this work)
- Calendly was only a booking link (`free-readiness-check.html`). No webhook, API call, or table existed.
- "Prospective students" = `consult_intakes` rows (`student_id` null until converted); active students = `students`. Notes: `session_notes`/`consult_intakes` fields. Admin auth = `app_admins` + `is_app_admin()` RLS.

## Added
- `supabase-calendly-consultations-migration.sql`: `consultations`, `consultation_events` (append-only history), `calendly_webhook_receipts`, admin-only RLS, and service-role-only `process_calendly_event()` (email match: students -> consult_intakes -> create prospect; reschedule/cancel handling; advisory lock prevents duplicates).
- `supabase/functions/calendly-webhook`: verifies Calendly HMAC signature, filters to the free consultation, calls the function.
- `madison-consultations.html`: admin-only list, Start Consultation, template, autosave, optional timer, follow-up email draft. Linked from admin nav.

## Manual setup required
1. Run the migration in Supabase SQL Editor.
2. `supabase functions deploy calendly-webhook --no-verify-jwt`
3. Create a Calendly webhook subscription (requires a paid Calendly plan + personal access token), organization scope, events `invitee.created` and `invitee.canceled`, URL `https://pmjwwktwlsqpetwfvolb.supabase.co/functions/v1/calendly-webhook`. The response includes no signing key unless you pass `"signing_key"` in the request body; choose a random one.
4. `supabase secrets set CALENDLY_WEBHOOK_SIGNING_KEY=<that key>`; optionally `CALENDLY_CONSULT_EVENT_TYPE_URI=<event type URI>` (otherwise event name must match "free consultation").
Never commit these values.

## Not done / notes
- Existing `students`/`consult_intakes` statuses are never changed; completed consultations live in `consultations` linked by `student_id`/`consult_intake_id`. Not yet surfaced inside other profile pages.
- Not tested against live Supabase/Calendly.
