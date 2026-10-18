-- =====================================================================
-- schema.sql
-- CSPC WhereITis — Lost & Found Management System
-- CCIT 106 Midterm Project — Week 6 deliverable
-- =====================================================================
--
-- Charset / collation: utf8mb4 / utf8mb4_unicode_ci is used everywhere so
-- that Filipino names with special characters (ñ, extended punctuation,
-- emoji in free text, etc.) store correctly. utf8mb4_unicode_ci is chosen
-- over utf8mb4_general_ci because it does full Unicode collation (more
-- linguistically correct sorting/comparison) and the performance
-- difference is irrelevant at this dataset size.
--
-- This file is idempotent-ish for classroom use: DROP TABLE IF EXISTS in
-- strict child-to-parent order, then CREATE TABLE in parent-to-child
-- order, so it can be re-run on a clean database during grading.
-- =====================================================================
CREATE DATABASE IF NOT EXISTS whereitis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE whereitis;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS bookmarks;
DROP TABLE IF EXISTS report_status_history;
DROP TABLE IF EXISTS report_comments;
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS counter_sequence;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS categories;

SET FOREIGN_KEY_CHECKS = 1;

CREATE DATABASE IF NOT EXISTS whereitis
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE whereitis;

-- ---------------------------------------------------------------------
-- categories
-- Small, staff-curated lookup table for item categories (Bags, Gadgets,
-- IDs, Books, etc.). A real lookup table here (not an ENUM) because
-- admins are expected to add/rename/reorder categories over time
-- (FR context: admin "manages categories and locations") without a
-- schema migration — this is the opposite case from `status`/`kind`
-- below, which are closed, code-driven sets.
-- ---------------------------------------------------------------------
CREATE TABLE categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(60)  NOT NULL,
  slug        VARCHAR(60)  NOT NULL,
  icon_key    VARCHAR(40)  NULL,        -- maps to an inline SVG symbol id in views/partials/icons.ejs
  sort_order  INT          NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_categories_name (name),
  UNIQUE KEY uniq_categories_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- locations
