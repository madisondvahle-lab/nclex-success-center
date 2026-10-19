# NCLEX Success Center: AI Agent Instructions

Read this file before making changes.

## Project Purpose

This repository contains the private NCLEX Success Center used for:
- Student assessment
- Individualized remediation
- Learning modules
- Practice questions
- CAT and readiness testing
- Student progress tracking
- Tutor administration

This is NOT the public Study With Madison marketing website.

Public website, blog, services, SEO, marketing content, and
public-facing business pages belong in the separate repository:

`madisondvahle-lab/study-with-madison-site`

## Before Working

1. Read `.agents/STATUS.md` when current project status is relevant.
2. Read `.agents/PROJECT.md` when architecture is relevant.
3. Read `.agents/CLINICAL-STANDARDS.md` before changing clinical
   or NCLEX content.
4. Check `.agents/tasks/` for an active handoff when continuing
   previous work.
5. Inspect current files before relying on historical commits.

Only load documentation relevant to the current task.

Avoid repeatedly reading unchanged files without a specific reason.

Do not conduct a broad repository investigation when a targeted
search will answer the question.

## Critical Project Rules

- Do not renumber, rename, or reorganize curriculum modules
  without explicit approval.
- Do not alter clinical wording, answers, rationales, clinical
  facts, or question IDs unless specifically authorized.
- Technical, UI, security, and refactoring tasks do not authorize
  clinical-content changes.
- Do not treat an empty GitHub code-search result as proof that
  a file does not exist when repository indexing is unavailable.
- Do not replace functional module content with redirects merely
  to enforce authentication.
- Do not expose student information or weaken Supabase
  authentication, RLS, or private storage controls.
- Do not create public marketing or blog content in this repository.
- Do not duplicate functionality that already exists.
- Keep changes tightly scoped to the requested task.
- Prefer modifying existing architecture over introducing
  competing systems.
- Preserve working functionality unless explicitly authorized
  to replace or remove it.

## AI Operating Philosophy

The project owner manages this platform primarily through
natural-language conversations with AI.

The owner is an experienced registered nurse and nursing educator,
not a software developer.

Communicate in clear, practical language without assuming
programming knowledge.

The owner's conversational communication style must not be
interpreted as unlimited authorization to perform additional work.

The goal is to maintain a clinically accurate, secure, functional,
high-quality platform while minimizing unnecessary AI processing,
development costs, and manual administrative work.

Prioritize completed, verified outcomes over lengthy explanations
of what could be done.

## Discussion vs. Execution

Always distinguish discussion, investigation, planning,
and implementation.

### Discussion Mode

When the owner asks questions such as:

- What do you think?
- What would you recommend?
- How could we improve this?
- What should we do next?
- Is there a better way?
- Would this work?
- Can we make this more efficient?

Treat these as requests for discussion and recommendations.

During discussion:

- Explain practical options.
- Recommend the most efficient approach.
- Identify meaningful consequences or limitations.
- Do not modify code, files, or database records.
- Do not initiate extensive repository searches.
- Do not automatically begin implementation.
- Do not create unnecessary plans or documentation.
- Keep responses concise, specific, and actionable.

### Read-Only Investigation

When asked whether a feature exists, how something currently
works, or why an issue occurs:

- Investigate only the relevant implementation.
- Do not treat investigation as authorization to modify code.
- Begin with targeted searches for relevant functions and files.
- Inspect only the files needed to answer the question.
- Do not run unrelated tests, builds, or database operations.
- Do not launch subagents.
- Report verified findings with file references.
- Distinguish confirmed behavior from assumptions.
- Identify what remains unverified.
- Stop once the investigation answers the question.

Do not automatically begin fixing issues discovered
during an investigation.

### Execution Mode

When the owner explicitly requests implementation using
instructions such as:

- Implement this.
- Fix this.
- Update these records.
- Create this feature.
- Apply these approved revisions.
- Run the audit.
- Proceed with the authorized batch.

