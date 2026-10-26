# Consultation CPR reports

Status: implementation and synthetic validation in progress on
`feat/consultation-cpr-reports`. Migration preparation/testing approved by owner;
production application requires separate explicit approval. Not deployed.

## Scope and architecture

- Paid NCLEX Strategy Sessions remain consultations, alongside free consults.
  Their existing per-consultation diagnostic link remains unchanged.
- `madison-consultations.html` mounts `consult-cpr-reports.js` in the detail view,
  including scheduled consultations so reports can be prepared before meeting.
- Reuses `nclex_attempts.test_date`, `question_count`, and `notes`. One record per
  attempt; the existing CPR tracker sees the same fields and handles category
  ratings. No duplicated notes or new assessment system.
- Uploads PDF/PNG/JPEG/WebP (up to 20 MB/file) to the existing private
  `assessment-reports` bucket under `consults/<intake UUID>/...`.
  Metadata uses `consult_intake_files`. Open links expire after 10 minutes.
- A consultation must already have a linked intake. Missing links never cause
  automatic profile creation or reassignment.
- Existing unlinked CPR uploads are shown for explicit attempt association;
  no inferred matches, bulk backfill, or storage moves.
- Report edits use explicit save buttons. Unsaved report-detail text survives
  attachment uploads and in-panel refreshes. Save details before leaving the
  consultation or reloading the browser.
- Failed metadata insertion removes the new private object. A cleanup failure
  is reported with its path for admin recovery. Partial multi-file failures
  report the saved count and instruct selecting only remaining files.

## Migration approval gate

`supabase-consult-cpr-files.sql` adds nullable `attempt_id` to
`consult_intake_files`, a composite FK to the same intake's NCLEX attempt,
and supporting indexes. Existing rows remain unchanged with null links.
No policy, grant, bucket, clinical content, diagnostic, or student changes.

The FK is deferred until transaction commit to preserve the existing atomic
profile-merge sequence (attempts move before file metadata). Deleting an attempt
clears only its attachment link, preserving the file and intake metadata.

Before deploying:

1. Run unit, consultation regression, disposable PostgreSQL, and isolated browser
   tests. Review the PR and required checks.
2. Ask owner to approve applying this specific migration in production.
3. After approval, capture/read back existing metadata and attempt fingerprints
   and policies, apply only this migration, and confirm existing data unchanged.
4. Merge through the normal PR process and verify GitHub Pages serves the main
   branch/root release at `portal.studywithmadison.com`. Netlify/Cloudflare are
   not the production host.

## Validation

```sh
node --test tests/consult-cpr-reports.test.cjs tests/consult-cpr-files.integration.mjs tests/consultations-list.test.cjs tests/consultation-no-show.test.cjs
node --check consult-cpr-reports.js
git diff --check
```

The integration test uses and removes a disposable PostgreSQL 17 container;
it does not access production. Browser verification uses synthetic in-memory
Supabase/storage responses, never real client reports or records.
