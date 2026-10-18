-- add-comment-notifications.sql
-- Run once on an EXISTING database (phpMyAdmin > whereitis > SQL tab).
-- Lets the app notify a report's owner when someone else comments.
-- Safe: does not delete any data.
USE whereitis;
ALTER TABLE notifications
  MODIFY type ENUM('claim_filed','claim_decided','status_changed','message_received','comment_added') NOT NULL;
