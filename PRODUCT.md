# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

NCLEX-prep and nursing-course students use the private Success Center to study
and track their learning. Madison uses the tutor/admin tools to assign
resources, review student progress, and support remediation.

## Product Purpose

The Success Center supports student assessment, individualized remediation,
learning modules, practice, readiness tracking, and tutor administration.
Success means students can work on the learning and assessments assigned to
them, while Madison can follow their progress in the same private portal.

## Operating Context

Students sign in to a private portal that connects their profile, assignments,
learning resources, assessment history, and practice activity. NCLEX-prep
students use NCLEX-focused review and readiness tracking. Regular nursing
students need dedicated, exam-specific practice questions for their individual
classes. Course-specific study materials and question sets are assigned to
individual students; general NCLEX review is distinct from course exam
preparation.

## Capabilities and Constraints

- Student access uses Supabase Auth and Row Level Security.
- Practice includes assigned sets and mixed review; the existing ExamUI powers
  question-taking and supports existing item formats.
- NCLEX-prep students use NCLEX-focused review and readiness tracking.
- Regular nursing students use their individual class and exam assignments;
  their learning path starts with a class and leads to its exam-specific
  assigned materials and question sets.
- Course-targeted questions may also be reused from the shared question bank;
  exam assignments should target existing questions rather than duplicate
  question records or maintain a separate bank.
- Preserve existing question IDs, wording, answer keys, rationales, saved
  performance history, and assignments during technical or UI work.
- Do not expose one student's course-specific assignments to other students.
- Do not publish unapproved replacement question drafts.
- NGN questions may be stored, but student rendering and scoring support must
  be verified before they are used in student practice.

## Brand Commitments

The student portal is the private NCLEX Success Center associated with Study
With Madison RN. It is not the public Study With Madison marketing website.

## Product Principles

- Keep student data private and access limited to the authenticated student
  and authorized administrators.
- Make assigned learning and progress understandable in one connected portal.
- Preserve clinical content and student history during technical changes.
- Keep NCLEX readiness and mixed review distinct from regular nursing
  students' class- and exam-specific workflow.
- Do not represent practice performance as an official NCLEX result.

## Student-facing terminology

- Use “exam prep” and “assigned question set” for course-specific practice,
  rather than a generic “practice questions” destination.
