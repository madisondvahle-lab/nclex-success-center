# Current Project Status

Last reviewed: August 2026

This file describes the current intended state. When it conflicts with historical commits, legacy files, or an older curriculum catalog, use this file unless the task explicitly says otherwise.

## Current curriculum

| Module | Topic | Current status |
|---|---|---|
| M1 | Newborn Care | Live/current |
| M2 | Maternal & OB | Live/current |
| M3 | Pharmacology | Content developed; student quiz/wiring incomplete |
| M4 | Cardiac | Content developed; implementation incomplete |
| M5 | Respiratory | Content developed; implementation incomplete |
| M6 | Endocrine | Current curriculum direction; implementation incomplete |
| M7+ | TBD | Do not infer numbering from the historical catalog |

### Historical curriculum warning
Previous repository versions assigned M6 to Fluids & Electrolytes and M10 to Endocrine. That historical numbering is not the current curriculum authority. Do not restore or renumber the curriculum without explicit approval.

Historical M3-M6 guide content may be useful for selective recovery, but it must be reviewed against the current curriculum, current security architecture, and newer content before reuse.

## Known issues
- M3 assignment wiring currently points toward the internal question-bank manager rather than a finalized student quiz.
- Historical M3-M6 guide pages contained substantive module content, but current `main` versions were replaced with secure-login redirects during later security work.
- Historical M6 Fluids/Electrolytes content may be reusable later, but must not overwrite current M6 Endocrine work.
- An accidental public `blog.html` was added to this repository. Public blog content belongs in `study-with-madison-site`.
- The older AI collaboration PR #1 predates major architecture changes and should not be treated as current project documentation.

## Current architecture snapshot

### Student access
The current direction uses Supabase Auth, authenticated student-specific access, and Row Level Security. Legacy browser PIN or public hub implementations are historical only.

### Module availability
Student module access is driven through the Supabase module catalog and `student_module_access`. Do not assume a static historical module array is authoritative.

### Diagnostic / CAT
The repository contains an adaptive NCLEX-style readiness/CAT system with a 150-question bank, core-safety blueprint logic, mock CAT behavior, and assessment-history personalization. It is an educational readiness tool, not the official NCLEX CAT.

### Admin
Admin functionality is distributed across secure tools for assignments, assessment history, shared progress, student management, and question-bank review. Do not assume `madison-admin.html` is a complete current admin application.

## Current priority
Stabilize project architecture, documentation, module mapping, and safe AI collaboration before large-scale module expansion.
