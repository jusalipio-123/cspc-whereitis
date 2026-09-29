// middleware/identity.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// "Who am I" — deliberate midterm substitute for express-session.
//
// Two entry points now exist:
//   - optionalIdentity: parses the whereitis_id cookie (if any), sets
//     req.identity to { userId, studentNo } or null, and ALWAYS calls
//     next(). Safe to mount globally on every request (Deliverable E) —
//     it never redirects, so guest browsing is never interrupted.
//   - requireIdentity: a route guard. Since optionalIdentity now runs
//     globally before any route handler, requireIdentity no longer needs
//     to re-parse the cookie itself — it just checks whatever
//     optionalIdentity already put on req.identity and redirects (303)
//     to the sign-in form if it's missing.
//
// Mechanism, cookie name, HMAC signing, and 30-minute lifetime are
// UNCHANGED from the original design — see README "Identification
// Without Sessions — Midterm Approach". This remains a deliberate
// midterm compromise; real login, bcrypt, and express-session replace
// this entire file in Week 11.
// -----------------------------------------------------------------------

let hmac;
try {
  hmac = require('../lib/hmac');
} catch (err) {
  console.warn(`[middleware/identity] Warning: lib/hmac not available yet (${err.message})`);
  hmac = null;
}

const COOKIE_NAME = 'whereitis_id';

function parseCookieHeader(header) {
  const jar = {};
  if (!header) return jar;
  header.split(';').forEach((pair) => {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) return;
    const key = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (!key) return;
    try {
      jar[key] = decodeURIComponent(value);
    } catch (err) {
      jar[key] = value;
    }
  });
  return jar;
}

// optionalIdentity: the one middleware mounted globally in app.js. Parses
// the cookie, sets req.identity, and also stashes the current path on
// res.locals.currentPath so any view (e.g. the nav's sign-out form) can
// build a "return here after sign-out" hidden field without every route
// having to remember to pass it in manually.
function optionalIdentity(req, res, next) {
  req.cookies = parseCookieHeader(req.headers.cookie);
  req.identity = null;
  res.locals.currentPath = req.originalUrl;

  const raw = req.cookies[COOKIE_NAME];

  if (raw && hmac) {
    try {
      const parts = raw.split('.');
      if (parts.length === 4) {
        const [userIdStr, studentNo, expiryStr, signature] = parts;
        const payload = `${userIdStr}.${studentNo}.${expiryStr}`;
        const expiry = Number(expiryStr);

        const isSignatureValid = hmac.verify(payload, signature);
        const isNotExpired = Number.isFinite(expiry) && expiry > Date.now();

        if (isSignatureValid && isNotExpired) {
          req.identity = {
            userId: Number(userIdStr),
            studentNo,
          };
        }
      }
    } catch (err) {
      // Any parsing/verification failure just means "not signed in" —
      // never throw here, a malformed cookie must not crash the request.
      req.identity = null;
    }
  }

  next();
}

// requireIdentity: route guard. Assumes optionalIdentity already ran
// (it is mounted globally), so it simply checks req.identity. Redirects
// 303 so the following request is a safe GET (Post/Redirect/Get still
// applies even to this redirect-to-sign-in case).
function requireIdentity(req, res, next) {
  if (!req.identity) {
    return res.redirect(303, '/my-reports/sign-in');
  }
  next();
}

module.exports = optionalIdentity;
module.exports.optionalIdentity = optionalIdentity;
module.exports.requireIdentity = requireIdentity;