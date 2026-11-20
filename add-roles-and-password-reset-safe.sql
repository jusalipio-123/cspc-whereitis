-- add-roles-and-password-reset-safe.sql
-- CSPC WhereITis — additive migration for email login, roles and forgot password.
-- The app runs the equivalent checks automatically in lib/migrate.js at startup.
-- This file is included so a database administrator can review/apply the exact
-- SQL by hand. It preserves every existing row, hash, report and upload path.
--
-- Usage: mysql -u root -p whereitis < add-roles-and-password-reset-safe.sql
--
-- NOTE: If you see "#1060 - Duplicate column name 'reset_token_hash'", the
--       columns are ALREADY present (the app adds them when it starts).
--       No action is needed — do NOT run individual ALTER TABLE statements.
--       Running this whole file is safe; it skips columns that already exist.

USE whereitis;

DROP PROCEDURE IF EXISTS whereitis_add_auth_columns;
DELIMITER $$
CREATE PROCEDURE whereitis_add_auth_columns()
BEGIN
  -- Student accounts keep the historical role value 'user'.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
  ) THEN
    ALTER TABLE users
      ADD COLUMN role ENUM('user','staff','teacher','admin') NOT NULL DEFAULT 'user' AFTER contact_no;
    UPDATE users SET role = 'admin' WHERE student_no LIKE 'ADM-%';
    UPDATE users SET role = 'staff' WHERE student_no LIKE 'STF-%';
  END IF;

  -- Older installs used ENUM('user','staff','admin'); add 'teacher' in place.
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'role' AND COLUMN_TYPE NOT LIKE '%teacher%'
  ) THEN
    ALTER TABLE users
      MODIFY role ENUM('user','staff','teacher','admin') NOT NULL DEFAULT 'user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reset_token_hash'
  ) THEN
    ALTER TABLE users ADD COLUMN reset_token_hash CHAR(64) NULL AFTER verify_sent_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reset_token_expires'
  ) THEN
    ALTER TABLE users ADD COLUMN reset_token_expires DATETIME NULL AFTER reset_token_hash;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reset_sent_at'
  ) THEN
    ALTER TABLE users ADD COLUMN reset_sent_at DATETIME NULL AFTER reset_token_expires;
  END IF;
END$$
DELIMITER ;

CALL whereitis_add_auth_columns();
DROP PROCEDURE IF EXISTS whereitis_add_auth_columns;
