# One-time setup: Create student login access

This feature lets Madison create and connect a new student's portal login from the private dashboard. It uses a protected Supabase Edge Function, so the service-role key never appears in GitHub Pages.

## Deploy once

1. Install the Supabase CLI if needed:

   ```zsh
   brew install supabase/tap/supabase
   ```

2. Sign in and link this project:

   ```zsh
   supabase login
   supabase link --project-ref pmjwwktwlsqpetwfvolb
   ```

3. Deploy the protected function from the repository folder:

   ```zsh
   supabase functions deploy create-student-login --no-verify-jwt
   ```

Preserve the deployed `--no-verify-jwt` configuration for this workflow. This
disables only the gateway's additional JWT check: the function still requires a
Bearer token, validates it with Supabase Auth using `auth.getUser()`, and checks
the verified user's membership in `app_admins` before accessing student records
or creating an Auth user. Never remove or bypass these checks.

The original setup cited CORS preflight as the reason for this setting. Isolated
testing in October 2026 passed preflight and authenticated onboarding with both
gateway settings, so that historical explanation is not evidence that disabling
the gateway check is currently necessary. Keep the production setting unchanged
unless a separately reviewed compatibility change requires it. See the
[onboarding deployment handoff](.agents/tasks/student-lifecycle-management.md)
for the migration order, invitation-status behavior, and latest verification.

## Day-to-day use

1. Save a consult intake.
2. Choose **Add as student** and set a temporary 4-digit profile PIN.
3. Choose **Create login access**.
4. When prompted, create an 8+ character temporary portal password. Do not use the four-digit profile PIN.
5. Send the student the portal link, their email, and temporary portal password.

No UUID copying or SQL is required for routine onboarding.
