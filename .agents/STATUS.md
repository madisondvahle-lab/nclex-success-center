# Current Project Status

Last reviewed: August 2026

This file describes the current intended state. When it conflicts with historical commits, legacy files, or an older curriculum catalog, use this file unless the task explicitly says otherwise.

## Current curriculum

| Module | Topic | Current status |
|---|---|---|
| M1 | Newborn Care | Live/current |
| M2 | Maternal & OB | Live/current |
| M3 | Pharmacology | Secure recovery technically prepared; activation blocked by manual Supabase migrations/testing; new assignment remains disabled |
| M4 | Cardiac | Secure recovery technically prepared; activation blocked by shared `module_results` migration/testing |
| M5 | Respiratory | Secure recovery technically prepared; activation blocked by shared `module_results` migration/testing |
| M6 | Endocrine | Current curriculum direction; authoritative implementation content is not present in this repo yet |
| M7+ | TBD | Do not infer numbering from the historical catalog |

### Historical curriculum warning
Previous repository versions assigned M6 to Fluids & Electrolytes and M10 to Endocrine. That historical numbering is not the current curriculum authority. Do not restore or renumber the curriculum without explicit approval.

Historical M3-M5 guide content was selectively recovered from verified repository history and technically adapted on draft recovery branches. Historical M6 Fluids/Electrolytes remains archive material only and must not overwrite current M6 Endocrine.

## Module recovery checkpoints

### M3 Pharmacology — draft PR #19
- Historical source recovered from verified commit history.
- Secure launcher requires current Supabase Auth and verifies M3 assignment.
- Prior-student identifiers, `mailto:`, legacy `quiz_results`, and old hub/module navigation were removed from the recovered source.
- Practice results are designed to save through the authenticated student's RLS-protected `module_results` record.
- New M3 assignment remains intentionally disabled.
- Manual blockers: run/verify `supabase-module3-safe-placeholder-migration.sql`, run/verify `supabase-module-results-migration.sql`, then complete authenticated end-to-end result testing before restoring catalog/assignment access.

### M4 Cardiac — draft PR #21
- Historical source recovered and technically sanitized.
- Secure launcher requires current Supabase Auth and verifies M4 assignment.
- Legacy prior-student result/email behavior and navigation were removed.
- Clinical PQ/QQ banks remain locked and are guarded by recovery validation.
- Manual blocker: `supabase-module-results-migration.sql` must be run/verified, followed by authenticated end-to-end result testing before activation.

### M5 Respiratory — draft PR #22
- Historical source recovered and technically sanitized.
- Secure launcher requires current Supabase Auth and verifies M5 assignment.
- Legacy prior-student result/email behavior and navigation were removed.
- Clinical PQ/QQ banks remain locked and are guarded by recovery validation.
- Manual blocker: `supabase-module-results-migration.sql` must be run/verified, followed by authenticated end-to-end result testing before activation.

### M6 Endocrine
- Current M6 is Endocrine.
- No authoritative Endocrine implementation commit or PR exists in this repository.
- Do not invent clinical content from memory and do not restore historical Fluids/Electrolytes as M6.
- Build work waits for the approved current Endocrine source content.

## Known issues
- A prior M3 catalog entry used the internal `question-bank.html` tool as both guide and quiz. `supabase-module3-safe-placeholder-migration.sql` is the approved cleanup path for those URLs while preserving existing access rows.
- Public blog content belongs in `study-with-madison-site`; the accidental Success Center blog copy has been removed.
- M3-M5 recovery PRs must remain draft/unmerged until their documented manual database prerequisites and authenticated student-flow validation are complete.

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
Complete the documented manual Supabase prerequisites and authenticated validation for M3-M5 before activating those modules. M6 Endocrine remains blocked pending approved current source content.