Perform the authorized work.

During execution:

- Identify the exact scope.
- Use existing project architecture.
- Limit changes to authorized files or records.
- Avoid unrelated modifications.
- Reuse existing utilities and workflows.
- Perform necessary validation.
- Report what was actually completed.
- Stop when the task is finished.

An explicit request to proceed authorizes the previously
agreed scope only.

It does not automatically authorize additional batches,
publication, deployment, or unrelated changes.

Do not repeatedly request confirmation for clearly authorized,
low-risk actions.

Require explicit authorization for:

- Destructive operations
- Clinical publishing
- Substantial database changes
- Production deployment when not previously authorized
- Changes outside the agreed scope
- Additional paid services or credit-consuming workflows

## AI Cost Efficiency

AI processing, premium requests, tokens, and development
credits are limited resources.

Cost efficiency is a primary project requirement.

### Before Starting Substantial Work

1. Identify the requested outcome.
2. Determine whether existing functionality already accomplishes it.
3. Identify the smallest relevant scope.
4. Prefer deterministic scripts, SQL, or existing automation
   for repetitive operations.
5. Use AI reasoning only where it provides meaningful value.
6. Avoid expensive investigations when simpler verification
   is sufficient.

### Efficiency Rules

- Minimize unnecessary AI credit and token consumption.
- Prefer targeted searches over repository-wide investigations.
- Do not inspect unrelated files or subsystems.
- Do not launch subagents unless explicitly authorized.
- Do not perform broad audits unless explicitly requested.
- Avoid repeatedly reading unchanged documentation.
- Reuse previously approved work.
- Do not regenerate completed content unnecessarily.
- Avoid redundant web research.
- Avoid repeated tool calls without a clear purpose.
- Prefer targeted database queries with appropriate limits.
- Do not retrieve entire tables when a smaller query is sufficient.
- Avoid creating temporary files without a useful purpose.
- Do not reopen completed tasks without an identified reason.
- Do not automatically begin additional tasks or batches.
- Avoid unnecessarily large outputs.
- Prefer the smallest safe implementation.
- Stop when the requested outcome is achieved.

For large operations, assess whether a smaller screening step
could eliminate unnecessary work.

If the scope expands substantially beyond the original request,
explain the additional work before proceeding.

Never compromise clinical accuracy, data integrity, security,
or necessary testing merely to reduce AI costs.

These instructions guide efficient behavior but do not guarantee
a specific AI-credit cost.

### Agent and Tool Usage

- Do not automatically delegate work to additional agents.
- Do not launch parallel investigations unless explicitly requested.
- Do not use expensive models or premium tools unnecessarily.
- Do not repeatedly retry failed tool calls without identifying
  the cause of failure.
- Do not perform unrelated background investigations.
- Do not automatically continue after completing the requested work.
- Avoid tool calls whose results are unlikely to affect the outcome.
- Prefer existing project scripts over AI-generated repetitive work.

When a task can be accomplished without an AI agent,
prefer the simpler method.

### Conversation Context Management

Long AI conversations can increase context consumption
and trigger automatic compaction.

To reduce unnecessary processing:

- Prefer a fresh conversation for each distinct development task.
- Use project documentation to preserve continuity.
- Avoid carrying unrelated conversation history into new tasks.
- Do not repeatedly summarize or manually compact conversations
  when a new session would be more efficient.
- Do not invoke manual compaction without a clear need.
- Keep handoffs concise and limited to verified information.
- Avoid attaching entire repositories or large files when
  targeted excerpts are sufficient.
- Do not repeatedly load large documentation files without
  a specific reason.
- Preserve essential decisions in existing project documentation.
- Avoid generating lengthy progress reports after routine actions.

When approaching a context limit, prioritize preserving:

1. Current task and authorized scope
2. Verified findings
3. Files or records changed
4. Remaining work
5. Important blockers or risks

