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
    'SELECT id, student_no, full_name, email, role FROM users WHERE student_no = ?',
    [studentNo]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await db.pool.query(
    'SELECT id, student_no, full_name, email, role FROM users WHERE id = ?',
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
    'SELECT id, student_no, full_name, email, pin_salt, pin_hash, role FROM users WHERE student_no = ?',
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
    email: user.email,          // ← ADD THIS
    role: user.role
  };
}

// create: seeds/admin-creates a new demo account — generates a random salt and derives pin_hash from it.
async function create(data) {
  const pinSalt = crypto.randomBytes(16).toString('hex');
  const pinHash = crypto.createHash('sha256').update(pinSalt + data.pin).digest('hex');

  const [result] = await pool.execute(
    `INSERT INTO users (student_no, full_name, email, role, pin_salt, pin_hash, contact_no)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.student_no,
      data.full_name,
      data.email,
      data.role || 'student',
      pinSalt,
      pinHash,
      data.contact_no || null,
    ]
  );
  return findById(result.insertId);
}

// listAll: admin user-management screen.
async function listAll() {
  const [rows] = await db.pool.execute('SELECT * FROM users ORDER BY full_name ASC');
  return rows;
}

// countByRole: admin dashboard — how many students/staff/admins exist.
async function countByRole() {
  const [rows] = await db.pool.execute('SELECT role, COUNT(*) AS total FROM users GROUP BY role');
  const counts = { student: 0, staff: 0, admin: 0 };
  rows.forEach((row) => {
    counts[row.role] = row.total;
  });
  return counts;
}

module.exports = {
  findByStudentNo,
  findById,
  verifyPin,
  create,
  listAll,
  countByRole,
};