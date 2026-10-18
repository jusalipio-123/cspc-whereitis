-- add-guest-reports.sql
-- Adds guest reporting (found items without an account), the staff approval
-- queue, in-app notifications and direct messages to an EXISTING whereitis
-- database. It keeps all existing data. Run this ONCE:
--
--   mysql -u root -p whereitis < add-guest-reports.sql
--
-- (If it says "Duplicate column name 'submitter_type'", it has already been
-- applied - nothing to do.) A fresh install does not need this file:
-- schema.sql already contains everything below.

USE whereitis;

-- 1) reports: a guest report has no owner, so user_id must allow NULL.
ALTER TABLE reports MODIFY COLUMN user_id INT NULL;

-- 2) reports: who filed it, whether the public may see it yet, and the
--    optional staff-only contact details. Existing rows become
--    'registered' + 'approved', i.e. nothing changes for them.
ALTER TABLE reports
  ADD COLUMN submitter_type      ENUM('registered','guest') NOT NULL DEFAULT 'registered' AFTER user_id,
  ADD COLUMN moderation_status   ENUM('approved','pending','rejected') NOT NULL DEFAULT 'approved' AFTER submitter_type,
  ADD COLUMN moderated_by        INT NULL AFTER moderation_status,
  ADD COLUMN moderated_at        DATETIME NULL AFTER moderated_by,
  ADD COLUMN moderation_note     VARCHAR(255) NULL AFTER moderated_at,
  ADD COLUMN guest_contact_name  VARCHAR(120) NULL AFTER moderation_note,
  ADD COLUMN guest_contact_email VARCHAR(160) NULL AFTER guest_contact_name,
  ADD COLUMN guest_contact_phone VARCHAR(20)  NULL AFTER guest_contact_email,
  ADD COLUMN submitter_ip_hash   CHAR(64) NULL AFTER guest_contact_phone;

ALTER TABLE reports
  ADD CONSTRAINT chk_reports_submitter
    CHECK ((submitter_type = 'registered' AND user_id IS NOT NULL)
        OR (submitter_type = 'guest'      AND user_id IS NULL)),
  ADD CONSTRAINT fk_reports_moderated_by
    FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL,
  ADD INDEX idx_reports_moderation (moderation_status, submitter_type),
  ADD INDEX idx_reports_ip_created (submitter_ip_hash, created_at);

-- 3) notifications + direct messages (see schema.sql for the design notes).
CREATE TABLE IF NOT EXISTS notifications (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  type        ENUM('claim_filed','claim_decided','status_changed','message_received') NOT NULL,
  report_id   INT NULL,
  body        VARCHAR(255) NOT NULL,
  link        VARCHAR(200) NOT NULL,
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT fk_notifications_report
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  INDEX idx_notifications_user_unread (user_id, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  report_id        INT NOT NULL,
  owner_user_id    INT NOT NULL,
  starter_user_id  INT NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_conversation (report_id, starter_user_id),
  CONSTRAINT fk_conversations_report
    FOREIGN KEY (report_id)       REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversations_owner
    FOREIGN KEY (owner_user_id)   REFERENCES users(id)   ON DELETE RESTRICT,
  CONSTRAINT fk_conversations_starter
    FOREIGN KEY (starter_user_id) REFERENCES users(id)   ON DELETE RESTRICT,
  INDEX idx_conversations_owner   (owner_user_id, last_message_at),
  INDEX idx_conversations_starter (starter_user_id, last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id  INT NOT NULL,
  sender_user_id   INT NOT NULL,
  body             VARCHAR(1000) NOT NULL,
  read_at          DATETIME NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender
    FOREIGN KEY (sender_user_id)  REFERENCES users(id)         ON DELETE RESTRICT,
  INDEX idx_messages_conversation (conversation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
