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
  // If this is an old database that never had roles, keep its existing accounts
  // usable: ADM-*/STF-* IDs keep their meaning, everyone else is a student.
  const rolesAdded = !(await hasColumn('users', 'role'));

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

  if (rolesAdded) {
    await pool.query("UPDATE users SET role = 'admin' WHERE student_no LIKE 'ADM-%'");
    await pool.query("UPDATE users SET role = 'staff' WHERE student_no LIKE 'STF-%'");
    console.log('Database updated: existing admin/staff IDs given their roles');
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
}

module.exports = { run };
