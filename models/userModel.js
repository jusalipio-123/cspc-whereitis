// models/userModel.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Accounts and sign-in checks.
//
// PASSWORDS: new passwords are stored with scrypt (see lib/passwords.js) in
// users.password_hash. Nothing recoverable is kept.
//
// OLD 4-DIGIT PINs: accounts created before this change still have only the
// old SHA-256 pin_hash. They can sign in ONCE with their PIN, but the app then
// forces them to choose a real password (setPassword below), which erases the
// old PIN hash. After that the PIN no longer works.
// -----------------------------------------------------------------------

const crypto = require('crypto');
const db = require('../db');
const passwords = require('../lib/passwords');
const { pool } = db;

// findByStudentNo: looks up a user by the natural key typed at /my-reports/sign-in.
async function findByStudentNo(studentNo) {
  const [rows] = await db.pool.query(
    'SELECT id, student_no, full_name, email FROM users WHERE student_no = ?',
    [studentNo]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await db.pool.query(
    'SELECT id, student_no, full_name, email FROM users WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

function legacyPinMatches(row, pin) {
  if (!row.pin_salt || !row.pin_hash || !/^\d{4}$/.test(pin)) return false;
  const expected = Buffer.from(
    crypto.createHash('sha256').update(row.pin_salt + pin).digest('hex'),
    'utf8'
  );
  const stored = Buffer.from(String(row.pin_hash), 'utf8');
  return expected.length === stored.length && crypto.timingSafeEqual(expected, stored);
}

// verifyPassword: the sign-in check.
// Returns null on ANY failure (no such student number, wrong password) so the
// caller shows the SAME generic message either way. On success returns
// { user, legacy } where legacy === true means "matched the old PIN: make them
// set a new password before letting them in".
async function verifyPassword(studentNo, password) {
  const [rows] = await db.pool.query(
    'SELECT id, student_no, full_name, email, password_hash, pin_salt, pin_hash FROM users WHERE student_no = ?',
    [studentNo]
  );
  const row = rows[0];

  if (!row) {
    await passwords.dummyVerify(password);   // same work as a real check, so timing reveals nothing
    return null;
  }

  const user = { id: row.id, student_no: row.student_no, full_name: row.full_name, email: row.email };

  if (row.password_hash) {
    return (await passwords.verify(password, row.password_hash)) ? { user, legacy: false } : null;
  }

  // Old account, no password yet: accept the old PIN once.
  if (legacyPinMatches(row, password)) return { user, legacy: true };
  await passwords.dummyVerify(password);
  return null;
}

// setPassword: stores a new scrypt password and permanently erases any old PIN hash.
async function setPassword(userId, password) {
  const passwordHash = await passwords.hash(password);
  await pool.execute(
    'UPDATE users SET password_hash = ?, pin_salt = NULL, pin_hash = NULL WHERE id = ?',
    [passwordHash, userId]
  );
}

// create: registers a new account with a scrypt-hashed password.
async function create(data) {
  const passwordHash = await passwords.hash(data.password);

  const [result] = await pool.execute(
    `INSERT INTO users (student_no, full_name, email, password_hash, contact_no)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.student_no,
      data.full_name,
      data.email,
      passwordHash,
      data.contact_no || null,
    ]
  );
  return findById(result.insertId);
}

// emailExists / studentNoExists: friendly pre-checks for the register form.
// The UNIQUE keys in schema.sql remain the real guarantee (see register route).
async function emailExists(email) {
  const [rows] = await db.pool.query('SELECT 1 FROM users WHERE email = ? LIMIT 1', [email]);
  return rows.length > 0;
}

module.exports = {
  findByStudentNo,
  findById,
  verifyPassword,
  setPassword,
  create,
  emailExists,
};
