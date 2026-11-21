// middleware/identity.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// "Who am I" — deliberate midterm substitute for express-session.
//
// Two entry points now exist:
//   - optionalIdentity: parses the whereitis_id cookie (if any), sets
//     req.identity to { userId, studentNo } or null, and ALWAYS calls
//     next(). Safe to mount globally on every request (Deliverable E) —
//     it never redirects, so anonymous browsing is never interrupted.
//   - requireIdentity: a route guard. Since optionalIdentity now runs
//     globally before any route handler, requireIdentity no longer needs
//     to re-parse the cookie itself — it just checks whatever
//     optionalIdentity already put on req.identity and redirects (303)
//     to the sign-in form if it's missing.
//
// The default credential is still the HMAC-signed `whereitis_id` cookie
// with a 30-minute lifetime (see README "Accounts, identity and roles").
// Accounts use scrypt passwords; the optional MySQL session store can be
// enabled with SESSION_STORE=db. Role checks never trust the cookie's
// role field — they re-read users.role from the database.
// -----------------------------------------------------------------------

// Fail loud: a missing hmac module would otherwise skip every cookie check
// and leave req.identity null for everyone (including signed-in staff).
const hmac = require('../lib/hmac');
const sessionStore = require('../lib/sessionStore');

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
      // New cookies carry the role too: <userId>.<studentNo>.<role>.<expiry>.<sig>.
      // Four-part cookies from before this update are still accepted; the role
      // is then resolved from the database by every requireRole() guard, so an
      // old cookie can never grant elevated access.
      if (parts.length === 5) {
        const [userIdStr, studentNo, role, expiryStr, signature] = parts;
        const payload = `${userIdStr}.${studentNo}.${role}.${expiryStr}`;
        const expiry = Number(expiryStr);

        if (hmac.verify(payload, signature) && Number.isFinite(expiry) && expiry > Date.now()) {
          req.identity = {
            userId: Number(userIdStr),
            studentNo,
            role: ['user', 'staff', 'teacher', 'admin'].includes(role) ? role : 'user',
          };
        }
      } else if (parts.length === 4) {
        const [userIdStr, studentNo, expiryStr, signature] = parts;
        const payload = `${userIdStr}.${studentNo}.${expiryStr}`;
        const expiry = Number(expiryStr);

        if (hmac.verify(payload, signature) && Number.isFinite(expiry) && expiry > Date.now()) {
          req.identity = {
            userId: Number(userIdStr),
            studentNo,
            role: null, // resolved from the database by requireRole()
          };
        }
      }
    } catch (err) {
      // Any parsing/verification failure just means "not signed in" —
      // never throw here, a malformed cookie must not crash the request.
      req.identity = null;
    }
  }

  // Optional database-backed session (only when SESSION_STORE=db). The signed
  // cookie above is still accepted, so nobody is signed out when it is switched on.
  if (!req.identity && raw && sessionStore && sessionStore.enabled() && sessionStore.looksLikeSid(raw)) {
    return sessionStore.get(raw).then(
      (found) => {
        req.identity = found || null;
        next();
      },
      () => {
        req.identity = null;
        next();
      }
    );
  }

  next();
}

// requireIdentity: route guard. Assumes optionalIdentity already ran
// (it is mounted globally), so it simply checks req.identity. Redirects
// 303 so the following request is a safe GET (Post/Redirect/Get still
// applies even to this redirect-to-sign-in case).
function requireIdentity(req, res, next) {
  if (req.identity) return next();

  // Send them to sign-in with ?next= so they land back where they were.
  // GET: the page they asked for. POST (e.g. a form submitted after the
  // 30-minute cookie expired): the same-site page the form was on, taken
  // from the Referer header, or the home page if there is none.
  let target = '/';
  if (req.method === 'GET') {
    target = req.originalUrl;
  } else {
    try {
      const ref = req.headers.referer;
      if (ref) {
        const u = new URL(ref);
        if (u.host === req.headers.host) target = u.pathname + u.search;
      }
    } catch (err) {
      target = '/';
    }
  }
  return res.redirect(303, '/sign-in?next=' + encodeURIComponent(target));
}

module.exports = optionalIdentity;
module.exports.optionalIdentity = optionalIdentity;
module.exports.requireIdentity = requireIdentity;