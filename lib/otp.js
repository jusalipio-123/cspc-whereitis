// lib/otp.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// One-time email codes (6 digits) used to prove that someone can read mail at
// an address: registration, verifying an older unverified account, and
// password reset.
//
// Rules (all enforced here, not in the pages):
//   * a code is 6 random digits made with crypto.randomInt
//   * only a keyed hash (HMAC with PROCESS_SECRET) is stored, never the code
//   * a code works for 10 minutes and for ONE success
//   * 5 wrong guesses kill that code; a new one must be requested
//   * a new code can be requested once every 60 seconds per address and purpose
//   * one row per (purpose, email): asking again replaces the old code
//
// Purposes: 'register' (no account yet), 'verify' (existing unverified
// account), 'reset' (forgotten password).
// -----------------------------------------------------------------------

const crypto = require('crypto');
const hmac = require('./hmac');
const db = require('../db');

const PURPOSES = ['register', 'verify', 'reset'];
const CODE_TTL_MS = 10 * 60 * 1000;      // a code is good for 10 minutes
const MAX_ATTEMPTS = 5;                  // wrong guesses allowed per code
const RESEND_COOLDOWN_MS = 60 * 1000;    // between two emails to the same address
const CODE_RE = /^\d{6}$/;

// Per-IP cap on "send me a code" requests, so one visitor cannot use the site
// to flood inboxes or burn the daily email allowance. In memory (resets on restart).
const REQUESTS_PER_IP = 40;
const REQUEST_WINDOW_MS = 60 * 60 * 1000;
const ipRequests = new Map();            // ip -> { count, firstAt }

function pool() {
  return db.pool;
}

function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Keyed hash. The purpose and email are part of the input so a code issued for
// one address or purpose can never be replayed for another.
function hashCode(purpose, email, code) {
  return hmac.sign('otp.' + purpose + '.' + normEmail(email) + '.' + String(code));
}

function sameHash(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// requestGate: is this IP still allowed to ask for codes? Counts the request.
function requestGate(ip, now) {
  now = now || Date.now();
  const key = String(ip || 'unknown');
  let e = ipRequests.get(key);
  if (!e || now - e.firstAt >= REQUEST_WINDOW_MS) {
    e = { count: 0, firstAt: now };
    ipRequests.set(key, e);
  }
  e.count += 1;
  if (e.count > REQUESTS_PER_IP) {
    return { allowed: false, retryAfterMs: e.firstAt + REQUEST_WINDOW_MS - now };
  }
  return { allowed: true, retryAfterMs: 0 };
}

const sweep = setInterval(function () {
  const now = Date.now();
  for (const [k, e] of Array.from(ipRequests.entries())) {
    if (now - e.firstAt >= REQUEST_WINDOW_MS) ipRequests.delete(k);
  }
}, 10 * 60 * 1000);
if (sweep.unref) sweep.unref();

// issue: makes (and stores) a fresh code. Returns
//   { ok: true, code }                     -> email it
//   { ok: false, reason: 'cooldown', retryAfterMs }
async function issue(purpose, email) {
  if (!PURPOSES.includes(purpose)) throw new Error('Unknown OTP purpose');
  email = normEmail(email);
  const now = new Date();

  const [rows] = await pool().query(
    'SELECT sent_at FROM email_otps WHERE purpose = ? AND email = ?',
    [purpose, email]
  );
  if (rows[0] && rows[0].sent_at) {
    const wait = RESEND_COOLDOWN_MS - (now.getTime() - new Date(rows[0].sent_at).getTime());
    if (wait > 0) return { ok: false, reason: 'cooldown', retryAfterMs: wait };
  }

  const code = generateCode();
  await pool().execute(
    `INSERT INTO email_otps (purpose, email, code_hash, expires_at, attempts, sent_at)
     VALUES (?, ?, ?, ?, 0, ?)
     ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at),
                             attempts = 0, sent_at = VALUES(sent_at)`,
    [purpose, email, hashCode(purpose, email, code), new Date(now.getTime() + CODE_TTL_MS), now]
  );

  // Housekeeping: forget codes that expired more than a day ago.
  pool().execute('DELETE FROM email_otps WHERE expires_at < ?', [new Date(now.getTime() - 24 * 60 * 60 * 1000)])
    .catch(function () { /* best effort */ });

  return { ok: true, code };
}

// cooldownLeftMs: how long until a new code may be requested (0 = now). Lets the page
// show an accurate "Resend code in 42s" even after a reload.
async function cooldownLeftMs(purpose, email) {
  const [rows] = await pool().query(
    'SELECT sent_at FROM email_otps WHERE purpose = ? AND email = ?',
    [purpose, normEmail(email)]
  );
  if (!rows[0] || !rows[0].sent_at) return 0;
  return Math.max(0, RESEND_COOLDOWN_MS - (Date.now() - new Date(rows[0].sent_at).getTime()));
}

// discard: remove a code (used when the email could not be sent, so the person can retry at once).
async function discard(purpose, email) {
  await pool().execute('DELETE FROM email_otps WHERE purpose = ? AND email = ?', [purpose, normEmail(email)]);
}

// check: tests a code a person typed. Returns
//   { ok: true }
//   { ok: false, reason: 'format' | 'none' | 'expired' | 'locked' | 'invalid', attemptsLeft? }
// 'none' and 'expired' both mean "ask for a new code". A wrong guess is counted
// BEFORE the code is compared (one atomic UPDATE), so parallel guesses cannot beat the limit.
async function check(purpose, email, code) {
  email = normEmail(email);
  code = String(code || '').replace(/\s+/g, '');
  if (!CODE_RE.test(code)) return { ok: false, reason: 'format' };

  const now = new Date();
  const [upd] = await pool().execute(
    `UPDATE email_otps SET attempts = attempts + 1
      WHERE purpose = ? AND email = ? AND attempts < ? AND expires_at > ?`,
    [purpose, email, MAX_ATTEMPTS, now]
  );

  if (!upd.affectedRows) {
    const [rows] = await pool().query(
      'SELECT attempts, expires_at FROM email_otps WHERE purpose = ? AND email = ?',
      [purpose, email]
    );
    const row = rows[0];
    if (!row) return { ok: false, reason: 'none' };
    if (new Date(row.expires_at).getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'locked' };
  }

  const [rows] = await pool().query(
    'SELECT id, code_hash, attempts FROM email_otps WHERE purpose = ? AND email = ?',
    [purpose, email]
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: 'none' };

  if (sameHash(row.code_hash, hashCode(purpose, email, code))) {
    await pool().execute('DELETE FROM email_otps WHERE id = ?', [row.id]);   // single use
    return { ok: true };
  }
  const left = Math.max(0, MAX_ATTEMPTS - Number(row.attempts));
  return { ok: false, reason: left > 0 ? 'invalid' : 'locked', attemptsLeft: left };
}

function secondsText(ms) {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return s === 1 ? '1 second' : s + ' seconds';
}

module.exports = {
  PURPOSES, CODE_TTL_MS, MAX_ATTEMPTS, RESEND_COOLDOWN_MS, CODE_RE,
  generateCode, hashCode, requestGate, issue, cooldownLeftMs, discard, check, secondsText,
};
