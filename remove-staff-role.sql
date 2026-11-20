-- WARNING: the admin side now uses users.role (user / staff / admin).
-- Running this file DROPS that column and removes every staff and admin.
-- Only run it if you are deliberately abandoning the admin side.
--
-- remove-staff-role.sql
-- Run ONCE against an existing database to match the "users only" model:
--   * every account becomes an ordinary user (users.role is dropped);
--     their reports, claims and history are kept as they are
--   * guest reports have no uploader who could approve claims, so existing
--     ones are archived (kept, not deleted)
--   * the staff-only report_notes table is dropped
-- Back up first:  mysqldump <db> > backup.sql

UPDATE reports
   SET status = 'archived',
       archived_reason = 'Guest reports are no longer supported'
 WHERE submitter_type = 'guest' AND status <> 'archived';

DROP TABLE IF EXISTS report_notes;

ALTER TABLE users DROP COLUMN role;
