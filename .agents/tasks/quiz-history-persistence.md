# Canonical quiz history persistence

## Phase 1

`in_house_assessment_attempts` is the append-only attempt header and
`in_house_assessment_item_responses` is the append-only question response
table. The history extension adds `assessment_key`, `assessment_title`,
`system`, `question_type`, `selected_answer`, and `correct_answer`. Answer
values are JSONB so scalar, SATA arrays, and future NGN objects share one
shape.

`assessment-persistence.js` normalizes answers recursively, treats arrays as
order-independent multisets (so duplicate selections remain unequal to a
non-duplicate answer), preserves structured object keys, and handles
null/unanswered values explicitly. Its save helper resolves the
authenticated student and calls the transactional `save_in_house_assessment_attempt`
RPC. Existing RLS policies remain responsible for student ownership and reads.

Diagnostic persistence is the first consumer. The supplemental table remains
unchanged. Later, `supplemental-practice.html` can read each existing result,
map `answer_details` into response rows, and write a new canonical attempt
without deleting or updating the original supplemental row. A one-time
backfill should be separately reviewed and should retain the original result
ID as provenance; future supplemental completions can dual-write or switch
to the canonical helper after validation.
