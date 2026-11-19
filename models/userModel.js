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
    'SELECT id, student_no, full_name, email, email_verified_at, password_hash, pin_salt, pin_hash FROM users WHERE student_no = ?',
    [studentNo]
  );
  const row = rows[0];

  if (!row) {
    await passwords.dummyVerify(password);   // same work as a real check, so timing reveals nothing
    return null;
  }

  const user = {
    id: row.id, student_no: row.student_no, full_name: row.full_name, email: row.email,
    email_verified: !!row.email_verified_at,
  };

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

// ---------------------------------------------------------------------
// Email verification. Only the SHA-256 of the token is stored, so a leaked
// database cannot be used to verify accounts. The raw token exists only in
// the email we send.
// ---------------------------------------------------------------------
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESEND_COOLDOWN_MS = 60 * 1000;            // 1 minute between emails

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// issueVerificationToken: makes a fresh token for the user (replacing any old one) and returns it.
async function issueVerificationToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.execute(
    'UPDATE users SET verify_token_hash = ?, verify_token_expires = ?, verify_sent_at = ? WHERE id = ?',
    [hashToken(token), new Date(Date.now() + VERIFY_TOKEN_TTL_MS), new Date(), userId]
  );
  return token;
}

async function findByEmail(email) {
  const [rows] = await db.pool.query(
    'SELECT id, student_no, full_name, email, email_verified_at, verify_sent_at FROM users WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

async function findByVerificationToken(token) {
  const [rows] = await db.pool.query(
    'SELECT id, email_verified_at, verify_token_expires FROM users WHERE verify_token_hash = ?',
    [hashToken(token)]
  );
  return rows[0] || null;
}

async function markEmailVerified(userId) {
  const [result] = await pool.execute(
    'UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL',
    [new Date(), userId]
  );
  return result.affectedRows > 0;
}

// ---------------------------------------------------------------------
// Pending registrations. A new sign-up is NOT an account yet: the details wait in
// pending_registrations until the person clicks the emailed link. Only then is a
// real row created in users (already marked verified). An invented email address
// therefore never becomes an account, and never blocks a real student's email.
// ---------------------------------------------------------------------
async function purgeExpiredPending() {
  await pool.execute('DELETE FROM pending_registrations WHERE token_expires < ?', [new Date()]);
}

// createPending: stores the sign-up (password already hashed) and returns the raw token to email.
async function createPending(data) {
  const passwordHash = await passwords.hash(data.password);
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  // Registering again with the same email or student number replaces the earlier pending attempt.
  await pool.execute('DELETE FROM pending_registrations WHERE email = ? OR student_no = ?', [data.email, data.student_no]);
  await pool.execute(
    `INSERT INTO pending_registrations
       (student_no, full_name, email, contact_no, password_hash, token_hash, token_expires, sent_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.student_no, data.full_name, data.email, data.contact_no || null, passwordHash,
      hashToken(token), new Date(now.getTime() + VERIFY_TOKEN_TTL_MS), now, now,
    ]
  );
  return { email: data.email, full_name: data.full_name, token };
}

async function findPendingByToken(token) {
  const [rows] = await db.pool.query('SELECT * FROM pending_registrations WHERE token_hash = ?', [hashToken(token)]);
  return rows[0] || null;
}

async function findPendingByEmail(email) {
  const [rows] = await db.pool.query('SELECT * FROM pending_registrations WHERE email = ?', [email]);
  return rows[0] || null;
}

// reissuePendingToken: new link for a pending sign-up (resend button). Returns the raw token.
async function reissuePendingToken(id) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  await pool.execute(
    'UPDATE pending_registrations SET token_hash = ?, token_expires = ?, sent_at = ? WHERE id = ?',
    [hashToken(token), new Date(now.getTime() + VERIFY_TOKEN_TTL_MS), now, id]
  );
  return token;
}

// promotePending: the link was clicked. Creates the real, already-verified account.
// Returns { ok: true } or { ok: false } if the student number or email was taken meanwhile.
async function promotePending(row) {
  try {
    await pool.execute(
      `INSERT INTO users (student_no, full_name, email, password_hash, contact_no, email_verified_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.student_no, row.full_name, row.email, row.password_hash, row.contact_no || null, new Date()]
    );
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      await pool.execute('DELETE FROM pending_registrations WHERE id = ?', [row.id]);
      return { ok: false };
    }
    throw err;
  }
  await pool.execute('DELETE FROM pending_registrations WHERE id = ?', [row.id]);
  return { ok: true };
}

module.exports = {
  RESEND_COOLDOWN_MS,
  issueVerificationToken,
  findByEmail,
  findByVerificationToken,
  markEmailVerified,
  findByStudentNo,
  findById,
  verifyPassword,
  setPassword,
  create,
  emailExists,
  purgeExpiredPending,
  createPending,
  findPendingByToken,
  findPendingByEmail,
  reissuePendingToken,
  promotePending,
};
