# NCLEX Success Center Project Context

## Repository boundary
This repository is the private/student-facing NCLEX Success Center and its tutor/admin tooling.

The separate repository `madisondvahle-lab/study-with-madison-site` is the public Study With Madison RN website.

### Belongs here
- student authentication and private dashboards
- NCLEX modules and student practice
- diagnostic/readiness assessments and mock CAT functionality
- question-bank and NGN content infrastructure
- student module assignments
- assessment history and personalization
- shared student/tutor progress tools
- secure tutor/admin tools
- Supabase data/security supporting these functions

### Does not belong here
- public business landing pages
- general tutoring marketing
- public blog posts
- SEO-focused business content
- public package/service marketing

Those belong in `study-with-madison-site`.

## Authentication and privacy
Current secure architecture takes precedence over legacy implementations.

Do not:
- restore browser-only PIN authentication as the security model
- disable Row Level Security
- expose private Supabase storage
- put student data into public files
- hard-code individual student credentials
- bypass authentication simply to make a page easier to access

Historical implementations may be inspected for recoverable UI or educational content, but obsolete security patterns must not be restored.

## Supabase
The repository contains multiple migrations representing project evolution. Do not assume `supabase-schema.sql` alone represents the current database.

Before changing database behavior:
1. inspect relevant current migrations and current application usage
2. identify affected tables, functions, storage, and policies
3. preserve authentication and RLS protections
4. document any manual Supabase step required after deployment

Never silently assume a migration has already been run in the deployed Supabase project.

## Student learning architecture
Keep these concepts separate:

- **Guide:** educational/remediation content.
- **Quiz:** student module assessment or practice experience.
- **CAT/diagnostic:** adaptive readiness assessment.
- **Question Bank Manager:** internal tutor/admin tooling for reviewing/managing questions.

An internal question-bank management page must never be used as a student quiz.

Do not replace substantive module content with a login redirect merely because the content requires authentication. Preserve the module and protect access at the appropriate session/routing layer.

## Curriculum
Use `.agents/STATUS.md` as the current curriculum authority.

The repository contains an older 21-module curriculum map. It is historical reference, not permission to restore old numbering. In particular, historical M6 Fluids & Electrolytes / M10 Endocrine numbering conflicts with the current curriculum direction.

## Diagnostic and question bank
The diagnostic/CAT system has evolved through multiple iterations and currently uses a larger question bank, core-safety coverage, adaptive behavior, mock CAT functionality, and assessment-history personalization.

When changing CAT mechanics, preserve clinical content unless clinical edits are explicitly authorized. When changing clinical content, follow `.agents/CLINICAL-STANDARDS.md`.

## Admin architecture
Do not assume one legacy admin page contains all current functionality. Current admin/tutor workflows are distributed across secure tools including student/module assignments, assessment history, progress/report tooling, and question-bank review.

Inspect the current implementation before adding a new admin workflow so existing functionality is not duplicated.

## Historical recovery
Git history contains useful earlier module content and UI implementations.

Historical content may be selectively recovered when useful, but do not:
- restore an entire historical file without reviewing it
- restore obsolete authentication/security
- restore obsolete curriculum numbering
- overwrite newer content with an older version
- assume a historical file is compatible with current Supabase behavior

## GitHub search limitation
Repository code-search indexing may be unavailable. An empty search result is therefore not sufficient evidence that a file, phrase, or implementation does not exist. Use direct file inspection, repository structure, commits, and PR history as needed.

## Change strategy
For substantial work:
1. establish the exact scope
2. inspect current relevant files
3. check STATUS and applicable standards
4. make the smallest coherent change
5. validate behavior
6. record manual deployment/database steps
7. leave a handoff when work is incomplete
