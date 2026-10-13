# 100-item NCLEX intake: release and validation checklist

## Change in this PR
The admin import page now accepts **25–100 questions per JSON batch**, rather than 25–50. The existing per-item review requirement, overlap preview, inactive insertion, separate Approve/Publish controls, and NGN `item_data` validation are preserved.

## Quality controls for 100-question editorial batches
- Target the 2026 NCLEX-RN client-needs distribution without requiring advanced specialty knowledge.
- Use a range of entry-level cognitive tasks (assess, prioritize, implement, evaluate, delegate, teach).
- Aim for approximately 80–85 distinct decisions and up to 15–20 intentional transfer/retention checks, not disguised exact repeats.
- Every MCQ: four plausible options, exactly one key, separate A–D rationales, reliable relevant reference(s).
- Every NGN: validated interaction and scoring data, references, nursing scope verification, realistic case exhibits, editorial review in a compatible student renderer.
- Tag concept family and decision skill in draft metadata; formal schema changes for adaptive delivery should be reviewed before migration.
- Match candidate questions against existing published *and inactive* bank, including within-batch near matches. Allow purposeful concept variants but flag trivial repetitions.
- **New questions stay inactive until individually reviewed and published.**
- Test the importer with a 100-item JSON preview and save, including NGN items. Confirm all 100 records + import-review tracking rows persist. Test a simulated tracking failure and retry without reinserting.
- Validate large preview performance and test with 25, 50, 100, 101 item inputs.
- Verify UI displays 100 reviewed checkboxes and rejects 101 items.
- Keep imports idempotent in future releases by assigning stable external draft IDs; current importer uses a random batch prefix and should not be rerun by re-uploading the same file.

## Current limitation
Increasing the numerical ceiling does not implement a psychometrically calibrated CAT, automatic source verification, or concept-family scheduling. Those are separate phases. A 100-item upload should be treated as a **staged editorial batch**, not automatically approved content.
