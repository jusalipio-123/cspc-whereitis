// lib/sessionStore.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Database-backed sign-in sessions (stored in MySQL, not in server memory).
//
// OFF BY DEFAULT. Nothing changes unless SESSION_STORE=db is set in the
// environment. With it unset, the app keeps using the signed-cookie login
// exactly as before.
//
// When ON:
//   - the whereitis_id cookie holds only a random session id (not user data);
//   - the matching row in the `sessions` table says who the user is;
//   - sessions survive redeploys/restarts and can be revoked by deleting the row;
//   - only a SHA-256 hash of the id is stored, so a leaked database copy
//     cannot be used to sign in as anyone.
//
// Safety: every function here fails soft. If the database is unreachable or
// the table cannot be created, create() returns null (the caller falls back to
// the old signed cookie) and get() returns null (the visitor is simply "not
// signed in"). It never throws into a request.
// -----------------------------------------------------------------------

const crypto = require('crypto');
const { pool } = require('../db');

function enabled() {
  return (process.env.SESSION_STORE || '').toLowerCase() === 'db';
}

function hashId(sid) {
  return crypto.createHash('sha256').update(String(sid)).digest('hex');
}

// A session id is exactly 64 hex characters.
function looksLikeSid(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS sessions (
           id          CHAR(64)    NOT NULL PRIMARY KEY,
           user_id     INT         NOT NULL,
           student_no  VARCHAR(64) NOT NULL,
           expires_ms  BIGINT      NOT NULL,
           KEY idx_sessions_expires (expires_ms)
         ) ENGINE=InnoDB`
      )
      .catch((err) => {
        tableReady = null; // try again on the next request
        throw err;
      });
  }
  return tableReady;
}

// Returns the new session id, or null if the session could not be saved.
async function create(user, maxAgeMs) {
  try {
    await ensureTable();
    const sid = crypto.randomBytes(32).toString('hex');
    await pool.query(
      'INSERT INTO sessions (id, user_id, student_no, expires_ms) VALUES (?, ?, ?, ?)',
      [hashId(sid), user.id, String(user.student_no), Date.now() + maxAgeMs]
    );
    return sid;
  } catch (err) {
    console.error('[sessionStore] create failed, using signed cookie instead:', err.message);
    return null;
  }
}

// Returns { userId, studentNo } for a valid, unexpired session, else null.
async function get(sid) {
  if (!looksLikeSid(sid)) return null;
  try {
    await ensureTable();
    const [rows] = await pool.query(
      'SELECT user_id, student_no FROM sessions WHERE id = ? AND expires_ms > ? LIMIT 1',
      [hashId(sid), Date.now()]
    );
    if (!rows.length) return null;
    return { userId: Number(rows[0].user_id), studentNo: rows[0].student_no };
  } catch (err) {
    console.error('[sessionStore] lookup failed:', err.message);
    return null;
  }
}

async function destroy(sid) {
  if (!looksLikeSid(sid)) return;
  try {
    await ensureTable();
    await pool.query('DELETE FROM sessions WHERE id = ?', [hashId(sid)]);
  } catch (err) {
    console.error('[sessionStore] destroy failed:', err.message);
  }
}

// Remove expired rows now and then so the table stays small.
if (enabled()) {
  const timer = setInterval(async () => {
    try {
      await ensureTable();
      await pool.query('DELETE FROM sessions WHERE expires_ms <= ?', [Date.now()]);
    } catch (err) {
      console.error('[sessionStore] cleanup failed:', err.message);
    }
  }, 60 * 60 * 1000);
  timer.unref();
}

module.exports = { enabled, create, get, destroy, looksLikeSid };
