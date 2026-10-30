# Question Bank JSON import specification

This specification applies to the existing **Question Bank > Import / Create >
JSON batch import** workflow. Import 1-50 questions using either a bare JSON
array or `{"items":[...]}`. A six-question case counts as one parent entry.
Do not include Markdown fences in the importer input.

## Generation and review workflow

1. Give ChatGPT this specification, the intended topic, difficulty, learning
   objectives, and current authoritative source material. Request original
   questions, not copied commercial question-bank content.
2. Have it verify each key and rationale against the supplied sources, identify
   uncertainty, and avoid invented citations. If sources are unavailable, stop
   for source verification rather than inventing facts or references.
3. Paste the generated JSON into the existing importer or choose a JSON file.
   Click **Validate and preview**. Correct all reported question/field errors.
   Paths such as `item_data.items[2].dropdowns[0].correct` use zero-based indexes.
4. On each valid import card, click **Preview as student** before checking the
   review box. Test clinical tabs, responses, and unfolding stages. Answer and
   click **Check answer** to inspect the key and rationale. Exit or finish to
   return to the import cards. This uses the existing student renderer; preview
   responses are temporary and do not save questions or student attempts.
   In split clinical-record previews, question text and MCQ/SATA answers use
   matching font sizes. The text-size control scales both together; multiline
   answers align with their option number and selection control.
5. Review every stem, key, rationale, reference, and overlap warning. Mark
   reviewed items, then **Save reviewed items as inactive drafts**. Previewing
   alone does not mark an item reviewed or enable saving. Saved drafts remain
   editable and can also be previewed through **Edit > Preview as student**.
   To exclude a duplicate or unwanted item before saving, choose **Remove from
   this import** on its card and confirm. This updates the pasted JSON and
   rechecks the remaining items, including within-batch overlaps. Unchanged
   review confirmations are retained; changed checks require review again.
   It does not delete existing bank questions or modify your downloaded file.
   A six-item case is removed as one complete entry, not individual case items.
   For an already saved inactive draft, use **Manage questions**, select the
   question, and choose **Delete forever**; existing history/link safety checks
   and confirmation still apply.
   The import filters can narrow cards by Client Needs, Study Area, question
   type, and review status. Sort unsaved cards by file order or question text;
   they do not have saved creation dates or bank numbers yet. Filtering does
   not exclude items from saving: every retained item must still be reviewed.
   **Mark no-overlap items reviewed** applies only to matching visible cards.
   Use **Select shown import items > Remove selected from this import** to
   exclude several items together after confirmation.
6. Independently perform clinical review before approval/publication. Approving
   a batch keeps it inactive; publishing is a separate action. Structural
   validation and an AI-generated answer are not clinical approval.

Importing creates new questions only. It does not update existing questions,
drafts, approvals, assignments, or CAT admission controls. Every imported row is
saved with `active: false`; supplying `active: true` cannot publish it.

## Managing saved drafts and possible duplicates

In **Master questions**, choose **Inactive / drafts**, then filter by Client
Needs, Study Area, question type, or review status. Sort by newest/oldest,
question number, or question text. Select shown questions and use the existing
bulk actions. Filter changes drop selections hidden by the new filters; sorting
does not select additional questions. Whole-batch approval/publication controls
still apply to the entire named batch, not a filtered subset.

**Possible duplicates** has the same filters and saved-question sorting.
A pair is shown if either question matches every selected filter; both copies
remain visible for comparison. Review/edit either question or use **Delete this
copy** directly beside the unwanted one. You can also select explicit copies
across pairs and choose **Delete selected copies**; repeated appearances of the
same question are counted once. No original/duplicate is selected automatically.
Deletion still requires the existing database safety checks and confirmation.
Questions with protected history cannot be deleted. Published questions must
first be made inactive through the existing guarded workflow.

These are screening suggestions, not proof of clinical duplication. Compare
the answer key, rationales, and intended learning objective before deleting.
No bank records are modified by filtering, sorting, or selecting.

## Reversible archive

