# AI / Human Task Handoff: Weekly study plans & retargeting workflow

## Task
Madison's goal (verbatim): "assign people targeted practice questions to all of my students in the respective question banks/platforms … reminded of their weekly CAT exams … 50 questions/day (categories specific to each) for 3 days a week and then 2 CAT exams (spaced out)/week. Then I want to analyze them and retarget each time … make it manageable."

Agreed 4-step plan:
1. **Weekly plan template + per-student focus categories** — DONE (this handoff).
2. Assignment of targeted practice across platforms (UWorld/Archer/portal Question Bank).
3. Student reminders on dashboard (email later).
4. Weekly admin review / retarget queue.

## Clinical-content authorization
- [x] Clinical content is locked. Steps 1–4 are workflow/UI work; do not change questions, answers, rationales, or activate questions.

## Step 1 — what exists now
- **Data:** `supabase-weekly-study-plan-migration.sql` extends the existing `student_study_plans` table (already used by the student dashboard roadmap; RLS: admins manage, students read own) instead of a new table. New columns: `practice_days text[]` (default mon/wed/fri), `practice_questions_per_day` (50, 1–300), `practice_platform` ('UWorld'), `cat_days text[]` (tue/sat), `cat_platform` ('UWorld'), `focus_categories text[]` (canonical NCLEX Client Needs names from `category-names.js`), `focus_topics text[]` (free text: systems/subjects), `plan_notes`, `focus_updated_at` (set when focus changes; use for retarget tracking), `created_at`. Unique index on `student_id` (one current plan per student; the coach page upserts on it). Day CHECKs + `REVOKE ALL … FROM anon`.
- **Applied to live Supabase** (pmjwwktwlsqpetwfvolb) on 2026-10-14 and RLS verified with rolled-back impersonation: student sees only own row and cannot insert; anon is denied; admin upsert works.
- **Coach page:** `madison-study-plans.html` (sidebar "Weekly plans" on all admin pages; `?student=<id>` opens the editor; Student workspace sidebar link carries the selected student). Roster of active NCLEX students (nursing students excluded) with plan summary, focus chips, updated/focus-updated dates, "Apply default" per student and a bulk "Give the default to N students without a plan". Editor warns when CAT days are back-to-back, overlap practice days, or there are fewer than 3 practice days without a CAT (`WeeklyPlan.meetsPracticeMinimum`); the roster flags such students. Days are fully per-student, including weekends.
- **Shared helper:** `weekly-plan.js` (`WeeklyPlan.DEFAULTS`, `normalize`, `week`, `summary`, `catSpacingOk`, `PLATFORMS`). Defaults live here and as SQL column defaults — keep them in sync.
- **Student view:** `student-dashboard.html` NCLEX view shows a read-only "My weekly study plan" card (7-day strip, focus chips, note) only when a plan row exists.
- **Tests:** `tests/weekly-plan.test.cjs` (`node --test tests/*.cjs`).

## Remaining work
### Step 2 — targeted practice assignment
- For `practice_platform = 'Portal Question Bank'`: generate links like `supplemental-practice.html?mixed=<n>&cat=<focus category>` (already supported) per practice day, or create `student_resources` rows (`resource_type='practice_set'`) with `due_on` per practice date. Reuse `madison-assignments.html` patterns; don't create a parallel assignment table.
- For external platforms (UWorld/Archer): the portal can't push into their QBanks; produce a per-day instruction (e.g. "UWorld: 50 Qs, Subjects: X/Y, tutor mode off") from `focus_categories`/`focus_topics`, optionally as `student_resources` link items, and let the student mark complete.
- Note: dashboard "This week" card still uses a hard-coded portal-only 50-question weekly goal (`renderThisWeek`, `GOAL = 50`); reconcile with the plan once step 2 defines completion tracking.

### Step 3 — reminders (dashboard first, email later)
- Use `WeeklyPlan.week()` + today's weekday to show "Today: 50 UWorld questions" / "CAT exam today/tomorrow" on the dashboard. Email can later reuse the `send-strategy-followups` Edge Function + cron pattern (`supabase-strategy-followup-cron.sql`).

### Step 4 — weekly review / retarget queue
- Admin list sorted by stale `focus_updated_at` vs latest CAT (`student_assessment_uploads`/`external_assessments` category scores) so Madison sees who needs retargeting; suggest the lowest categories as new focus and save via the existing editor. If plan history is needed, add an append-only history table (RLS admin-only) rather than multiple current rows.

## Deployment
GitHub Pages from `main` (portal.studywithmadison.com). No Netlify/Cloudflare.