-- Campus locations (buildings, gates, gyms, offices). `zone` is a loose
-- free-text grouping (Academic / Sports / Admin) used only for display
-- grouping in the report form, not for filtering logic, so it stays a
-- plain nullable VARCHAR rather than its own table.
-- `is_public` lets admins hide internal-only holding spots (e.g. a
-- staff stockroom) from the public "location lost/found" dropdown while
-- still using them as a holding_location value.
-- ---------------------------------------------------------------------
CREATE TABLE locations (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  zone       VARCHAR(60)  NULL,
  is_public  TINYINT(1)   NOT NULL DEFAULT 1,
  UNIQUE KEY uniq_locations_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- users
-- Pre-seeded "demo accounts" table. No sessions/auth library exists yet
-- (that's Week 11), so identity for /my-reports is proven with a
-- student number + 4-digit PIN checked against a salted SHA-256 hash.
--
-- WHY NOT bcrypt: bcrypt is a Week 11 concept (password hashing with a
-- work factor). This midterm deliberately uses SHA-256(salt || pin)
-- instead — a documented compromise, not an oversight. See the large
-- comment block in middleware/identity.js and README "Identification
-- Without Sessions" for the full rationale and the Week 11 replacement
-- plan (bcrypt + express-session + real passwords).
--
-- WHY UNIQUE on student_no: a student number is the real-world natural
-- key a human types in at /my-reports/sign-in — two rows sharing one
-- student_no would make sign-in ambiguous (which account does the PIN
-- belong to?) and would let one student's reports leak into another's
-- "My Reports" page. The UNIQUE constraint makes that structurally
-- impossible rather than merely "unlikely."
--
-- WHY UNIQUE on email: email is the second identifying contact channel
-- and is used as a de-duplication key when staff manually reconcile
-- demo accounts; duplicate emails would make "who does this inbox
-- belong to" ambiguous in exactly the same way as student_no.
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  student_no  VARCHAR(20)  NOT NULL,
  full_name   VARCHAR(120) NOT NULL,
  email       VARCHAR(160) NOT NULL,
  pin_salt    CHAR(32)     NOT NULL,     -- per-user random hex salt (16 random bytes, hex-encoded)
  pin_hash    CHAR(64)     NOT NULL,     -- hex SHA-256(salt || pin) — midterm-only, see note above
  contact_no  VARCHAR(20)  NULL,         -- optional; only collected because the student may want to be called
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_users_student_no (student_no),
  UNIQUE KEY uniq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- counter_sequence
-- WHY THIS TABLE EXISTS: reference numbers must be sequential,
-- human-friendly, and per-calendar-year (LF-YYYY-NNNN). Deriving a
-- reference from Date.now().toString().slice(-8) (the Week 6 handout
-- shortcut) is NOT acceptable here: it is not sequential (can't tell
-- report #4 came before #5 at a glance), not human-friendly (looks like
-- a phone number, not a claim ticket), and it COLLIDES under load if
-- two requests hit the same millisecond-derived slice.
--
-- Instead, one row per year holds the last issued number. lib/refs.js
-- generates the next reference inside a transaction using
-- `SELECT last_value FROM counter_sequence WHERE year = ? FOR UPDATE`,
-- which takes a row lock so two concurrent INSERTs cannot both read the
-- same last_value and hand out the same reference number — the second
-- transaction blocks on the row lock until the first commits, then
-- reads the already-incremented value. This is the only correct way to
-- hand out gap-free sequential numbers under concurrent writers in
-- MySQL without a dedicated sequence object (MySQL has no CREATE
-- SEQUENCE).
-- ---------------------------------------------------------------------
CREATE TABLE counter_sequence (
  year        SMALLINT PRIMARY KEY,
  last_value  INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- reports
--
-- WHY UNIQUE on reference_no: this is the public-facing ticket number
-- printed on receipts and used in shareable URLs
-- (/reports/LF-2026-0001). Two reports sharing one reference number
-- would make the public detail page, the print receipt, and every
-- cross-reference in this system ambiguous — the UNIQUE key is the
-- database-level guarantee that lib/refs.js's FOR UPDATE counter is
-- actually being respected.
--
-- WHY ENUM for `kind` and `status` rather than a lookup table (with
-- trade-off note): unlike `categories`/`locations`, the set of kinds
-- ('lost','found') and statuses ('open','matched','claimed','returned',
-- 'archived') is fixed by the application's business logic itself —
-- lib/status.js's TRANSITIONS map is hard-coded around these exact
-- values, so a new status cannot be "added by an admin at runtime"
-- without also shipping new code to handle it. Using ENUM makes MySQL
-- itself reject any row that doesn't match one of these known values
-- (cheap, storage-efficient, self-documenting in DESCRIBE), which is a
-- feature here, not a limitation. The trade-off: adding a genuinely new
-- status later requires an ALTER TABLE migration instead of an INSERT,
-- and ENUM values are MySQL-specific (a lookup table would be more
-- portable to another RDBMS) — an acceptable cost for a fixed, code-
-- coupled state set at this project's scale.
--
-- WHY the CHECK constraint on holding_location for found items: FR-02
-- requires every FOUND report to record where the item is being kept
-- (the security desk, the SA office, etc.) so staff can physically find
-- it; a LOST report has no such location because nobody is holding
-- anything yet. The CHECK enforces this at the database boundary
-- (defence in depth) in addition to the server-side validation rule in
-- middleware/validate.js ("Client-side required attributes are
-- convenience only — anyone can send this request with curl"), so even
-- a bug in the route handler cannot silently insert a FOUND report with
-- nowhere for a claimant to go pick up their item.
--
-- WHY composite index on (kind, status): the single most common query
-- in this system is "list open lost reports" / "list open found
-- reports" (the home page counters and /reports default filter both do
-- exactly this), always filtering on both columns together — a
-- composite index lets MySQL satisfy that WHERE clause with one index
-- range scan instead of intersecting two single-column indexes.
--
-- WHY composite index on (category_id, occurred_on): FR-09's matching
-- engine's core query is "find reports in the SAME category within a
-- date window of a given date" — filtering and range-scanning on
-- exactly these two columns together, so a composite index here turns
-- the matching lookup from a full table scan into an index range scan.
-- The same index also serves the /reports category+date-range filter.
--
-- WHY ON DELETE RESTRICT (see also users, categories, locations below):
-- a report's owner, category, and location are load-bearing facts for
-- NFR-08 ("any report can be traced back to the user who filed it,
-- forever") — deleting a user, category, or location out from under an
-- existing report would either orphan the report or silently erase
-- who-filed-what. RESTRICT forces the operator to explicitly reassign
-- or archive dependent rows first, which is the correct failure mode
-- for an audit-trail-bearing table.
--
-- GUEST REPORTS (submitter_type / moderation_status / guest_contact_* /
-- submitter_ip_hash):
--   * user_id is NULL for a guest report, and chk_reports_submitter keeps
--     the two shapes from mixing. Everything that used to assume an owner
--     (JOIN users) now LEFT JOINs.
--   * moderation_status is deliberately a SEPARATE column from `status`.
--     `status` is the item's life cycle (open -> returned), driven by
--     lib/status.js. Moderation is "may the public see this at all?" A
--     guest reports are created 'approved' (public immediately)
--     or 'rejected'. Registered reports are 'approved' on insert, so
--     nothing changes for them. Every public query filters on 'approved'.
--   * guest_contact_* are optional and staff-only. They exist so staff can
--     phone or email the finder; no public query or view ever selects them.
--   * submitter_ip_hash is an HMAC, not an IP. It is enough to say "these
--     three reports came from the same connection" and to rate-limit, but
--     it cannot be reversed to an address (RA 10173 data minimisation).
-- ---------------------------------------------------------------------
CREATE TABLE reports (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  reference_no      VARCHAR(20)  NOT NULL,
  user_id           INT          NULL,       -- NULL only for guest reports; see chk_reports_submitter below
  submitter_type    ENUM('registered','guest') NOT NULL DEFAULT 'registered',
  moderation_status ENUM('approved','pending','rejected') NOT NULL DEFAULT 'approved',
  moderated_by      INT          NULL,
  moderated_at      DATETIME     NULL,
  moderation_note   VARCHAR(255) NULL,
  guest_contact_name  VARCHAR(120) NULL,   -- optional, staff-only: never rendered on a public page
  guest_contact_email VARCHAR(160) NULL,   -- optional, staff-only
  guest_contact_phone VARCHAR(20)  NULL,   -- optional, staff-only
  submitter_ip_hash CHAR(64)     NULL,     -- HMAC of the guest's IP (never the raw IP); used only for rate limits and spam review
  kind              ENUM('lost','found') NOT NULL,
  category_id       INT          NOT NULL,
  location_id       INT          NOT NULL,
  title             VARCHAR(120) NOT NULL,
  description       VARCHAR(1000) NOT NULL,
  occurred_on       DATE         NOT NULL,
  holding_location  VARCHAR(160) NULL,     -- required when kind='found'; see CHECK below
  photo_url         VARCHAR(500) NULL,     -- optional http(s) link to a photo of the item
  status            ENUM('open','matched','claimed','returned','archived') NOT NULL DEFAULT 'open',
  archived_reason   VARCHAR(255) NULL,
  returned_to       VARCHAR(120) NULL,
  returned_at       DATETIME     NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_reports_reference_no (reference_no),
  CONSTRAINT chk_reports_holding_location
    CHECK (kind <> 'found' OR holding_location IS NOT NULL),
  -- A report is EITHER registered (has an owner) OR a guest report (has none).
  -- Enforced here as well as in routes/reports.js, same defence-in-depth idea
  -- as chk_reports_holding_location above.
  CONSTRAINT chk_reports_submitter
    CHECK ((submitter_type = 'registered' AND user_id IS NOT NULL)
        OR (submitter_type = 'guest'      AND user_id IS NULL)),
  CONSTRAINT fk_reports_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reports_moderated_by
    FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_category
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reports_location
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
  INDEX idx_reports_kind_status   (kind, status),
  INDEX idx_reports_category_date (category_id, occurred_on),
  INDEX idx_reports_user          (user_id),
  INDEX idx_reports_moderation    (moderation_status, submitter_type),
  INDEX idx_reports_ip_created    (submitter_ip_hash, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- claims
--
-- WHY UNIQUE on (report_id, claimant_user_id): FR-05/FR-06's rule "one
-- claim per user per report" is exactly what this composite UNIQUE key
-- enforces — without it, a student could submit the same claim twice
-- (accidental double-submit, or an attempt to game the queue), and
-- staff would see duplicate rows for what is really one claim. Note
-- Post/Redirect/Get (303) already prevents the accidental refresh case;
-- this key is the belt-and-suspenders database guarantee against a
-- deliberate curl replay.
--
-- WHY ON DELETE CASCADE on claims (report_id): a claim only has meaning
-- in the context of the report it claims; if a report is ever removed
-- (not exposed anywhere in this UI, but the schema stays correct if it
-- ever is), its claims are meaningless orphan rows, so CASCADE is
-- correct here — contrast with fk_claims_claimant below, which stays
-- RESTRICT because a claim must always be traceable to who filed it.
-- ---------------------------------------------------------------------
CREATE TABLE claims (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  report_id                 INT NOT NULL,
  claimant_user_id          INT NOT NULL,
  proof_text                VARCHAR(1000) NOT NULL,
  distinguishing_features   VARCHAR(500)  NOT NULL,
  status                    ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  decided_by                INT NULL,
  decided_at                DATETIME NULL,
  decision_note             VARCHAR(255) NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_claim_per_user (report_id, claimant_user_id),
  CONSTRAINT fk_claims_report
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_claims_claimant
    FOREIGN KEY (claimant_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_claims_decided_by
    FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_claims_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- report_comments
-- FR-12: a lightweight "I remembered something" thread on the owner's
-- own report. CASCADE on report_id for the same reason as claims above
-- — a comment has no independent meaning once its report is gone.
-- RESTRICT on user_id for the same audit-trail reason as reports.user_id.
-- ---------------------------------------------------------------------
CREATE TABLE report_comments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  report_id   INT NOT NULL,
  user_id     INT NOT NULL,
  body        VARCHAR(500) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comments_report
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- report_status_history
-- NFR-08 ("any report can be traced back... via an append-only status
-- history table"). Every status-changing POST route writes exactly one
-- row here before redirecting. CASCADE on report_id: if a report is
-- ever hard-deleted, its history is meaningless without it. RESTRICT on
-- changed_by: the whole point of this table is "who changed what,
-- when" — losing that identity by nulling it out on a user delete would
-- defeat the table's purpose, so the user row must be kept (or the
-- history row reassigned) instead.
-- ---------------------------------------------------------------------
CREATE TABLE report_status_history (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  report_id    INT NOT NULL,
  from_status  VARCHAR(20) NULL,
  to_status    VARCHAR(20) NOT NULL,
  changed_by   INT NOT NULL,
  note         VARCHAR(255) NULL,
  changed_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_history_report
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_changed_by
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- bookmarks
-- FR-18. Composite primary key (user_id, report_id) instead of a
-- surrogate id: a bookmark is inherently the pair itself ("this user
-- bookmarked this report"), there is never a reason to reference a
-- bookmark row by any other identity, and the composite PK doubles as
-- the "no duplicate bookmark" constraint for free. CASCADE both ways:
-- a bookmark is purely a convenience pointer with no audit-trail
-- purpose, so it should simply disappear if either side disappears.
-- ---------------------------------------------------------------------
CREATE TABLE bookmarks (
  user_id     INT NOT NULL,
  report_id   INT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, report_id),
  CONSTRAINT fk_bookmarks_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_bookmarks_report
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- schema.sql -- ADDITIONS (append to the END of the existing schema.sql)
-- Feature 2: tags (many-to-many).  
-- Every statement is idempotent (IF NOT EXISTS / INSERT IGNORE), so this
-- block can be run once against an existing database without a reset.
-- =====================================================================

USE whereitis;

-- ---------------------------------------------------------------------
-- tags + report_tags
--
-- WHY a tags table + a join table (many-to-many) instead of a
-- comma-separated column on reports: a report can carry several tags and
-- a tag can sit on many reports. With a join table the database can
-- index and filter it (WHERE tg.slug = ?), enforce that only real tags
-- are attached (foreign keys), and count usage with a plain GROUP BY. A
-- comma-separated string would force LIKE '%urgent%' scans that cannot
-- use an index and would also match partial words.
--
-- WHY the tag list is FIXED (five seeded rows, no "create a tag" page):
-- a fixed allow-list keeps the filter dropdown short and predictable and
-- avoids near-duplicate tags ("urgent", "Urgent!", "urgnt"). A
-- tag-management screen is out of scope this term (Weeks 1-8).
--
-- Composite PK (report_id, tag_id) doubles as the "no duplicate tag on
-- one report" rule. ON DELETE CASCADE on both sides: a tag link has no
-- meaning once either the report or the tag is gone. idx_report_tags_tag
-- serves the reverse lookup "all reports carrying this tag".
   -- Fixed allow-list of tags. A dedicated table (not a comma-separated
   -- column on reports) so we can index and filter cleanly.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id INT PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(40) NOT NULL UNIQUE,
  label VARCHAR(60) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_tags (
  report_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (report_id, tag_id),
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)    REFERENCES tags(id)    ON DELETE CASCADE,
  INDEX idx_report_tags_tag (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed the allow-list. These five are fixed.
INSERT IGNORE INTO tags (slug, label, sort_order) VALUES
  ('urgent',      'Urgent',      1),
  ('electronics', 'Electronics', 2),
  ('documents',   'Documents',   3),
  ('clothing',    'Clothing',    4),
  ('accessories', 'Accessories', 5);

-- =====================================================================
-- schema.sql -- ADDITIONS (append to the END of the existing schema.sql)
-- Feature 2: tags (many-to-many).  
-- Every statement is idempotent (IF NOT EXISTS / INSERT IGNORE), so this
-- block can be run once against an existing database without a reset.
-- =====================================================================

USE whereitis;

-- ---------------------------------------------------------------------
-- tags + report_tags
--
-- WHY a tags table + a join table (many-to-many) instead of a
-- comma-separated column on reports: a report can carry several tags and
-- a tag can sit on many reports. With a join table the database can
-- index and filter it (WHERE tg.slug = ?), enforce that only real tags
-- are attached (foreign keys), and count usage with a plain GROUP BY. A
-- comma-separated string would force LIKE '%urgent%' scans that cannot
-- use an index and would also match partial words.
--
-- WHY the tag list is FIXED (five seeded rows, no "create a tag" page):
-- a fixed allow-list keeps the filter dropdown short and predictable and
-- avoids near-duplicate tags ("urgent", "Urgent!", "urgnt"). A
-- tag-management screen is out of scope this term (Weeks 1-8).
--
-- Composite PK (report_id, tag_id) doubles as the "no duplicate tag on
-- one report" rule. ON DELETE CASCADE on both sides: a tag link has no
-- meaning once either the report or the tag is gone. idx_report_tags_tag
-- serves the reverse lookup "all reports carrying this tag".
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id INT PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(40) NOT NULL UNIQUE,
  label VARCHAR(60) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_tags (
  report_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (report_id, tag_id),
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)    REFERENCES tags(id)    ON DELETE CASCADE,
  INDEX idx_report_tags_tag (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed the allow-list. These five are fixed.
INSERT IGNORE INTO tags (slug, label, sort_order) VALUES
  ('urgent',      'Urgent',      1),
  ('electronics', 'Electronics', 2),
  ('documents',   'Documents',   3),
  ('clothing',    'Clothing',    4),
  ('accessories', 'Accessories', 5);


-- =====================================================================
-- schema.sql -- ADDITIONS: registered-user features
-- (notifications, direct messages). Same content lives in
-- add-guest-reports.sql for databases that already exist.
-- =====================================================================

-- ---------------------------------------------------------------------
-- notifications
-- In-app only (this system sends no email). One row per thing a
-- registered user should hear about: someone filed a claim on their
-- report, staff changed its status, a claim was decided, a new direct
-- message arrived. `link` is a same-site path so the list can deep-link.
-- CASCADE on user_id/report_id: a notification is a pointer with no audit
-- value of its own (the audit trail is report_status_history).
-- idx_notifications_user_unread serves the nav badge, which runs on
-- every page for a signed-in user.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- conversations + messages (direct messaging between registered users)
-- A conversation is always ABOUT one report: it is opened by someone
-- looking at a report (starter) and talks to that report's owner. That
-- keeps messaging purposeful (no open-ended DMs between students) and
-- gives staff context if a thread is ever reported.
-- UNIQUE (report_id, starter_user_id): one thread per person per report,
-- so pressing "Message" twice reopens the thread instead of forking it.
-- RESTRICT on the two user keys for the same traceability reason as
-- reports.user_id. messages.read_at is NULL until the recipient opens
-- the thread.
-- ---------------------------------------------------------------------
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
