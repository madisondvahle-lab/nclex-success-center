# Consult diagnostic (tutor tool)

Status: built, smoke-tested in jsdom with a stubbed admin gate; not yet viewed in a real browser or deployed.

Files: `madison-diagnostic.html` (admin-gated page, start screen, results), `exam-ui.css` + `exam-ui.js` (reusable NCLEX-style exam engine: right-click strikethrough, Notes/Calculator/Feedback, NGN case tabs, matrix/cloze/highlight/SATA/fill), `consult-diagnostic-bank.js` (30 original items: 24 standalone + 6-item heart-failure case; each tagged category/topic/pattern/difficulty/rationale).

Facts:
- Items are original, modeled on the style of the user's screenshots; none copied.
- Results exist only in page memory. No Supabase writes. Tutor can copy a summary.
- Bank is a public static JS file, so answer keys are visible in source (same as existing banks).
- Results are discussion prompts, not an NCLEX score or pass prediction.
- Arial in exam-ui.css is intentional to match the testing interface.
- Follow-up: restyle the rest of the platform (diagnostic.html and module quizzes) onto exam-ui.css/js incrementally. Not done.
- Clinical content should get tutor review before real consults.
