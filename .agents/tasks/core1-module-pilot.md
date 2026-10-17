# Core 1 refresher integration

## User-approved direction

Build concise NCLEX refreshers for graduates, not a repeat of nursing school.
Preserve the existing cream/navy/rose identity and use purposeful premium
teaching graphics. Topics follow must-know content, recognition, action, and
common mistakes, with brief application examples where useful.

Core 1 is the only implementation scope. Preserve the five existing topic keys,
module numbering, existing questions/answers/rationales, and assignments.
Madison also requested a clearly named Precautions section with visual memory
aids and signed-in-only access as modules are built. Do not interpret this as
authorization for a library-wide migration.

## Current implementation

- `core-rn-pathway.html?module=core-safety-priority` mounts `core1-module.js`
  and `core1-module.css`. Other Core routes remain unchanged.
- The new renderer verifies the signed-in user and downloads a JSON lesson
  payload from private Supabase Storage. No lesson HTML or JSON is embedded
  in the public static page or committed assets.
- Payload strings are rendered as text, not injected HTML. Validation rejects
  incomplete or unexpected module/topic structures.
- Signed-out users go to `student-login.html`. Failures show explicit retry/help,
  not public fallback lessons. Sign-out clears lessons and invalidates pending
  responses; back/forward-cache restoration revalidates sign-in.
- The existing short practice set opens in a new tab so the module remains
  available. Do not claim comprehensive topic coverage or mastery.
- A responsive precautions comparison and expandable letter-by-letter memory
  aid are implemented. New clinical examples still require Madison's approval.

## Private artifacts

Clinical drafts are deliberately kept out of this repository handoff. They are
session artifacts under:

`/Users/mv/.copilot/session-state/0e3f37f9-3405-41ab-a737-7383bb785ee7/files/core1-preview/`

Files:

- `core-safety-priority.json`: actual lesson payload, including the new
  precautions comparison and qualified mnemonic examples; pending clinical
  approval.
- `review-notes.md`: original content draft, clinical source references, and
  review limitations.
- `index.html`: original visual prototype.
- `integration-preview.html`: actual renderer with clearly labeled local mock
  sign-in, never production credentials.

Preview URL:
`http://127.0.0.1:8766/integration-preview.html#infection-prevention`.
It uses integration JS/CSS from a separate worktree server on port 8767.
The preview is not evidence of live Supabase authorization.

Do not commit lesson payloads, content-review notes, or self-contained teaching
prototypes as public assets. Keep a private backup when transferring this work
to another session.

## Required release steps: NOT done

1. Madison reviews the rendered clinical content and mnemonic qualifications.
   The user approved the visual/refresher direction; do not infer approval of
   subsequently added clinical teaching.
2. Run `supabase-core1-private-lessons.sql` in Supabase after the module catalog
   and `is_app_admin()` prerequisites. It creates a private `module-lessons`
   bucket. Authenticated users may read only `core-safety-priority.json` while
   the module is available; admins manage files via `is_app_admin()`.
3. Upload the approved `core-safety-priority.json` to that bucket's root with
   exactly that filename, content type `application/json`, and cache control
   `0` where supported. Do not make the bucket public.
4. Verify live anonymous download denial, authenticated download/rendering,
   unavailable-module denial, and sign-out behavior. This session has NOT
   applied the migration or uploaded/tested live Storage.
5. Merge/deploy the integration only after provisioning and upload. Without
   the file, Core 1 deliberately shows an explicit unavailable state.

No deployment or merge has been performed for this pilot. Existing older
educational pages have not been migrated or certified as protected.

## Validation

`node --test tests/core1-module.test.cjs tests/core-rn-pathway.test.cjs tests/practice-question-selection.test.cjs`

Tests cover synthetic signed-in/out sessions, failed/retried loads, invalid
payloads, text-only rendering, sign-out races, browser-cache restoration, route
preservation, and storage-policy structure. The real private payload also
passes the renderer's schema validation. Desktop/mobile previews were inspected.

The pre-existing Inter-font detector finding in the shared Core overview is
outside this pilot's design scope; Core 1 uses the approved system/Georgia
typography. No detector waiver or unrelated font change was made.

Deployment remains GitHub Pages from `main`, repository root, at
`portal.studywithmadison.com`. No hosting migration is authorized.
