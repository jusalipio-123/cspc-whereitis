// lib/loginLimiter.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Slows down password guessing on the sign-in form.
//
//   * 5 wrong attempts on ONE student number  -> that account is paused 15 minutes
//   * 20 wrong attempts from ONE IP address   -> that address is paused 15 minutes
//
// A correct sign-in clears the account's counter.
//
// It lives in memory (a Map), so it needs no extra package or table. Limits:
//   - the counters reset when the server restarts, and
//   - they are not shared if you ever run more than one server copy.
// If the app grows, move this to a database table or Redis.
// -----------------------------------------------------------------------

const WINDOW_MS = 15 * 60 * 1000;     // how long failures are remembered / how long a pause lasts
const MAX_PER_ACCOUNT = 5;
const MAX_PER_IP = 20;

const entries = new Map();            // key -> { count, firstAt, lockedUntil }

function accountKey(studentNo) {
  return 'acct:' + String(studentNo || '').trim().toLowerCase();
}
function ipKey(ip) {
  return 'ip:' + String(ip || 'unknown');
}

function live(key, now) {
  const e = entries.get(key);
  if (!e) return null;
  const expired = e.lockedUntil ? e.lockedUntil <= now : now - e.firstAt >= WINDOW_MS;
  if (expired) {
    entries.delete(key);
    return null;
  }
  return e;
}

function retryMs(key, now) {
  const e = live(key, now);
  return e && e.lockedUntil ? e.lockedUntil - now : 0;
}

// check: is this student number / IP currently paused? { limited, retryAfterMs }
function check(studentNo, ip, now) {
  now = now || Date.now();
  const wait = Math.max(retryMs(accountKey(studentNo), now), retryMs(ipKey(ip), now));
  return { limited: wait > 0, retryAfterMs: wait };
}

function bump(key, max, now) {
  let e = live(key, now);
  if (!e) {
    e = { count: 0, firstAt: now, lockedUntil: 0 };
    entries.set(key, e);
  }
  e.count += 1;
  if (e.count >= max) e.lockedUntil = now + WINDOW_MS;
}

// recordFailure: call after every wrong password (including unknown student numbers,
// so an attacker cannot tell real accounts apart by who gets paused).
function recordFailure(studentNo, ip, now) {
  now = now || Date.now();
  bump(accountKey(studentNo), MAX_PER_ACCOUNT, now);
  bump(ipKey(ip), MAX_PER_IP, now);
}

// recordSuccess: forgive the account (not the IP) after a correct sign-in.
function recordSuccess(studentNo) {
  entries.delete(accountKey(studentNo));
}

function minutesText(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m === 1 ? '1 minute' : m + ' minutes';
}

// Forget old entries so the Map cannot grow forever.
const sweep = setInterval(function () {
  const now = Date.now();
  for (const key of Array.from(entries.keys())) live(key, now);
}, 5 * 60 * 1000);
if (sweep.unref) sweep.unref();

module.exports = { check, recordFailure, recordSuccess, minutesText, MAX_PER_ACCOUNT, MAX_PER_IP, WINDOW_MS };
