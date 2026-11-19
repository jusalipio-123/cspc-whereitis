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

async function run() {
  const columns = [
    ['categories', 'is_other', 'ALTER TABLE categories ADD COLUMN is_other TINYINT(1) NOT NULL DEFAULT 0'],
    ['locations', 'is_other', 'ALTER TABLE locations ADD COLUMN is_other TINYINT(1) NOT NULL DEFAULT 0'],
    ['reports', 'category_other', 'ALTER TABLE reports ADD COLUMN category_other VARCHAR(60) NULL AFTER category_id'],
    ['reports', 'location_other', 'ALTER TABLE reports ADD COLUMN location_other VARCHAR(120) NULL AFTER location_id'],
    // Strong passwords (scrypt) replace the old 4-digit PIN. Old accounts keep their PIN hash
    // until they sign in once and choose a new password.
    ['users', 'password_hash', 'ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER email'],
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

  // Pending registrations: a new sign-up is held here and only becomes a real account
  // (a row in users) after the person clicks the link emailed to them.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pending_registrations (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_no VARCHAR(20) NOT NULL,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(160) NOT NULL,
      contact_no VARCHAR(20) NULL,
      password_hash VARCHAR(255) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      token_expires DATETIME NOT NULL,
      sent_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      UNIQUE KEY uq_pending_email (email),
      UNIQUE KEY uq_pending_student (student_no),
      KEY idx_pending_token (token_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

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
}

module.exports = { run };
