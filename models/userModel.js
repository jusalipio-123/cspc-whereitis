// models/userModel.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Accounts and sign-in checks.
//
// PASSWORDS: new passwords are stored with scrypt (see lib/passwords.js) in
// users.password_hash. Nothing recoverable is kept.
//
// SIGN-IN: the natural key is the EMAIL ADDRESS. Existing accounts are
// preserved: their id, student_no (now shown as "ID number"), password hash,
// PIN fallback, reports and role are untouched.
//
// ROLES: 'user' is the existing value for a Student account. 'staff',
// 'teacher' and 'admin' areseparate roles. Registration can only create
// 'user', 'staff' or 'teacher'; admin is never a self-assignable option.
// -----------------------------------------------------------------------

const crypto = require('crypto');
const db = require('../db');
const passwords = require('../lib/passwords');
const { pool } = db;

// Roles the public registration page is allowed to create. 'admin' is
// deliberately absent and is enforced here as well as in the route.
const PUBLIC_ROLES = ['user', 'staff', 'teacher'];

async function findByStudentNo(studentNo) {
  const [rows] = await db.pool.query(
    'SELECT id, student_no, full_name, email, role FROM users WHERE student_no = ?',
    [studentNo]
  );
  return rows[0] || null;
}

async function studentNoExists(studentNo) {
  const [rows] = await db.pool.query('SELECT 1 FROM users WHERE student_no = ? LIMIT 1', [studentNo]);
  return rows.length > 0;
}

async function findById(id) {
  const [rows] = await db.pool.query(
    'SELECT id, student_no, full_name, email, role, contact_no, email_verified_at FROM users WHERE id = ?',
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
// Returns null on ANY failure (no such email, wrong password) so the caller
// shows the SAME generic message either way. On success returns
// { user, legacy } where legacy === true means "matched the old PIN: make them
// set a new password before letting them in".
async function verifyPassword(email, password) {
  const [rows] = await db.pool.query(
    `SELECT id, student_no, full_name, email, role, email_verified_at,
            password_hash, pin_salt, pin_hash
       FROM users WHERE email = ?`,
    [email]
  );
  const row = rows[0];

  if (!row) {
    await passwords.dummyVerify(password);   // same work as a real check, so timing reveals nothing
    return null;
  }

  const user = {
    id: row.id,
    student_no: row.student_no,
    full_name: row.full_name,
    email: row.email,
    role: row.role || 'user',
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
// `role` is sanitised by the caller AND here, so a crafted POST can never
// create an administrator.
async function create(data) {
  const passwordHash = await passwords.hash(data.password);
  const role = PUBLIC_ROLES.includes(data.role) ? data.role : 'user';

  const [result] = await pool.execute(
    `INSERT INTO users (student_no, full_name, email, password_hash, contact_no, role)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.student_no,
      data.full_name,
      data.email,
      passwordHash,
      data.contact_no || null,
      role,
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

// createGoogleUser: first-time Google sign-in. Google has already verified the
// email address (checked in routes/googleAuth.js), so the account starts
// verified and never needs a password. Password sign-in simply will not work
// for these accounts — that is intentional; use "Continue with Google".
async function createGoogleUser(data) {
  const [result] = await pool.execute(
    `INSERT INTO users (student_no, full_name, email, password_hash, role, email_verified_at)
     VALUES (?, ?, ?, NULL, 'user', NOW())`,
    [data.student_no, data.full_name, data.email]
  );
  return findById(result.insertId);
}

// Admin user management. Only public roles may be assigned; admin accounts
// are created by a database administrator, never through this method.
async function listUsers(limit = 200) {
  const safe = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const [rows] = await pool.execute(
    `SELECT id, student_no, full_name, email, role, contact_no,
            email_verified_at, created_at
       FROM users ORDER BY created_at DESC, id DESC LIMIT ?`,
    [String(safe)]
  );
  return rows;
}

async function updateRole(userId, role) {
  if (!PUBLIC_ROLES.includes(role)) return false;
  const [result] = await pool.execute(
    'UPDATE users SET role = ? WHERE id = ? AND role <> \'admin\'',
    [role, userId]
  );
  return result.affectedRows > 0;
}

// ---------------------------------------------------------------------
// Email verification. Only the SHA-256 of the token is stored, so a leaked
// database cannot be used to verify accounts. The raw token exists only in
// the email we send.
// ---------------------------------------------------------------------
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESEND_COOLDOWN_MS = 60 * 1000;            // 1 minute between emails
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;       // 1 hour for password resets
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;

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

// issuePasswordResetToken: same pattern, separate fields, so a verification
// link can never be used to change a password (or vice versa).
async function issuePasswordResetToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.execute(
    `UPDATE users SET reset_token_hash = ?, reset_token_expires = ?, reset_sent_at = ?
      WHERE id = ?`,
    [hashToken(token), new Date(Date.now() + RESET_TOKEN_TTL_MS), new Date(), userId]
  );
  return token;
}

async function clearPasswordResetToken(userId) {
  await pool.execute(
    'UPDATE users SET reset_token_hash = NULL, reset_token_expires = NULL, reset_sent_at = NULL WHERE id = ?',
    [userId]
  );
}

async function findByEmail(email) {
  const [rows] = await db.pool.query(
    `SELECT id, student_no, full_name, email, role, email_verified_at, verify_sent_at,
            reset_sent_at
       FROM users WHERE email = ?`,
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

async function findByPasswordResetToken(token) {
  const [rows] = await db.pool.query(
    `SELECT id, student_no, full_name, email, role, reset_token_expires
       FROM users WHERE reset_token_hash = ?`,
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

module.exports = {
  PUBLIC_ROLES,
  RESEND_COOLDOWN_MS,
  RESET_RESEND_COOLDOWN_MS,
  issueVerificationToken,
  issuePasswordResetToken,
  clearPasswordResetToken,
  findByEmail,
  findByVerificationToken,
  findByPasswordResetToken,
  markEmailVerified,
  findByStudentNo,
  studentNoExists,
  findById,
  verifyPassword,
  setPassword,
  create,
  createGoogleUser,
  emailExists,
  listUsers,
  updateRole,
};
