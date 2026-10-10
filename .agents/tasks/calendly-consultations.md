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

## Update: paid NCLEX Strategy Session ($40, 45 min)
- `supabase-strategy-session-migration.sql` adds `consultations.consult_type` ('free_consultation' | 'strategy_session') and replaces `process_calendly_event` (now takes `p_consult_type`). Applied to production.
- Webhook routes by event type URI: `CALENDLY_CONSULT_EVENT_TYPE_URI` (free) and `CALENDLY_STRATEGY_EVENT_TYPE_URI` (strategy). Both secrets set.
- Strategy template (reports reviewed, patterns, checklist, recommendation, package credit within 7 days) is a first draft based on the public page bullets; adjust as Madison prefers.
- Public site price/length updated in study-with-madison-site PR 19 ($40, 45 min).

## Automatic Strategy Session follow-ups (added)
- Migration `supabase-strategy-followup-migration.sql` (applied): `followup_settings` (mode off/preview/live, preview email, private package links), credit columns on `consultations`, and service-role-only `claim_followup` / `release_followup` (atomic claim prevents double sends).
- `supabase-strategy-followup-cron.sql` (applied): pg_cron every 15 min calls the `send-strategy-followups` Edge Function with `x-cron-secret` read from Vault (`followup_cron_secret`, matches the `CRON_SECRET` function secret).
- Function sends via Resend from support@studywithmadison.com: one follow-up ~10 min after the session ends (only sessions ending within 3 days and after the mode was enabled), one reminder after 5 days, credits expire after 7 days. Preview mode sends only to the preview email. Live mode requires at least one package link.
- Requires function secret `RESEND_API_KEY` (not yet set at time of writing). Without it the function skips sending.
- Admin UI is the "Automatic follow-ups" panel on `madison-consultations.html` (includes "Send me a test email"). Purchase detection is manual ("Mark package purchased").
