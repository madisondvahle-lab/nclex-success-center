-- Rollback for supabase-question-safe-delete.sql.
-- Removes the delete safeguards and RPCs. question_deletion_archive is kept
-- on purpose so archived copies of deleted questions are not lost; drop it
-- manually only after exporting its contents.
-- Deleted questions are NOT restored by this script.

drop trigger if exists questions_prevent_used_delete on questions;
drop trigger if exists questions_prevent_used_delete_batch on questions;
drop function if exists delete_questions_permanently(uuid[]);
drop function if exists question_deletion_blockers(uuid[]);
drop function if exists prevent_used_question_delete();
drop function if exists prevent_used_question_delete_batch();
drop function if exists lock_question_usage_tables();
drop function if exists question_block_report(uuid[], text, xid, text[]);
drop function if exists question_usage_details(uuid[], text, xid, text[]);
