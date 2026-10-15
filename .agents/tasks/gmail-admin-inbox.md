# Admin Gmail attachment inbox

## Purpose
Show unread Gmail messages with attachments in the private admin dashboard so the tutor can catch student CAT/CPR reports before a session.

## Current implementation
- `madison-admin.html` shows the Gmail panel only after its existing Supabase admin check succeeds.
- `admin-gmail.js` requests Gmail read-only access in the browser, searches `is:unread has:attachment`, and allows downloading message attachments.
- The Google OAuth web client ID is configured in `admin-gmail.js`. It is public client configuration, not a secret.
- Email and attachment data are fetched directly from Google and are not written to Supabase, local storage, or the portal.
- Gmail authorization is held in memory only; reconnect after access expires or the page is reloaded. Messages remain unread in Gmail.
- OAuth client ID is intentionally not included yet. Until configured, the panel displays a setup message.

## Remaining setup and deployment
1. In Google Cloud Console, enable Gmail API and create a Google OAuth client for a web application.
2. Add `https://portal.studywithmadison.com` as an authorized JavaScript origin. For local testing, add the exact local origin used.
3. Configure the OAuth consent screen and add the tutor's Google account as a test user while the app is in testing.
4. Use the Gmail read-only scope `https://www.googleapis.com/auth/gmail.readonly`. Google may require verification before broad external use.
5. The OAuth client ID has been set in `CLIENT_ID` in `admin-gmail.js`. Never place a client secret in the repository.
6. Publish through GitHub Pages from `main` and test authorization, unread attachment listing, and download using an authorized admin account.

## Boundaries
- This feature does not mark messages read, send email, upload reports into student records, or automatically match email senders to student profiles.
- Only admins who explicitly connect a Google account in their browser can see that account's messages. No Gmail token or message contents are shared with other portal users.
- Deployment source of truth is GitHub Pages from `main` and repository root at `portal.studywithmadison.com`.
