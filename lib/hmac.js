// lib/hmac.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Signs and verifies the "whereitis_id" cookie value used by
// middleware/identity.js — the midterm substitute for express-session.
//
// PROCESS_SECRET must be a long, random string (>=32 hex chars —
// e.g. generated with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`),
// loaded only from .env, NEVER hardcoded in source and NEVER committed
// to the repo. Anyone who obtains this secret could forge a signed
// cookie for any user id, so it is treated with the same seriousness a
// real session secret would get in Week 11.
// -----------------------------------------------------------------------

const crypto = require('crypto');

const SECRET = process.env.PROCESS_SECRET;

// Fail loudly and immediately at require time rather than letting every
// sign()/verify() call silently produce a garbage/empty-key signature —
// a missing secret is a configuration error that must stop the app, not
// a runtime edge case to handle per-request.
if (!SECRET || SECRET.length < 32) {
  throw new Error(
    'PROCESS_SECRET is missing or too short. Set PROCESS_SECRET in .env to a random string of at least 32 characters.'
  );
}

// sign: returns a hex-encoded HMAC-SHA256 digest of payload, keyed by
// PROCESS_SECRET. The payload itself (userId.studentNo.expiry) is never
// secret — only the signature proves the server issued it unmodified.
function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(String(payload)).digest('hex');
}

// verify: recomputes the expected signature for payload and compares it
// to the supplied signature using crypto.timingSafeEqual, which compares
// in constant time regardless of where the first differing byte is —
// a plain === comparison would leak timing information an attacker
// could use to guess a valid signature byte-by-byte.
function verify(payload, signature) {
  if (typeof signature !== 'string' || signature.length === 0) {
    return false;
  }

  const expected = sign(payload);

  const expectedBuf = Buffer.from(expected, 'hex');
  const suppliedBuf = Buffer.from(signature, 'hex');

  // Buffers of different lengths would throw inside timingSafeEqual —
  // guard first (this length check alone leaks only "wrong length",
  // not any byte content, which is an acceptable trade-off).
  if (expectedBuf.length !== suppliedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, suppliedBuf);
}

module.exports = { sign, verify };