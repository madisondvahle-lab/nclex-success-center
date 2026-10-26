# Calendly free-consultation workflow

## Findings (before this work)
- Calendly was only a booking link (`free-readiness-check.html`). No webhook, API call, or table existed.
- "Prospective students" = `consult_intakes` rows (`student_id` null until converted); active students = `students`. Notes: `session_notes`/`consult_intakes` fields. Admin auth = `app_admins` + `is_app_admin()` RLS.

## Added
- `supabase-calendly-consultations-migration.sql`: `consultations`, `consultation_events` (append-only history), `calendly_webhook_receipts`, admin-only RLS, and service-role-only `process_calendly_event()` (email match: students -> consult_intakes -> create prospect; reschedule/cancel handling; advisory lock prevents duplicates).
- `supabase/functions/calendly-webhook`: verifies Calendly HMAC signature, filters to the free consultation, calls the function.
- `madison-consultations.html`: admin-only list, Start Consultation, template, autosave, optional timer, follow-up email draft. Linked from admin nav.

## No Show status (pending approval; not deployed)
- Apply `supabase-consultation-no-show-migration.sql` after the existing strategy-followup migration and before publishing the updated consultation page. It extends the existing status check and atomically logs No Show changes/corrections in `consultation_events`; no existing rows or RLS policies are changed.
- Open a scheduled consultation with **View / mark No Show**, then **Mark No Show**. In-progress or previously completed consultations can also be corrected to No Show. No-shows remain in past consultation history with a distinct amber label and read-only notes.
- Open a No Show record to correct it to Scheduled, In progress, or Completed. Restarting a corrected scheduled consultation preserves its existing template. Compare-and-set updates reject stale status changes.
- No-shows have no `completed_at` and are not `completed`; they do not count as completed consultations or tutoring sessions. Existing scheduled-only calendar/count queries and tutoring availability filters exclude them. Preview email status filters already exclude them; the migration also prevents live follow-up/reminder claims for No Show records, even if an initial email was sent before correction. No Edge Function deployment is needed. Separate student/package/session-note records are not modified.
- No production migration, deployment, or data correction is authorized by this change.

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

## Admin appointment calendar and tutoring sessions (in progress)
- `madison-admin.html` now has a monthly Calendly appointments grid, with initial consults, strategy sessions, and tutoring sessions distinguished by type. Each day opens an agenda; linked students open their progress profile, while unlinked prospects open their consultation record.
- The student dashboard calendar is now directly below the shared portal header, before either NCLEX or nursing dashboard content. The student-safe RPC excludes initial free consultations.
- `supabase-admin-appointment-calendar-migration.sql` must be applied after the strategy-session and student-calendar migrations. It allows `tutoring_session` and updates the RPC while preserving its authenticated, student-scoped return fields.
- The webhook accepts tutoring bookings when `CALENDLY_TUTORING_EVENT_TYPE_URI` exactly matches the event URI or the verified Calendly event name is exactly `60-Min Single Tutoring Session` / `Legacy Student | 60-Min Tutoring`. `NCLEX Strategy Consult Session` is also mapped by exact event name; `Free Consultation` matches the existing constrained free-consult name fallback. These precise name mappings avoid needing to retrieve the internal URIs for the displayed event types.
- Existing Calendly subscriptions must include `invitee.created` and `invitee.canceled` for the tutoring event type. Existing bookings are not backfilled automatically.
- `import-calendly-appointments` and the Admin "Import upcoming meetings" action provide an admin-only backfill for supported active bookings in the next 62 days. After merging, deploy that Edge Function with JWT verification enabled and set the `CALENDLY_API_TOKEN` Function secret. Never request the token in chat. The Admin action imports exact recognized event names, skips scheduled rows already present, and uses the existing webhook processing RPC to preserve profile matching and idempotence.
- `madison-tutoring-sessions.html` exposes private session-specific notes for future and in-progress tutoring appointments, including those linked to existing student profiles. The separate page keeps tutoring distinct from consultations. Notes are stored in the existing admin-only `consultations.template` JSON; no migration is required. The new notes view does not include existing past appointments.

## Booking/profile display correction (local, not deployed)
- Consultations now includes only free/strategy bookings without either a direct student link or a current student link through the associated intake. A booking created before intake conversion no longer makes that student appear to be a prospect. This matches the existing student-calendar RPC's intake-link fallback.
- Admin calendar links and the directory's upcoming-booking filter also use the current intake link. Tutoring calendar entries open that appointment's session notes; older consultation URLs for tutoring redirect there. Unavailable/past session deep links display an explicit notice rather than opening a consultation template.
- Every appointment, note, cancellation, and booking history remains separate and unchanged. No authentication, portal-stage, database-record, schema, or webhook changes are included.
- This does not repair incorrect stored event types or missing profile links; those require authorized inspection of live records. Email differences and duplicate student accounts are not automatically merged.
- Deployment pending: publish the three changed admin HTML pages through the existing GitHub Pages/main workflow. No SQL migration or Edge Function deployment is needed.
- Validation: all 28 focused tests passed with `node --test tests/consultations-list.test.cjs tests/admin-appointment-calendar.test.cjs tests/admin-prospects.test.cjs tests/study-calendar.test.cjs`; coverage includes converted-intake links, tutoring routing/deep links, preserved separate appointments, failed loads, and existing student-calendar access constraints. Live student records and browser behavior against Supabase have not been verified.

## Automatic Strategy Session follow-ups (added)
- Migration `supabase-strategy-followup-migration.sql` (applied): `followup_settings` (mode off/preview/live, preview email, private package links), credit columns on `consultations`, and service-role-only `claim_followup` / `release_followup` (atomic claim prevents double sends).
- `supabase-strategy-followup-cron.sql` (applied): pg_cron every 15 min calls the `send-strategy-followups` Edge Function with `x-cron-secret` read from Vault (`followup_cron_secret`, matches the `CRON_SECRET` function secret).
- Function sends via Resend from support@studywithmadison.com: one follow-up ~10 min after the session ends (only sessions ending within 3 days and after the mode was enabled), one reminder after 5 days, credits expire after 7 days. Preview mode sends only to the preview email. Live mode requires at least one package link.
- Requires function secret `RESEND_API_KEY` (not yet set at time of writing). Without it the function skips sending.
- Admin UI is the "Automatic follow-ups" panel on `madison-consultations.html` (includes "Send me a test email"). Purchase detection is manual ("Mark package purchased").

- **Update:** credit is now handled by refund (Calendly cannot apply coupons to packages or duplicate packages easily). Emails state the $40 refund after a package purchase within 7 days; student replies and Madison refunds in Stripe. Private package links are no longer used. Public site note: study-with-madison-site PR 20.