Do not preserve unnecessary conversation history.

Do not assume these instructions can disable automatic
compaction or override a provider's internal billing behavior.

## Question Bank Auditing

The purpose of auditing is to identify genuine quality,
clinical accuracy, and educational concerns.

Auditing does NOT automatically require rewriting.

A successful audit may result in zero revisions.

Before performing question-bank quality audits, read and follow:

`.agents/tasks/question-bank-audit.md`

This protocol governs screening, targeted revisions,
duplicate prevention, approval, and audit reporting.

### Screening Classification

Classify each evaluated question as:

**PASS**

Clinically accurate, appropriately challenging, with reasonable
distractors and a defensible answer key.

No revision necessary.

**MINOR**

Small wording, formatting, metadata, classification,
or clarity issue requiring limited correction.

**MAJOR**

Clinically inaccurate information, incorrect answer key,
unsafe recommendations, significant ambiguity, weak
distractors, or substantial rationale deficiencies.

**RETIRE**

Fundamentally unsuitable, irreparably flawed,
or unnecessarily redundant with existing content.

### Audit Requirements

- Evaluate questions before proposing revisions.
- Do not assume every question requires improvement.
- Leave passing questions unchanged.
- Do not create correction drafts for passing questions.
- Explain the specific deficiency before proposing changes.
- Preserve appropriate conceptual reinforcement across the bank.
- Distinguish intentional concept reinforcement from
  unnecessary duplication.
- Check existing revision drafts before generating new ones.
- Avoid reviewing the same question repeatedly without reason.
- Preserve correct clinical information and learning objectives.
- Use clinically appropriate distractors.
- Avoid making questions artificially difficult.
- Maintain difficulty appropriate for entry-level nursing practice.
- Verify clinical information against authoritative sources
  when necessary.
- Never assume an AI-generated answer key is correct.

For larger batches, complete a screening pass first.

Only generate full revisions for questions with identified
deficiencies.

Prioritize clinical safety and incorrect answer keys over
cosmetic wording improvements.

## Clinical Review and Approval

Clinical changes require appropriate review before application.

- Preserve original question content.
- Preserve question UUIDs and question numbers.
- Preserve student attempt history and assignments.
- Keep correct answers and corresponding rationales synchronized.
- Do not silently change answer keys.
- Document significant clinical corrections.
- Do not overwrite existing approved corrections.
- Do not apply clinical correction drafts without explicit approval.
- Do not automatically publish revised questions.
- Do not confuse approval of a draft with application to Supabase.
- Verify applied changes against the approved version.

When reporting clinical revision status, distinguish:

1. Screened
2. Revision proposed
3. Pending clinical review
4. Approved
5. Applied to Supabase
6. Published to students

Never report a question as updated or published unless the
corresponding operation has been completed and verified.

## Supabase and Database Safety

The NCLEX Success Center uses Supabase for question storage,
student data, and related application functionality.

Before modifying existing questions:

- Identify records using their existing UUIDs and question numbers.
- Check for existing revision drafts.
- Preserve original content and revision history.
- Preserve student attempts, assignments, and relationships.
- Avoid unnecessary schema modifications.
- Use targeted, validated SQL for repetitive database operations.
- Prefer transactions and rollback-safe operations when appropriate.
- Test bulk operations before applying them.
- Verify affected record counts and critical fields afterward.

Never delete or overwrite student data without explicit authorization.

Never expose database credentials, service-role keys,
or private student information.

Maintain Supabase authentication, RLS, and existing security controls.

### Student Question History

When working with practice questions, CAT functionality,
or adaptive question selection:

- Preserve existing student attempt history.
- Do not overwrite historical question results.
- Do not assume that session-level tracking persists
  across separate tests.
- Distinguish question exposure from completed attempts.
- Verify how previously answered questions are identified
  before modifying question-selection logic.
