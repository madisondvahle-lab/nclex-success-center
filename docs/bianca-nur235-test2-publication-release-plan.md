# Bianca NUR 235 Test 2 — Publication Release Plan

**Purpose:** Approval plan only. This document does not authorize a merge,
deployment, live question-bank update, or student-assignment change.

## Read-only production verification

- The current student resource is titled **NUR 235 Test 2 Practice Exam
  (100 Questions)**. The assignment migration uses the relative URL
  `bianca-nur235-test2.html`.
- The currently published page is reachable at
  `https://portal.studywithmadison.com/bianca-nur235-test2.html`. Its student
  interface reports 100 matching questions and offers an “All 100” option,
  but defaults to 10 questions.
- The page loads `bianca-nur235-test2-bank.json` and uses
  `bianca-nur235-test2-100` as its result key. It is the original bank, not this
  candidate.
- The authenticated admin workspace lists the NUR 235 resource as assigned.
  The student-dashboard preview did not visibly render the NUR 235 practice
  link during this check, so end-to-end dashboard visibility must be verified
  after a release update. A direct link to the current page works.
- The admin assignment summary reports two NUR 235 attempts. Do **not** treat
  that count as a verified NUR 235 result: the summary implementation matches
  an assignment against practice results when *any* title token matches.
  Its activity list shows two completed practice records titled “NUR 215
  Practice Questions,” not NUR 235. No NUR 235-specific completed result was
  visible in that activity list; this UI cannot confirm an exact legacy
  `practice_key`.
- The practice application writes a server-side result only when a learner
  finishes. In-progress checkpoints are browser `sessionStorage`, not server
  attempt rows. Consequently, read-only server views cannot establish whether
  an abandoned, unfinished session was ever started on a particular device.
  Before marking any old record superseded, an authorized read-only lookup
  must filter by Bianca's student ID and the exact legacy `practice_key`.

## Candidate verification

The unpublished candidate contains 100 sequential question IDs, with 70
single-select and 30 SATA questions. Candidate-specific validation found
valid answer IDs, a rationale for every option, and no structural errors.
The shared scorer uses one selected answer for single-select and requires the
exact keyed set for SATA; an incomplete or extra SATA selection is not full
credit. The focused review records the candidate validation and key/length
measures. The existing automated suite passes 5/5 but reads the source bank,
so it is a regression check rather than a candidate-specific test.

## Proposed release sequence — requires separate explicit approval

1. Keep this candidate-review PR unmerged until the candidate and this plan
   are approved. Then prepare a separate, versioned release change; this PR
   contains no page, production-bank, assignment, or deployment changes.
2. Publish the candidate as a new immutable bank file and a matching
   versioned exam page. Configure that page to load the candidate bank, use a
   new result key (for example `bianca-nur235-test2-2026-v2`), and select all
   100 questions by default. Retain the existing exact-set SATA scoring
   behavior. Verify a fresh practice session can load all 100 questions and
   scores MCQ/SATA responses as intended.
3. Keep the original source bank in Git history for rollback, but do not leave
   the old flawed exam as the student-facing target. At release, make the old
   page URL redirect to the revised page and stop serving the old bank JSON
   from the student-facing path. The original files remain recoverable from
   their pre-release commit. This prevents a saved dashboard link or old
   bookmark from opening the flawed quiz while retaining a controlled
   restoration path.
4. After verifying the new page and bank are deployed, update only Bianca's
   existing NUR 235 `student_resources` row, selected by its exact student ID
   and old URL, to the versioned page URL. Update the title only if needed to
   identify the revised version. Preserve its row identity, due date, note,
   completion/status fields, and all other resources. Do not run the general
   assignment form or any broad student/resource update.
5. Verify the student-dashboard preview displays the revised NUR 235 link,
   the page opens with all 100 corrected questions, and a new result carries
   only the new versioned result key. Confirm no other student's assignment or
   the Supabase master question bank was changed.
6. If the revised release must be withdrawn, first remove or redirect the
   revised student link to a clear unavailable/paused page. Restore the
   original page/bank from Git only for a controlled, instructor-approved
   rollback; do not silently direct students back to the known-flawed version.
   Do not delete or rewrite result rows.

## Historical-result handling and limits

- A new versioned result key separates new completed results from any old
  completed results. It also gives the new page a different path, so any
  browser checkpoint for the old page is not continued as the new assessment.
- The results table has no superseded/excluded status. To exclude verified
  legacy NUR 235 results from performance summaries while preserving them,
  add an auditable superseded marker for only rows matching the exact student
  ID and legacy key, and update reporting to filter that marker. Do not change
  scores, delete rows, or infer the legacy key from the current assignment
  summary. That schema/reporting change is outside this candidate-review PR
  and requires separate approval.
- The current assignment rollup's token-based matching can attribute the same
  practice results to multiple similarly named assignments. Fix exact
  `practice_key` matching before relying on per-assignment counts or
  supersession reporting. This PR does not modify that unrelated application
  code.
- GitHub Pages/static hosting does not by itself provide private archived
  assets or immutable result snapshots. Removing the old JSON from the
  student-facing path prevents normal quiz access but does not reconstruct
  the question text shown in any historical attempt. Result rows store
  answers/scores rather than a complete question-content snapshot.

**Current release state:** Not published. The candidate branch and PR are for
review only. No live assignment, exam page, question-bank record, result row,
or student score has been changed.
