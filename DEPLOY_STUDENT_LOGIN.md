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

The function verifies the signed-in caller itself and then checks the `app_admins` table before it creates an Auth user. The `--no-verify-jwt` setting is only used so CORS preflight requests can reach the function; the function rejects any non-admin request.

## Day-to-day use

1. Save a consult intake.
2. Choose **Add as student** and set a temporary 4-digit profile PIN.
3. Choose **Create login access**.
4. Set an 8+ character temporary password.
5. Send the student the portal link, their email, and temporary password.

No UUID copying or SQL is required for routine onboarding.
