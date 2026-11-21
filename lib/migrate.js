// lib/migrate.js
// Runs once at server start. If the database was created before the
// "Other (please specify)" feature, add the missing columns and the new
// categories / locations automatically, so nobody has to run SQL by hand.
// Safe to run on every start: it does nothing when everything is in place.
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function hasColumn(table, column) {
  const [rows] = await pool.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}

async function columnType(table, column) {
  const [rows] = await pool.query(
    'SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length ? String(rows[0].COLUMN_TYPE || '').toLowerCase() : '';
}

async function run() {
  const columns = [
    ['categories', 'is_other', 'ALTER TABLE categories ADD COLUMN is_other TINYINT(1) NOT NULL DEFAULT 0'],
    ['locations', 'is_other', 'ALTER TABLE locations ADD COLUMN is_other TINYINT(1) NOT NULL DEFAULT 0'],
    ['reports', 'category_other', 'ALTER TABLE reports ADD COLUMN category_other VARCHAR(60) NULL AFTER category_id'],
    ['reports', 'location_other', 'ALTER TABLE reports ADD COLUMN location_other VARCHAR(120) NULL AFTER location_id'],
    ['reports', 'photo_url', 'ALTER TABLE reports ADD COLUMN photo_url VARCHAR(500) NULL'],
    // Guest reports: no owner, hidden until staff approve, staff-only contact.
    ['reports', 'submitter_type', "ALTER TABLE reports ADD COLUMN submitter_type ENUM('registered','guest') NOT NULL DEFAULT 'registered' AFTER user_id"],
    ['reports', 'moderation_status', "ALTER TABLE reports ADD COLUMN moderation_status ENUM('approved','pending','rejected') NOT NULL DEFAULT 'approved' AFTER submitter_type"],
    ['reports', 'moderated_by', 'ALTER TABLE reports ADD COLUMN moderated_by INT NULL AFTER moderation_status'],
    ['reports', 'moderated_at', 'ALTER TABLE reports ADD COLUMN moderated_at DATETIME NULL AFTER moderated_by'],
    ['reports', 'moderation_note', 'ALTER TABLE reports ADD COLUMN moderation_note VARCHAR(255) NULL AFTER moderated_at'],
    ['reports', 'guest_contact_name', 'ALTER TABLE reports ADD COLUMN guest_contact_name VARCHAR(120) NULL AFTER moderation_note'],
    ['reports', 'guest_contact_email', 'ALTER TABLE reports ADD COLUMN guest_contact_email VARCHAR(160) NULL AFTER guest_contact_name'],
    ['reports', 'guest_contact_phone', 'ALTER TABLE reports ADD COLUMN guest_contact_phone VARCHAR(20) NULL AFTER guest_contact_email'],
    ['reports', 'submitter_ip_hash', 'ALTER TABLE reports ADD COLUMN submitter_ip_hash CHAR(64) NULL AFTER guest_contact_phone'],
    // Strong passwords (scrypt) replace the old 4-digit PIN. Old accounts keep their PIN hash
    // until they sign in once and choose a new password.
    ['users', 'password_hash', 'ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER email'],
    // Roles: student accounts keep the existing 'user' value. 'teacher' is new.
    ['users', 'role', "ALTER TABLE users ADD COLUMN role ENUM('user','staff','teacher','admin') NOT NULL DEFAULT 'user' AFTER contact_no"],
    // Forgot-password tokens (separate from email-verification tokens).
    ['users', 'reset_token_hash', 'ALTER TABLE users ADD COLUMN reset_token_hash CHAR(64) NULL AFTER verify_sent_at'],
    ['users', 'reset_token_expires', 'ALTER TABLE users ADD COLUMN reset_token_expires DATETIME NULL AFTER reset_token_hash'],
    ['users', 'reset_sent_at', 'ALTER TABLE users ADD COLUMN reset_sent_at DATETIME NULL AFTER reset_token_expires'],
  ];
  // Email verification. Accounts that existed before this feature are marked verified so nobody
  // is locked out; only accounts registered from now on must click the emailed link.
  const needsVerifyBackfill = !(await hasColumn('users', 'email_verified_at'));
  columns.push(
    ['users', 'email_verified_at', 'ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL'],
    ['users', 'verify_token_hash', 'ALTER TABLE users ADD COLUMN verify_token_hash CHAR(64) NULL'],
    ['users', 'verify_token_expires', 'ALTER TABLE users ADD COLUMN verify_token_expires DATETIME NULL'],
    ['users', 'verify_sent_at', 'ALTER TABLE users ADD COLUMN verify_sent_at DATETIME NULL'],
  );
  let changed = false;
  for (const [table, column, sql] of columns) {
    if (!(await hasColumn(table, column))) {
      await pool.query(sql);
      changed = true;
      console.log('Database updated: added ' + table + '.' + column);
    }
  }

  if (needsVerifyBackfill) {
    await pool.query('UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL');
    console.log('Database updated: existing accounts marked as email-verified');
  }

  // Seeded demo IDs keep their meaning on BOTH fresh installs and upgrades.
  // Only accounts still at the default 'user' are touched, so roles assigned
  // by an administrator are never overwritten on a later restart.
  const [adminUpdates] = await pool.query(
    "UPDATE users SET role = 'admin' WHERE student_no LIKE 'ADM-%' AND role = 'user'"
  );
  const [staffUpdates] = await pool.query(
    "UPDATE users SET role = 'staff' WHERE student_no LIKE 'STF-%' AND role = 'user'"
  );
  if (adminUpdates.affectedRows || staffUpdates.affectedRows) {
    console.log('Database updated: seeded admin/staff IDs given their roles');
  }

  // Older installs used ENUM('user','staff','admin'). Add 'teacher' without
  // touching a single existing role value.
  const roleType = await columnType('users', 'role');
  if (roleType && !roleType.includes("'teacher'")) {
    await pool.query("ALTER TABLE users MODIFY role ENUM('user','staff','teacher','admin') NOT NULL DEFAULT 'user'");
    console.log('Database updated: users.role now accepts teacher accounts');
  }

  // The old "Academic" copy of the CCS building now sits with the other CCS places.
  await pool.query("UPDATE locations SET zone = 'College of Computer Studies' WHERE name = 'College of Computer Studies Building' AND zone = 'Academic'");

  const [[row]] = await pool.query('SELECT COUNT(*) AS n FROM categories WHERE is_other = 1');
  if (row.n === 0) {
    const file = path.join(__dirname, '..', 'add-more-categories-locations.sql');
    const statements = fs.readFileSync(file, 'utf8')
      .split(/;\s*\n/)
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter((s) => s && !/^ALTER TABLE/i.test(s));
    for (const sql of statements) await pool.query(sql);
    console.log('Database updated: added more categories and CSPC campus locations');
  }

  // The old PIN columns must be allowed to be empty: new accounts do not have a PIN,
  // and upgraded accounts have theirs erased.
  const [pinCols] = await pool.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' " +
    "AND COLUMN_NAME IN ('pin_salt', 'pin_hash') AND IS_NULLABLE = 'NO'"
  );
  for (const c of pinCols) {
    const type = c.COLUMN_NAME === 'pin_salt' ? 'CHAR(32)' : 'CHAR(64)';
    await pool.query('ALTER TABLE users MODIFY ' + c.COLUMN_NAME + ' ' + type + ' NULL');
    console.log('Database updated: users.' + c.COLUMN_NAME + ' may now be empty');
  }

  // A guest report has no owner, so user_id must allow NULL.
  const [userIdCol] = await pool.query(
    "SELECT IS_NULLABLE FROM information_schema.COLUMNS " +
    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND COLUMN_NAME = 'user_id'"
  );
  if (userIdCol.length && userIdCol[0].IS_NULLABLE === 'NO') {
    await pool.query('ALTER TABLE reports MODIFY COLUMN user_id INT NULL');
    console.log('Database updated: reports.user_id may now be NULL');
  }

  // Tables added after the original schema. IF NOT EXISTS makes this safe
  // on every boot, including databases built from the very first schema.sql.
  const tables = [
    `CREATE TABLE IF NOT EXISTS tags (
       id INT PRIMARY KEY AUTO_INCREMENT,
       slug VARCHAR(40) NOT NULL UNIQUE,
       label VARCHAR(60) NOT NULL,
       sort_order INT NOT NULL DEFAULT 0
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS report_tags (
       report_id INT NOT NULL,
       tag_id INT NOT NULL,
       PRIMARY KEY (report_id, tag_id),
       FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
       FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
       INDEX idx_report_tags_tag (tag_id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS notifications (
       id INT AUTO_INCREMENT PRIMARY KEY,
       user_id INT NOT NULL,
       type ENUM('claim_filed','claim_decided','status_changed','message_received','comment_added') NOT NULL,
       report_id INT NULL,
       body VARCHAR(255) NOT NULL,
       link VARCHAR(200) NOT NULL,
       is_read TINYINT(1) NOT NULL DEFAULT 0,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
       CONSTRAINT fk_notifications_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
       INDEX idx_notifications_user_unread (user_id, is_read, created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS conversations (
       id INT AUTO_INCREMENT PRIMARY KEY,
       report_id INT NOT NULL,
       owner_user_id INT NOT NULL,
       starter_user_id INT NOT NULL,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       last_message_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       UNIQUE KEY uniq_conversation (report_id, starter_user_id),
       CONSTRAINT fk_conversations_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
       CONSTRAINT fk_conversations_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT,
       CONSTRAINT fk_conversations_starter FOREIGN KEY (starter_user_id) REFERENCES users(id) ON DELETE RESTRICT,
       INDEX idx_conversations_owner (owner_user_id, last_message_at),
       INDEX idx_conversations_starter (starter_user_id, last_message_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS messages (
       id INT AUTO_INCREMENT PRIMARY KEY,
       conversation_id INT NOT NULL,
       sender_user_id INT NOT NULL,
       body VARCHAR(1000) NOT NULL,
       read_at DATETIME NULL,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
       CONSTRAINT fk_messages_sender FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE RESTRICT,
       INDEX idx_messages_conversation (conversation_id, created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];
  for (const sql of tables) await pool.query(sql);
  await pool.query(
    `INSERT IGNORE INTO tags (slug, label, sort_order) VALUES
       ('urgent','Urgent',1), ('electronics','Electronics',2), ('documents','Documents',3),
       ('clothing','Clothing',4), ('accessories','Accessories',5)`
  );
}

module.exports = { run };
