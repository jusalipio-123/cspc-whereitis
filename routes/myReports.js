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
    if (!user.email || !SCHOOL_EMAIL_RE.test(user.email)) {
      return res.status(403).render('myReports/signIn', {
        title: 'Sign in to My Reports',
        values: { student_no: req.body.student_no },
        errors: {
          student_no:
<<<<<<< HEAD
            'Sign-in is limited to CSPC school email accounts. Contact the IT office if you believe this is a mistake.',
=======
            'Sign-in is limited to @cspc.edu.ph accounts. Contact the IT office if you believe this is a mistake.',
>>>>>>> afca201e130bbfa7102caa4aea064bea79a78181
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


// ---------------------------------------------------------------------
// Create an account (self-service registration). Always creates a STUDENT:
// the role is never read from the form, so nobody can sign themselves up
// as staff/admin.
// ---------------------------------------------------------------------
// Student numbers: digits only, 7 to 10 long.
const STUDENT_NO_RE = /^\d{7,10}$/;
// Registration email: must be @cspc.edu.ph (sign-in keeps the looser SCHOOL_EMAIL_RE so existing accounts still work).
const REGISTER_EMAIL_RE = /^[^@\s]+@cspc\.edu\.ph$/i;
// School emails: students use the my.cspc.edu.ph domain; staff/older accounts use cspc.edu.ph.
const SCHOOL_EMAIL_RE = /^[^@\s]+@(my\.)?cspc\.edu\.ph$/i;

function renderRegister(res, status, values, errors, nextPath) {
  return res.status(status).render('myReports/register', {
    title: 'Create an account',
    values: values || {},
    errors: errors || {},
    next: nextPath || '',
  });
}

// GET /register, GET /my-reports/register
function registerFormHandler(req, res) {
  if (req.identity) return res.redirect(303, '/my-reports');
  const nextPath = isSafeRelativePath(req.query.next) ? req.query.next : '';
  renderRegister(res, 200, {}, {}, nextPath);
}

// POST /register, POST /my-reports/register
async function registerSubmitHandler(req, res, next) {
  try {
    const nextPath = isSafeRelativePath(req.body.next) ? req.body.next : '';
    const errors = {};
    const values = {};

    const nameR = validate.compose(
      validate.required('Full name'),
      validate.minLen(3, 'Full name'),
      validate.maxLen(120, 'Full name')
    )(req.body.full_name);
    values.full_name = nameR.value;
    if (!nameR.ok) errors.full_name = nameR.error;

    const noR = validate.required('Student number')(req.body.student_no);
    values.student_no = noR.value;
    if (!noR.ok) errors.student_no = noR.error;
    else if (!STUDENT_NO_RE.test(noR.value)) errors.student_no = 'Please enter a valid student number.';

    const emailR = validate.compose(
      validate.required('Email'),
      validate.maxLen(160, 'Email'),
      validate.isEmailLoose('Email')
    )(req.body.email);
    values.email = emailR.value.toLowerCase();
    if (!emailR.ok) errors.email = emailR.error;
    else if (!REGISTER_EMAIL_RE.test(values.email)) errors.email = 'Please use your CSPC school email address.';

    const contactR = validate.optional(validate.maxLen(20, 'Contact number'))(req.body.contact_no);
    values.contact_no = contactR.value;
    if (!contactR.ok) errors.contact_no = contactR.error;
    else if (values.contact_no && !/^[0-9+()\-\s]{7,20}$/.test(values.contact_no)) {
      errors.contact_no = 'Enter a valid contact number, or leave it blank.';
    }

    const pin = String(req.body.pin || '').trim();
    const pin2 = String(req.body.pin_confirm || '').trim();
    if (!/^\d{4}$/.test(pin)) errors.pin = 'PIN must be exactly 4 digits.';
    else if (pin !== pin2) errors.pin_confirm = 'The two PINs do not match.';

    if (!req.body.agree) errors.agree = 'Please accept the Terms and Privacy notice to continue.';

    // Friendly duplicate checks (only if the shape is otherwise fine).
    if (!errors.student_no && (await userModel.findByStudentNo(values.student_no))) {
      errors.student_no = 'An account with this student number already exists. Try signing in.';
    }
    if (!errors.email && (await userModel.emailExists(values.email))) {
      errors.email = 'An account with this email already exists. Try signing in.';
    }

    if (Object.keys(errors).length > 0) return renderRegister(res, 422, values, errors, nextPath);

    let user;
    try {
      user = await userModel.create({
        student_no: values.student_no,
        full_name: values.full_name,
        email: values.email,
        contact_no: values.contact_no || null,
        role: 'student',
        pin,
      });
    } catch (err) {
      // Two people registering at once can slip past the pre-check; the UNIQUE keys catch it.
      if (err && err.code === 'ER_DUP_ENTRY') {
        const field = /email/i.test(err.message) ? 'email' : 'student_no';
        errors[field] = field === 'email'
          ? 'An account with this email already exists. Try signing in.'
          : 'An account with this student number already exists. Try signing in.';
        return renderRegister(res, 422, values, errors, nextPath);
      }
      throw err;
    }

    // Sign the new student straight in.
    const expiresAt = Date.now() + COOKIE_MAX_AGE_MS;
    res.cookie(COOKIE_NAME, buildCookieValue(user.id, user.student_no, expiresAt), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    });
    const destination = nextPath || '/my-reports';
    const sep = destination.includes('?') ? '&' : '?';
    res.redirect(303, `${destination}${sep}flash=ok:Account%20created.%20Welcome%2C%20${encodeURIComponent(user.full_name.split(' ')[0])}!`);
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

router.get('/register', registerFormHandler);
router.get('/my-reports/register', registerFormHandler);
router.post('/register', registerSubmitHandler);
router.post('/my-reports/register', registerSubmitHandler);

router.post('/my-reports/sign-out', signOutHandler);
router.post('/sign-out', signOutHandler);

module.exports = router;