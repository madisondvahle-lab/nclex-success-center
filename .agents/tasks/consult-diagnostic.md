# Consult diagnostic (tutor tool)

Status: built, smoke-tested in jsdom with a stubbed admin gate; not yet viewed in a real browser or deployed.

Files: `madison-diagnostic.html` (admin-gated page, start screen, results), `exam-ui.css` + `exam-ui.js` (reusable NCLEX-style exam engine: right-click strikethrough, Notes/Calculator/Feedback, NGN case tabs, matrix/cloze/highlight/SATA/fill), `consult-diagnostic-bank.js` (30 original items: 24 standalone + 6-item heart-failure case; each tagged category/topic/pattern/difficulty/rationale).

Facts:
- Items are original, modeled on the style of the user's screenshots; none copied.
- Question count 10/15/20/25/30 is selectable (case study included at 20+, topics balanced).
- Optional save: pick a consultation, then 'Save to student profile' writes to `consult_diagnostic_results` (admin-only RLS). REQUIRES running `supabase-consult-diagnostic-migration.sql` first. With no consultation selected nothing is stored.
- Not yet surfaced on shared-progress.html (student profile view); saved results show on the diagnostic page per consult. Follow-up.
- Bank is a public static JS file, so answer keys are visible in source (same as existing banks).
- Results are discussion prompts, not an NCLEX score or pass prediction.
- Arial in exam-ui.css is intentional to match the testing interface.
- Follow-up: restyle the rest of the platform (diagnostic.html and module quizzes) onto exam-ui.css/js incrementally. Not done.
- Clinical content should get tutor review before real consults.