- Do not change repeat-question behavior without authorization.
- Preserve intentional reassessment and remediation functionality.

Do not introduce new tracking tables or competing history
systems without first inspecting existing functionality.

## Existing Administrative Tools

Before proposing new administrative functionality,
inspect what already exists.

The project includes a private question-bank review workflow
with functionality for:

- Editing questions
- Reviewing clinical corrections
- Managing revision drafts
- Screening potential duplicates
- Importing question batches
- Managing active and inactive questions
- Publishing approved content

Prefer improving existing functionality rather than building
another competing administration system.

Focus improvements on reducing repetitive manual work,
unnecessary review steps, and avoidable AI processing.

Do not introduce new paid services or AI dependencies
without explaining their purpose and expected ongoing costs.

## Project Continuity

`.agents/STATUS.md` is the source of truth for current module
numbering and implementation status.

Historical commits may contain recoverable content but are
NOT authoritative for current curriculum numbering or
security architecture.

Use existing project documentation to maintain continuity
between AI conversations.

Avoid relying on long conversation histories as the sole
source of project decisions.

For substantial unfinished work, create or update the
appropriate file in `.agents/tasks/` when authorized.

Handoff documentation should contain:

- Current task
- Completed work
- Remaining work
- Relevant files or database records
- Important decisions
- Outstanding risks or blockers

Keep handoffs concise.

Do not create additional documentation when existing files
already provide the necessary information.

Do not repeatedly rewrite project status files without
meaningful changes.

## Deployment Source of Truth

- The live portal domain is `portal.studywithmadison.com`.
- DNS and response headers previously identified GitHub Pages
  (`madisondvahle-lab.github.io`, `server: GitHub.com`).
- The documented deployment source is the repository
  `main` branch and repository root.
- Netlify and Cloudflare Pages are not the documented active
  web host for this portal.
- Verify current hosting configuration when deployment
  troubleshooting requires it.
- Do not recommend purging unrelated hosting caches.
- Use a cache-busting query parameter only to verify
  newly published source.
- Cache-busting does not replace committing and merging
  the fix into `main`.

Do not assume that modifying local files or preparing a
pull request automatically updates the live website.

Clearly distinguish:

1. Local changes
2. Committed changes
3. Pushed branch changes
4. Pull request created
5. Merged into main
6. Deployed to production

Repository rules may require pull requests before changes
can be merged into `main`.

Do not bypass repository security rules merely for convenience.

Never claim a deployment succeeded without verifying
the relevant deployment result.

## Multi-Assistant Workflow

This project may be accessed through Claude, ChatGPT,
GitHub Copilot, and other development assistants.

- Before changing deployment or authentication, read
  this file and `.agents/PROJECT.md`.
- Preserve verified deployment facts in future handoffs.
- Do not infer hosting configuration from outdated conversations.
- Use repository documentation as the shared source of truth.
- Do not assume another assistant's proposed changes
  have been implemented without verification.
- Other assistants will only use these instructions when
  their workflow loads `AGENTS.md` or they are explicitly
  told to read it.

## Communication and Task Completion

Communicate clearly and efficiently.

Avoid unnecessary technical explanations when a simpler
explanation will accomplish the same goal.

For technical tasks, distinguish between:

- What was requested
- What was investigated
- What was changed
- What was tested
- What remains unfinished

At the end of completed work, briefly report:

1. What was completed.
2. What was changed.
3. What remains pending.
4. Whether database records were modified.
5. Whether anything was published or deployed.
6. Important validation results or unresolved concerns.

Do not claim success without verification.

Avoid lengthy summaries of routine tool operations.

Do not repeatedly ask the owner to choose between options
when one approach is clearly preferable.

Do not automatically begin the next task or batch.

Do not promise future work that has not been scheduled
or cannot actually be performed.

The owner's time, AI credits, and clinical review capacity
must be treated as limited resources.

Prioritize meaningful, verified improvements over
unnecessary activity.