After applying `supabase-question-archive.sql`, select inactive questions and
choose **Archive inactive**. Archiving only sets `questions.archived_at`; it
does not delete questions, remove assignment links, alter clinical content,
resolve student flags, or approve/reject/apply corrections.

Archived questions leave the working master bank, duplicate screen, imported
batch actions, new audit batches, and current review queues. They remain
inactive, so they cannot be published without restoration. Existing student
results and assignments are retained; this is not assignment withdrawal.

Use **Master questions > Archive / history** to find archived questions and
**Restore (inactive)** to return one to the working bank. Changing between
Archive and the working bank resets bank filters/search to avoid hiding items.
Restoration does not publish or clear outstanding review findings.

For retained records, use **Show archived-question correction and flag history**
under Review, or **Question workspace > Archived question history** in the audit
panel. Archived audit/correction records are read-only in these views. Audit
status counts show working questions; lifetime usage still includes archived
audit history. Applied corrections remain applied, and pending findings remain
pending. No AI audit runs are needed to archive questions.

The schema migration itself archives no questions. Any production cleanup is
a separately approved, explicitly scoped operation on inactive question IDs.

## Required parent fields

| Field | Rule |
| --- | --- |
| `id` | Unique within the batch; 1-100 ASCII letters, digits, `.`, `_`, or `-`. This is an import identifier, not an existing database UUID. Use fresh IDs/content and review overlap warnings. |
| `stem` | Nonempty question text; for a case, a meaningful parent description. |
| `item_type` | `mcq`, `sata`, `matrix`, `cloze`, `highlight`, `bowtie`, `fill`, or `case`. Use lowercase. |
| `difficulty` | Exactly `easy`, `medium`, or `hard`. |
| `nclex_category` | Nonempty text; use the bank's established NCLEX taxonomy. |
| `topic` | Nonempty text. |
| `clinical_judgment_skill` | Nonempty text, e.g. `Analyze cues`. |
| `rationale` | Nonempty full explanation. Also required for a case parent; each child needs its own rationale. |
| `option_rationales` | Nonempty object of identifier-to-explanation strings. MCQ requires lowercase `a`, `b`, `c`, `d`. For other types use unambiguous identifiers, e.g. `0:1` for dropdown 0, choice 1. These entries are retained as review metadata; arbitrary identifiers do not automatically create individual student feedback. Include necessary explanations in each question's `rationale`. |
| `references` | Nonempty array of `{"title":"...","url":"https://..."}` objects. HTTP(S) URLs are required; independently verify their contents. Stored as `reference_list`. |
| `item_data` | Required complete object except for traditional MCQ without records; see below. |

Optional `module_key` and `nclex_sub` must be strings or null.
Optional `study_area` must be null or exactly one of:

- `Adult Health / Medical-Surgical`
- `Maternal & Newborn`
- `Pediatrics`
- `Mental Health`
- `Pharmacology & Medication Safety`
- `Fundamentals, Safety & Infection Control`
- `Leadership & Professional Practice`
- `Health Promotion & Maintenance`

Unknown parent fields are not a supported way to set database columns.
The importer generates database UUIDs and import-tracking source keys.

## Authored interaction: `item_data`

For standalone authored questions include:

- `id`: stable nonempty string; use the parent import ID.
- `type`: exactly the parent `item_type`; no `kind` field.
- `schemaVersion`: number `1` (required for imported authored data).
- `textFormat`: `"plain"` (recommended; `"html"` is also recognized).
- `scoringVersion`: `"ngn-v1"` for current partial-credit scoring. Omission retains
  legacy scoring; do not omit it in newly generated questions.
- `stem` and `rationale`: nonempty strings matching the parent wording.
- Optional `tabs`: clinical-record array, independent of interaction type.
- Interaction fields from the table below.

`scoring: "zero-one"` explicitly requests existing all-or-nothing scoring.
Otherwise omit `scoring` to use existing type-specific credit. This specification
does not introduce or change scoring algorithms.

All numeric answer indexes below are **zero-based integers**, not letters or
numeric strings. Keys must be unique and within their corresponding choices.

