// routes/myReports.js
// Rule: every POST redirects with 303 and shows a flash. Every GET is safe and
// idempotent. Client-side required attributes are convenience only — anyone
// can send this request with curl and skip the form entirely, so we always
// validate on the server.
//
// The /my-reports page uses a signed HttpOnly cookie called whereitis_id, NOT
// a session. See README "Identification Without Sessions — Midterm Approach".
// Week 11 replaces this with express-session + bcrypt.
//
// ROUTE PATHS: every route below is defined with its FULL path, including
// /my-reports where that's the "real" location — this file is mounted at
// '/' (root) in app.js, NOT at '/my-reports', so there is no double-mount
// and no collision risk. /sign-in and /sign-out are genuinely separate,
// shorter route definitions (UX aliases), not re-mounts of the same path.

const express = require('express');
const router = express.Router();
const userModel = require('../models/userModel');
const reportModel = require('../models/reportModel');
const claimModel = require('../models/claimModel');
const bookmarkModel = require('../models/bookmarkModel');
const hmac = require('../lib/hmac');
const { requireIdentity } = require('../middleware/identity');
const validate = require('../middleware/validate');

const COOKIE_NAME = 'whereitis_id';
const COOKIE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

function buildCookieValue(userId, studentNo, expiresAtMs) {
  const payload = `${userId}.${studentNo}.${expiresAtMs}`;
  const sig = hmac.sign(payload);
  return `${payload}.${sig}`;
}

// isSafeRelativePath: accepts only same-site relative paths starting with
// a single "/" — rejects protocol-relative ("//evil.com") and absolute
// URLs ("https://evil.com") to avoid an open-redirect via ?next=.
function isSafeRelativePath(path) {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.includes('://')
  );
}

// ---------------------------------------------------------------------
// Named handlers — each registered at BOTH its "real" /my-reports/*
// path and its shorter UX-alias path (where one exists), so the exact
// same logic runs no matter which URL the person used to get there.
// UX alias only. Real authentication remains Week 11.
// ---------------------------------------------------------------------

// GET /my-reports
async function myReportsIndexHandler(req, res, next) {
  try {
    const [reports, claims, bookmarks] = await Promise.all([
      reportModel.findByUser(req.identity.userId),
      claimModel.listByUser(req.identity.userId),
      bookmarkModel.listByUser(req.identity.userId),
    ]);

    res.render('myReports/index', {
      title: 'My Reports',
      reports,
      claims,
      bookmarks,
      identity: req.identity,
    });
  } catch (err) {
    next(err);
  }
}

// GET /my-reports/sign-in, GET /sign-in
function signInFormHandler(req, res) {
  if (req.identity) {
    return res.redirect(303, '/my-reports');
  }

  const nextPath = isSafeRelativePath(req.query.next) ? req.query.next : '';

  res.render('myReports/signIn', {
    title: 'Sign in to My Reports',
    values: {},
    errors: {},
    next: nextPath,
  });
}

// POST /my-reports/sign-in, POST /sign-in
async function signInSubmitHandler(req, res, next) {
  try {
    const errors = {};
    const nextPath = isSafeRelativePath(req.body.next) ? req.body.next : '';

    const studentNoResult = validate.compose(
      validate.required('Student number'),
      validate.maxLen(20, 'Student number')
    )(req.body.student_no);
    if (!studentNoResult.ok) errors.student_no = studentNoResult.error;

    const pinRaw = String(req.body.pin || '').trim();
    const pinShapeOk = /^\d{4}$/.test(pinRaw);
    if (!pinShapeOk) {
      errors.pin = 'PIN must be exactly 4 digits.';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).render('myReports/signIn', {
        title: 'Sign in to My Reports',
        values: { student_no: req.body.student_no },
        errors,
        next: nextPath,
      });
    }

    const user = await userModel.verifyPin(studentNoResult.value, pinRaw);

    // We deliberately do NOT reveal whether the student_no exists or the
    // PIN was wrong — the same generic message either way prevents
    // account enumeration.
    if (!user) {
      return res.status(401).render('myReports/signIn', {
        title: 'Sign in to My Reports',
        values: { student_no: req.body.student_no },
        errors: { pin: 'Student number and PIN do not match our records.' },
        next: nextPath,
      });
    }

    // Soft policy check (not authentication) — @cspc.edu.ph accounts only.
    if (!user.email || !user.email.toLowerCase().endsWith('@cspc.edu.ph')) {
      return res.status(403).render('myReports/signIn', {
        title: 'Sign in to My Reports',
        values: { student_no: req.body.student_no },
        errors: {
          student_no:
            'This midterm is restricted to @cspc.edu.ph accounts. Contact the IT office if you believe this is a mistake.',
        },
        next: nextPath,
      });
    }

    const expiresAt = Date.now() + COOKIE_MAX_AGE_MS;
    const value = buildCookieValue(user.id, user.student_no, expiresAt);

    res.cookie(COOKIE_NAME, value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    });

    const destination = nextPath || '/my-reports';
    const sep = destination.includes('?') ? '&' : '?';
    res.redirect(303, `${destination}${sep}flash=ok:Signed%20in`);
  } catch (err) {
    next(err);
  }
}

// POST /my-reports/sign-out, POST /sign-out
function signOutHandler(req, res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });

  const nextPath = isSafeRelativePath(req.body.next) ? req.body.next : '/';
  const sep = nextPath.includes('?') ? '&' : '?';
  res.redirect(303, `${nextPath}${sep}flash=ok:Signed%20out%20of%20My%20Reports`);
}

// ---------------------------------------------------------------------
// Route registration — "real" paths and UX-alias paths both point at
// the same named handler above.
// ---------------------------------------------------------------------
router.get('/my-reports', requireIdentity, myReportsIndexHandler);

router.get('/my-reports/sign-in', signInFormHandler);
router.get('/sign-in', signInFormHandler);

router.post('/my-reports/sign-in', signInSubmitHandler);
router.post('/sign-in', signInSubmitHandler);

router.post('/my-reports/sign-out', signOutHandler);
router.post('/sign-out', signOutHandler);

module.exports = router;