# NCLEX Success Center: AI Agent Instructions

Read this file before making changes.

## Project purpose
This repository contains the private NCLEX Success Center used for student assessment, individualized remediation, learning modules, practice questions, CAT/readiness testing, progress tracking, and tutor administration.

This is NOT the public Study With Madison marketing website.

Public website, blog, services, SEO, marketing content, and public-facing business pages belong in the separate repository `madisondvahle-lab/study-with-madison-site`.

## Before working
1. Read `.agents/STATUS.md`.
2. Read `.agents/PROJECT.md` when architecture is relevant.
3. Read `.agents/CLINICAL-STANDARDS.md` before changing clinical or NCLEX content.
4. Check `.agents/tasks/` for an active handoff when continuing prior work.
5. Inspect current files before relying on historical commits.

## Critical rules
- Do not renumber, rename, or reorganize curriculum modules without explicit approval.
- Do not alter clinical wording, answers, rationales, clinical facts, or question IDs unless the task specifically authorizes clinical-content changes.
- A technical, UI, security, or refactoring task does not authorize clinical-content edits.
- Do not treat an empty GitHub code-search result as proof that a file does not exist when repository indexing is unavailable.
- Do not replace functional module content with redirects merely to enforce authentication.
- Do not expose student information or weaken Supabase authentication, RLS, or private storage controls.
- Do not create public marketing or blog content in this repository.
- Do not duplicate functionality that already exists elsewhere in the project.
- Keep changes tightly scoped to the requested task.
- Prefer modifying the current architecture over introducing a second competing system.

## Current curriculum authority
`.agents/STATUS.md` is the source of truth for current module numbering and implementation status.

Historical commits may contain recoverable content but are NOT authoritative for current curriculum numbering or current security architecture.

## Handoff
For substantial unfinished work, create or update the appropriate file in `.agents/tasks/` so another AI or human can continue without reconstructing the project from scratch.
