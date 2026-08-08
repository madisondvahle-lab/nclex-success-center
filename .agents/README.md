# AI Collaboration Guide

This folder is the shared handoff point for AI-assisted work in this project.

## Operating rules

- Work only on the files named in the active task note.
- Check the current branch and working tree before editing; do not overwrite unrelated changes.
- Preserve NCLEX clinical wording, answer keys, rationales, question IDs, and ordering unless a task explicitly permits a content change.
- For question-bank changes, validate JavaScript syntax, unique IDs, object structure, and duplicate questions.
- For app changes, preserve the static HTML/Supabase architecture and validate every affected page before handoff.
- Record completed work and required manual steps in the task note.

## Shared task notes

Create one Markdown file per task under `.agents/tasks/`, named `YYYY-MM-DD-short-title.md`.
Use the template in `tasks/TEMPLATE.md`. One agent owns a task note at a time; other agents should add comments rather than edit the same implementation files concurrently.

## Source of truth

- GitHub is the shared source of truth. Work on a dedicated branch and use a pull request for review.
- Keep the local project checkout synchronized with GitHub before starting work.
- Supabase schema changes belong in `supabase-schema.sql`; document every required SQL Editor action in the task note.
- `madison-admin.html` manages students, modules, assignments, scores, and notes.
- Student hubs must remain compatible with the module catalog and module-access data model.