| Type | Required interaction fields |
| --- | --- |
| `mcq` | Nonempty `options` array and `correct: [index]` with exactly one answer. At the parent level, exactly four `options` and `correct_answer: "a"` through `"d"` are always required. If `item_data` is supplied, its options/order and numeric key must match the parent. Traditional MCQ may omit `item_data` entirely. |
| `sata` | Nonempty `options` array; `correct: [index, ...]` containing one or more correct answers. |
| `matrix` | Nonempty `rows` and `cols` string arrays; `correct: ["0:1", "1:0", ...]` with canonical zero-based `row:column` coordinates. Optional `responseMode`: `"single"` or `"multiple"`; `"single"` requires exactly one correct cell per row. Optional `scoringAxis`: `"row"` or `"column"`. Optional existing `rowLabel` overrides the presentation heading. Without an override, prompts explicitly mentioning proposed/potential/nursing interventions show "Potential Intervention"; prompts mentioning nursing actions show "Nursing Action"; otherwise the heading remains "Finding". |
| `cloze` | Nonempty `template`, e.g. `"The finding is {{0}}."`; nonempty `dropdowns: [{"options":["A","B"],"correct":1}]`. Every dropdown index needs exactly one matching `{{index}}` marker, with no duplicates or gaps. |
| `highlight` | `segments: [{"id":"finding-1","t":"Finding text","correct":true}]`. Selectable IDs must be unique, text nonempty, and at least one finding correct. Nonselectable text segments can omit ID/correct. `correct`, when supplied, is boolean. With `chartSelections: true`, every selectable segment must match an available chart cell's ID and exact text at that question's stage. |
| `bowtie` | `bowtie: {"actions":[...],"conditions":[...],"complications":[...]}` with nonempty choices; `correct: {"actions":[0,1],"condition":0,"complications":[0,1]}`. Exactly two unique actions, one condition, and two unique parameters/complications are required. |
| `fill` | Finite numeric `correct`; optional finite nonnegative `tolerance`; optional `unit` string. |
| `case` | Use the case structure below, not `type: "case"`. |

### Clinical records

MCQ, SATA, and all standalone NGN types can include `tabs` directly in
`item_data`. Questions without records need no `tabs` field.

Each tab has a unique nonempty `id`, nonempty `label`, optional `fromItem`
(defaults to 1), nonempty `columns` strings, and nonempty `entries`.
Each entry has:

- `at`: parseable date/time string; use ISO 8601 consistently, preferably with
  a timezone offset when the intended timezone matters.
- Optional `fromItem`: positive integer (defaults to 1).
- `cells`: exactly one nonempty string or `{"t":"text","id":"optional-cell-id"}`
  object per column. Supplied cell IDs must be nonempty and unique across tabs
  and timestamps.

Standalone tabs and entries must be available from item 1.
Entries render chronologically without changing authored source order.
Structured records display authored military time only (e.g. `0800`, `1430`),
without timezone conversion. Original ISO timestamps remain in the data and
HTML `datetime` attributes; sorting and stage disclosure still use source data.
Legacy `{"id":"...","label":"...","html":"..."}` tabs remain supported, but new
generated records should use structured columns/entries.

### Six-item unfolding cases

Parent `item_type` is `"case"`. Its `item_data` contains:

- `id`, `schemaVersion: 1`, `textFormat: "plain"`, `scoringVersion: "ngn-v1"`.
- `kind: "case"`; **omit `type`**.
- `title`, nonempty `scenario`, optional shared `tabs`.
- `items`: **exactly six** complete authored questions, in intended order.
  Each child has a unique stable `id`, supported standalone `type`, nonempty
  `stem` (or `prompt`), its own `rationale`, and interaction fields.
  Include `schemaVersion: 1`, `textFormat: "plain"`, and
  `scoringVersion: "ngn-v1"` on each newly generated child.

Do not nest cases or put tabs on children. Put all shared records on the parent.
Tab/entry `fromItem` values must be integers 1-6. A child cannot key a chart
finding that is still hidden at its stage. Keep the entire case in one import
entry; do not split its six children into independent parent entries.

