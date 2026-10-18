// models/userModel.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// MIDTERM COMPROMISE — DO NOT CARRY INTO PRODUCTION
// This uses SHA-256(salt || pin) with a per-user salt. SHA-256 is fast by
// design, so it is vulnerable to brute force on 4-digit PINs (only 10,000
// possible values). This is acceptable ONLY because:
//   (a) PINs here are demo-only, tied to seed data,
//   (b) Week 11 replaces this entire mechanism with bcrypt + express-session.
// Week 11 MUST replace every function in this file that touches pin_hash
// and pin_salt.
// -----------------------------------------------------------------------

const crypto = require('crypto');
const db = require('../db');
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

// verifyPin: the sign-in check itself. On any failure (no such student_no,
// or wrong PIN) this returns null and the caller must show the SAME
// generic "student number or PIN is incorrect" message either way —
// never distinguishing "no such user" from "wrong pin" in the UI, which
// would let an attacker enumerate valid student numbers one guess at a time.
async function verifyPin(studentNo, pin) {
  const [rows] = await db.pool.query(
    'SELECT id, student_no, full_name, email, pin_salt, pin_hash FROM users WHERE student_no = ?',
    [studentNo]
  );
  const user = rows[0];
  if (!user) return null;

  const expected = crypto.createHash('sha256').update(user.pin_salt + pin).digest('hex');
  if (expected !== user.pin_hash) return null;

  return {
    id: user.id,
    student_no: user.student_no,
    full_name: user.full_name,
    email: user.email,
  };
}

// create: registers a new account — generates a random salt and derives pin_hash from it.
async function create(data) {
  const pinSalt = crypto.randomBytes(16).toString('hex');
  const pinHash = crypto.createHash('sha256').update(pinSalt + data.pin).digest('hex');

  const [result] = await pool.execute(
    `INSERT INTO users (student_no, full_name, email, pin_salt, pin_hash, contact_no)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.student_no,
      data.full_name,
      data.email,
      pinSalt,
      pinHash,
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
  verifyPin,
  create,
  emailExists,
};