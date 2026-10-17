# NCLEX Success Center: Question Bank Audit Protocol

## Purpose

Establish a clinically rigorous, efficient, and cost-conscious
process for auditing the NCLEX Success Center question bank.

The objective is to improve question quality, not maximize
the number of revisions produced.

A successful audit may result in zero corrections.

Follow AGENTS.md and .agents/CLINICAL-STANDARDS.md.

## 1. Audit Before Revising

When instructed to audit questions:

1. Identify the authorized question numbers or batch.
2. Check whether each question has already been audited.
3. Check for existing pending or approved correction drafts.
4. Use the most recent approved or pending revision as the
   working version when one exists.
5. Evaluate each question against clinical and educational standards.
6. Classify the question before proposing any changes.

Do not assume every question requires revision.

Do not generate replacement questions unless justified.

## 2. Question Classification

PASS:
Clinically accurate, appropriate for entry-level nursing practice,
with a defensible answer key, meaningful rationale, and reasonable
distractors.

Action: Leave unchanged. Record screening outcome.

MINOR:
Small wording, formatting, clarity, or classification issue.

Action: Recommend only the necessary correction.

MAJOR:
Incorrect or unsafe clinical information, incorrect answer key,
significant ambiguity, weak distractors, or inadequate rationale.

Action: Explain the deficiency and prepare a targeted revision
when revision is authorized.

RETIRE:
Fundamentally unsuitable, substantially redundant without
educational value, or impossible to correct without replacing
the learning objective.

Action: Recommend retirement or replacement. Do not delete.

## 3. Clinical Quality Standards

Evaluate:

- Clinical accuracy and patient safety.
- Entry-level RN scope and expectations.
- NCLEX relevance.
- Appropriate cognitive difficulty.
- Clinical judgment and prioritization.
- Plausibility of incorrect options.
- Accuracy of the answer key.
- Quality of overall and option-specific rationales.
- Internal consistency.
- Avoidance of unintended answer clues.
- Appropriate category, topic, and difficulty classification.

Do not artificially increase difficulty.

Do not introduce clinical complexity beyond the intended
learning objective.

Preserve clinically appropriate conceptual reinforcement.

Distinguish intentional reinforcement from unnecessary duplication.

## 4. Two-Stage Audit Workflow

### Stage A: Screening

Screen the authorized batch before rewriting questions.

Return a compact report containing:

- Question number.
- Classification: PASS, MINOR, MAJOR, or RETIRE.
- Specific issue, if any.
- Recommended action.
- Existing revision status, if applicable.

Do not create correction drafts during initial screening.

Do not automatically rewrite questions classified PASS.

### Stage B: Targeted Revision

After the owner authorizes revisions:

- Revise only questions classified MINOR or MAJOR.
- Preserve the original learning objective when appropriate.
- Make the smallest change needed to resolve the deficiency.
- Keep options, keys, and rationales synchronized.
- Verify significant clinical claims when necessary.
- Preserve existing question identifiers and history.
- Stage changes through the existing correction-draft workflow.

Do not apply or publish revisions without explicit authorization.

## 5. Existing Question Protection

The master bank uses public.questions.

Existing correction proposals use
public.question_revision_drafts.

Before proposing changes:

- Check for pending_review or approved drafts.
- Do not overwrite existing approved work.
- Preserve original base_content.
- Preserve question UUID and question_no.
- Preserve student history and assignments.
- Do not create duplicate revision drafts.
- Do not reactivate inactive questions without authorization.

If a newer approved revision exists, do not silently revert
to the original question.

## 6. Batch Management

Maintain a record of:

- Question numbers screened.
- Screening outcomes.
- Questions requiring revisions.
- Revisions awaiting clinical review.
- Approved but unapplied corrections.
- Corrections applied to Supabase.
- Questions published to students.

Before beginning another batch, check existing progress.

Do not repeatedly audit previously completed questions
unless new evidence or a specific concern justifies reassessment.

Do not automatically continue to another batch.

When the owner says "proceed," continue only the previously
agreed stage and scope.

## 7. AI Cost Management

Minimize unnecessary AI processing while maintaining
clinical accuracy.

- Use targeted database queries.
- Avoid retrieving unrelated questions.
- Avoid unnecessary repository-wide searches.
- Reuse existing clinical standards.
- Do not repeatedly research settled clinical facts.
- Use targeted clinical research when accuracy requires it.
- Avoid regenerating already approved rationales.
- Prefer automated structural checks when appropriate.
- Do not create lengthy documentation for routine screening.
- Stop once the authorized batch is complete.

Do not sacrifice clinical accuracy or required verification
to reduce AI costs.

## 8. Review and Approval

Clinical revisions require tutor review.

Maintain distinct states:

1. Screened
2. Revision proposed
3. Pending clinical review
4. Approved
5. Applied to Supabase
6. Published

Do not confuse approved with applied.

Do not confuse applied with published.

Do not claim a database change occurred without verification.

Use the existing admin review workflow.

Do not bypass clinical review safeguards.

## 9. Reporting

At the end of each screening batch, provide:

- Number screened.
- Number passed unchanged.
- Number requiring minor corrections.
- Number requiring major corrections.
- Number recommended for retirement.
- Number excluded because of existing revisions.
- Question numbers requiring attention.
- Whether database records were modified.

Keep reports concise.

At the end of a revision batch, report:

- Question numbers revised.
- Specific changes made.
- Where revisions were saved.
- Approval status.
- Whether anything was applied or published.
- Remaining unresolved concerns.

Never report work as completed unless verified.

## 10. Owner Control

The project owner determines:

- Which batches are screened.
- Which revisions are prepared.
- Which revisions are approved.
- Which questions are retired.
- Which changes are applied.
- Which questions are published.

Do not interpret conversational discussion as authorization
for additional clinical modifications.

The goal is a clinically sound question bank with minimal
unnecessary AI processing and manageable tutor review.
