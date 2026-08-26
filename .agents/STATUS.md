# Current Project Status

Last reviewed: August 26, 2026

This file describes the current intended state of the NCLEX Success Center.
When it conflicts with historical commits, legacy files, or an older curriculum catalog, use this file unless the task explicitly says otherwise.

## Current curriculum

| Module | Topic | Current status |
| ------ | ----- | -------------- |
| M1 | Newborn Care | Current implementation present |
| M2 | Maternal & OB | Current implementation present |
| M3 | Pharmacology | Current guide implementation present |
| M4 | Cardiac | Current guide implementation present |
| M5 | Respiratory | Current guide implementation present |
| M6 | Endocrine | Current guide implementation present |
| M7 | EKG / Rhythm Recognition | Current implementation present in `module7-ekg.html` |
| M8+ | TBD | Do not infer future numbering without explicit approval |

## Current module files

Authoritative current module files presently include:

- `module1-newborn.html`
- `module1-guide.html`
- `module2-maternal.html`
- `module2-guide.html`
- `module2-studyguide.html`
- `module3-guide.html`
- `module4-guide.html`
- `module5-guide.html`
- `module6-guide.html`
- `module7-ekg.html`

Supporting infographic and asset files may also exist.

Files with names such as `.pre-*`, backups, historical copies, or archived recovery files are not automatically authoritative. Inspect the current implementation before making changes.

## Module 7 — EKG / Rhythm Recognition

M7 is now assigned to EKG / Rhythm Recognition.

Current implementation:

- Primary file: `module7-ekg.html`
- EKG asset directory: `assets/ekg/`
- A pre-strip backup may exist as `module7-ekg.pre-strips.html`
- Do not rename or renumber M7 without explicit approval.
- Preserve the established Success Center module design and navigation patterns.
- Clinical EKG content changes must follow `.agents/CLINICAL-STANDARDS.md`.

## Historical curriculum warning

Previous repository versions used different module numbering, including Fluids & Electrolytes as M6 and Endocrine at a later module number.

Those historical assignments are NOT current curriculum authority.

Current numbering is:

M1 Newborn  
M2 Maternal & OB  
M3 Pharmacology  
M4 Cardiac  
M5 Respiratory  
M6 Endocrine  
M7 EKG / Rhythm Recognition

Do not restore historical numbering unless explicitly instructed.

## M3-M5 recovery history

M3-M5 were previously recovered and sanitized from verified repository history.

Older task files and draft PR notes may describe activation blockers that were accurate during the recovery phase. Treat those documents as historical context unless the current repository, Supabase state, or an active handoff confirms the blocker still exists.

Do not undo current working implementations merely to match an older recovery document.

## Known implementation considerations

- `supabase-module3-safe-placeholder-migration.sql` exists from the M3 recovery/assignment cleanup work.
- `supabase-core-rn-module-catalog.sql` exists and may affect module catalog state.
- Student module access is driven through Supabase and `student_module_access`.
- Guide presence on disk does not by itself prove every quiz, catalog entry, or student assignment path is enabled.
- Inspect the current code and Supabase state before changing access behavior.
- Do not use old recovery notes as proof that a current module is disabled.
- Do not expose internal admin tools as student-facing guide or quiz URLs.

## Current architecture snapshot

### Student access

The current architecture uses Supabase Auth, authenticated student-specific access, and Row Level Security.

Legacy browser PIN systems and historical public hub implementations are not authoritative.

### Module availability

Student module access is driven through the Supabase module catalog and `student_module_access`.

Do not assume a historical static module array or old SQL migration represents the live state.

Before changing assignment behavior, inspect:

1. Current module catalog configuration
2. `student_module_access`
3. Current assignment UI/code
4. Existing Supabase/RLS behavior

### Diagnostic / CAT

The repository contains an adaptive NCLEX-style readiness/CAT system with a large question bank, core-safety blueprint logic, mock CAT behavior, and assessment-history personalization.

It is an educational readiness tool, not the official NCLEX CAT.

### Admin

Admin functionality is distributed across secure tools for assignments, assessment history, shared progress, student management, and question-bank review.

Do not assume one historical admin HTML file represents the complete current admin system.

## Clinical content

Before changing:

- nursing facts
- NCLEX teaching
- questions
- answer choices
- rationales
- EKG interpretation
- medication guidance
- priority/delegation logic

read `.agents/CLINICAL-STANDARDS.md`.

Technical work does not authorize clinical rewriting.

## Multi-agent coordination

Multiple AI agents may work on this repository concurrently.

Before starting substantial work:

1. Read `AGENTS.md`.
2. Read this file.
3. Read `.agents/PROJECT.md` when architecture is relevant.
4. Read `.agents/CLINICAL-STANDARDS.md` for clinical work.
5. Inspect `.agents/tasks/` for an active handoff.
6. Inspect current repository files before editing.
7. Keep the task tightly scoped.
8. Do not modify another agent's active work unless the task requires it.

For substantial work, create or update a task handoff in `.agents/tasks/`.

## Current priority

Continue building and refining the current Success Center without regressing existing modules.

Immediate work should use the current M1-M7 curriculum as authoritative.

M7 is EKG / Rhythm Recognition.

Future modules M8+ remain unassigned until explicitly defined.
