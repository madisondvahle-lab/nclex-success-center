# Prospect follow-up visibility

Apply `supabase-prospect-visibility-migration.sql` before deploying the admin UI.
It adds nullable `consult_intakes.prospect_hidden_at` without changing existing
rows, permissions, or RLS. Existing admin-only intake update policies apply.

Admin home consult intakes have **Hide from Prospects** for inactive follow-ups.
This sets only the visibility timestamp, not intake status, student lifecycle,
email, portal access, or related history. **Show hidden prospects instead**
reveals hidden profiles with **Restore to Prospects**. Restored profiles remain
subject to the existing active-student filters. Merge options retain all intake
profiles, including hidden ones. Readiness leads are unchanged.

Deployment remains GitHub Pages from `main` and repository root at
`portal.studywithmadison.com`.

Migration applied live October 14, 2026. The requested inactive follow-up was
hidden by setting only the visibility timestamp; transaction checks verified
other intake fields (except any automatic update timestamp) and the complete
linked student row remained unchanged. The UI must deploy before the flag
affects the live list.

Focused validation: `node --test tests/admin-prospects.test.cjs` (6 tests).