Published active six-item cases are also eligible for regular mixed practice
and are included by default alongside traditional and SATA questions. A case
counts as six questions; if it is selected, all six items stay together and in
authored order, with the existing staged chart disclosure and NGN scoring.
Question-history filters treat the case as one selection unit and use its six
child question IDs for history. Mixed-set results keep the existing fully
correct item count and also report NGN partial-credit points separately.

## Working standalone drop-down example

Synthetic chart-reading example for technical validation, not a clinically
approved publication-ready question. The reference is background on vital
signs, not independent clinical approval of this item.

```json
{
  "items": [
    {
      "id": "demo-cloze-vitals-001",
      "stem": "Review the Vital Signs tab and complete the statement about the documented pulse readings.",
      "item_type": "cloze",
      "difficulty": "medium",
      "nclex_category": "Reduction of Risk Potential",
      "study_area": "Fundamentals, Safety & Infection Control",
      "topic": "Vital-sign trends",
      "clinical_judgment_skill": "Analyze cues",
      "rationale": "The documented pulse increased from 80 beats/min at 08:00 to 96 beats/min at 09:00. The latest documented value is 96 beats/min. No diagnosis or treatment is inferred.",
      "option_rationales": {
        "0:0": "Correct: 96 is greater than 80.",
        "0:1": "Incorrect: the later value is higher, not lower.",
        "0:2": "Incorrect: the documented values differ.",
        "1:0": "Incorrect: 80 beats/min is the earlier value.",
        "1:1": "Correct: 96 beats/min is the latest value."
      },
      "references": [
        {
          "title": "MedlinePlus: Vital signs",
          "url": "https://medlineplus.gov/ency/article/002341.htm"
        }
      ],
      "item_data": {
        "id": "demo-cloze-vitals-001",
        "type": "cloze",
        "schemaVersion": 1,
        "textFormat": "plain",
        "scoringVersion": "ngn-v1",
        "stem": "Review the Vital Signs tab and complete the statement about the documented pulse readings.",
        "rationale": "The documented pulse increased from 80 beats/min at 08:00 to 96 beats/min at 09:00. The latest documented value is 96 beats/min. No diagnosis or treatment is inferred.",
        "tabs": [
          {
            "id": "vital-signs",
            "label": "Vital Signs",
            "fromItem": 1,
            "columns": ["Pulse (beats/min)", "Respirations (breaths/min)", "Blood pressure (mm Hg)", "SpO2 (%)"],
            "entries": [
              {
                "at": "2026-10-26T08:00",
                "fromItem": 1,
                "cells": [{"t":"80"}, {"t":"16"}, {"t":"120/76"}, {"t":"98"}]
              },
              {
                "at": "2026-10-26T09:00",
                "fromItem": 1,
                "cells": [{"t":"96"}, {"t":"18"}, {"t":"118/74"}, {"t":"98"}]
              }
            ]
          }
        ],
        "template": "Between 08:00 and 09:00, the documented pulse {{0}}. The latest documented pulse is {{1}}.",
        "dropdowns": [
          {"options":["increased","decreased","remained unchanged"],"correct":0},
          {"options":["80 beats/min","96 beats/min"],"correct":1}
        ]
      }
    }
  ]
}
```

## Reusable ChatGPT request

> Generate original NCLEX-style questions using the attached Question Bank JSON
> import specification and supplied verified clinical sources. Return only valid
> JSON, with an `items` array of 1-50 entries. Use complete authored structures,
> current scoring metadata, matching parent/nested text, stable unique IDs,
> valid zero-based keys, complete rationales, and genuine reference titles/URLs.
> Preserve case order and chart disclosure. Do not copy commercial questions,
> invent sources, or label generated material clinically approved. If source
> support is insufficient, identify the missing evidence before generating JSON.

Automated checks validate structure, not clinical truth, source currency, or
NCLEX educational quality. Human clinical review remains mandatory.
