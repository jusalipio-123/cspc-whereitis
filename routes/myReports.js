// routes/myReports.js
// Rule: every POST redirects with 303 and shows a flash. Every GET is safe and
// idempotent. Client-side required attributes are convenience only — anyone
// can send this request with curl and skip the form entirely, so we always
// validate on the server.
//
// The /my-reports page uses a signed HttpOnly cookie called whereitis_id, NOT
// a session. See README "Identification Without Sessions — Midterm Approach".
//
// PASSWORDS: accounts use a real password (10+ characters, checked against
// common/guessable passwords) stored with scrypt, and sign-in is rate-limited
// per account and per IP. Accounts created with the old 4-digit PIN sign in
// once with that PIN and are then forced to choose a password (/set-password).
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
const passwords = require('../lib/passwords');
const limiter = require('../lib/loginLimiter');
const mailer = require('../lib/mailer');

const COOKIE_NAME = 'whereitis_id';
const COOKIE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

// Short-lived cookie that only proves "this person just typed their old PIN
// correctly". It lets them reach /set-password and nothing else.
const RESET_COOKIE = 'whereitis_pwreset';
const RESET_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeMs,
    path: '/',
  };
}

function buildResetCookieValue(userId, expiresAtMs) {
  return `${userId}.${expiresAtMs}.${hmac.sign(`pwreset.${userId}.${expiresAtMs}`)}`;
}

// readResetUserId: the user id from a valid, unexpired reset cookie, or null.
function readResetUserId(req) {
  const raw = req.cookies && req.cookies[RESET_COOKIE];
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [idStr, expStr, sig] = parts;
  const userId = Number(idStr);
  const expires = Number(expStr);
  if (!Number.isInteger(userId) || !Number.isFinite(expires) || expires <= Date.now()) return null;
  if (!hmac.verify(`pwreset.${idStr}.${expStr}`, sig)) return null;
  return userId;
}

function signInAs(res, user) {
  const expiresAt = Date.now() + COOKIE_MAX_AGE_MS;
  res.cookie(COOKIE_NAME, buildCookieValue(user.id, user.student_no, expiresAt), cookieOptions(COOKIE_MAX_AGE_MS));
}

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
    const [reports, claims, bookmarks, incomingClaims] = await Promise.all([
      reportModel.findByUser(req.identity.userId),
      claimModel.listByUser(req.identity.userId),
      bookmarkModel.listByUser(req.identity.userId),
      claimModel.listForOwner(req.identity.userId),
    ]);

    res.render('myReports/index', {
      title: 'My Reports',
      reports,
      claims,
      incomingClaims,
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

    // Passwords are used exactly as typed (never trimmed), so spaces are allowed.
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!password) {
      errors.password = 'Please enter your password.';
    } else if (password.length > passwords.MAX_LENGTH) {
      errors.password = 'Student number and password do not match our records.';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).render('myReports/signIn', {
        title: 'Sign in to My Reports',
        values: { student_no: req.body.student_no },
        errors,
        next: nextPath,
      });
    }

    // Too many wrong guesses on this student number (or from this address)? Pause, without
    // checking the password at all, so a guessing script gets nothing back while paused.
    const gate = limiter.check(studentNoResult.value, req.ip);
    if (gate.limited) {
      return res.status(429).render('myReports/signIn', {
        title: 'Sign in to My Reports',
        values: { student_no: req.body.student_no },
        errors: { password: 'Too many failed attempts. Please try again in ' + limiter.minutesText(gate.retryAfterMs) + '.' },
        next: nextPath,
      });
    }

    const result = await userModel.verifyPassword(studentNoResult.value, password);

    // We deliberately do NOT reveal whether the student_no exists or the
    // password was wrong — the same generic message either way prevents
    // account enumeration.
    if (!result) {
      limiter.recordFailure(studentNoResult.value, req.ip);
      return res.status(401).render('myReports/signIn', {
        title: 'Sign in to My Reports',
        values: { student_no: req.body.student_no },
        errors: { password: 'Student number and password do not match our records.' },
        next: nextPath,
      });
    }

    limiter.recordSuccess(studentNoResult.value);
    const user = result.user;

    // Soft policy check (not authentication) — @cspc.edu.ph accounts only.
    if (!user.email || !SCHOOL_EMAIL_RE.test(user.email)) {
      return res.status(403).render('myReports/signIn', {
        title: 'Sign in to My Reports',
        values: { student_no: req.body.student_no },
        errors: {
          student_no:
            'Sign-in is limited to CSPC school email accounts. Contact the IT office if you believe this is a mistake.',
        },
        next: nextPath,
      });
    }

    // Email not verified yet: the password was right, but they cannot sign in until they click
    // the link we emailed them.
    if (!user.email_verified) {
      return res.redirect(303, '/check-email?email=' + encodeURIComponent(user.email) +
        '&flash=err:' + encodeURIComponent('Please verify your email before signing in. Check your inbox for the verification link.'));
    }

    // Old account that just used its 4-digit PIN: they are NOT signed in yet. They must choose a
    // real password first (this erases the old PIN).
    if (result.legacy) {
      res.cookie(RESET_COOKIE, buildResetCookieValue(user.id, Date.now() + RESET_MAX_AGE_MS), cookieOptions(RESET_MAX_AGE_MS));
      return res.redirect(303, '/set-password' + (nextPath ? '?next=' + encodeURIComponent(nextPath) : ''));
    }

    signInAs(res, user);

    const destination = nextPath || '/my-reports';
    const sep = destination.includes('?') ? '&' : '?';
    res.redirect(303, `${destination}${sep}flash=ok:Signed%20in`);
  } catch (err) {
    next(err);
  }
}


// ---------------------------------------------------------------------
// Create an account (self-service registration). Every account is an
// ordinary user: there are no staff or admin roles.
// ---------------------------------------------------------------------
// Student numbers: digits only, 7 to 10 long.
const STUDENT_NO_RE = /^\d{7,10}$/;
// Registration email: @cspc.edu.ph or @my.cspc.edu.ph (sign-in keeps the looser SCHOOL_EMAIL_RE so existing accounts still work).
const REGISTER_EMAIL_RE = /^[^@\s]+@(my\.)?cspc\.edu\.ph$/i;
// School emails: my.cspc.edu.ph or cspc.edu.ph.
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
    else if (!REGISTER_EMAIL_RE.test(values.email)) errors.email = 'Please use your CSPC school email (e.g. name@my.cspc.edu.ph).';

    const contactR = validate.optional(validate.maxLen(20, 'Contact number'))(req.body.contact_no);
    values.contact_no = contactR.value;
    if (!contactR.ok) errors.contact_no = contactR.error;
    else if (values.contact_no && !/^[0-9+()\-\s]{7,20}$/.test(values.contact_no)) {
      errors.contact_no = 'Enter a valid contact number, or leave it blank.';
    }

    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const password2 = typeof req.body.password_confirm === 'string' ? req.body.password_confirm : '';
    const passwordError = passwords.validate(password, {
      student_no: values.student_no,
      email: values.email,
      full_name: values.full_name,
    });
    if (passwordError) errors.password = passwordError;
    else if (password !== password2) errors.password_confirm = 'The two passwords do not match.';

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
        password,
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

    // Not signed in yet: they must click the verification link we email them first.
    let flashMsg = 'ok:Account created. We sent a verification link to your email.';
    try {
      await mailer.sendVerificationEmail(user, await userModel.issueVerificationToken(user.id));
    } catch (mailErr) {
      console.error('[register] could not send verification email:', mailErr.message);
      flashMsg = 'err:Account created, but we could not send the verification email. Please press "Resend verification email".';
    }
    res.redirect(303, '/check-email?email=' + encodeURIComponent(user.email) + '&flash=' + encodeURIComponent(flashMsg));
  } catch (err) {
    next(err);
  }
}

// GET /check-email — "look in your inbox" page with a resend button.
function checkEmailHandler(req, res) {
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
  if (!REGISTER_EMAIL_RE.test(email)) return res.redirect(303, '/sign-in');
  res.render('myReports/checkEmail', { title: 'Verify your email', email });
}

// GET /verify-email?token=...  (the button in the email)
async function verifyEmailHandler(req, res, next) {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const row = /^[0-9a-f]{64}$/.test(token) ? await userModel.findByVerificationToken(token) : null;
    const invalid = '/sign-in?flash=err:' + encodeURIComponent('That verification link is invalid or has expired. Sign in to get a new one.');

    if (!row) return res.redirect(303, invalid);
    if (row.email_verified_at) {
      return res.redirect(303, '/sign-in?flash=ok:' + encodeURIComponent('Your email is already verified. Please sign in.'));
    }
    if (!row.verify_token_expires || new Date(row.verify_token_expires).getTime() < Date.now()) {
      return res.redirect(303, invalid);
    }

    await userModel.markEmailVerified(row.id);
    res.redirect(303, '/sign-in?flash=ok:' + encodeURIComponent('Email verified! You can now sign in.'));
  } catch (err) {
    next(err);
  }
}

// POST /resend-verification
// The reply is the same whether or not the email belongs to an account, so this cannot be used
// to discover who is registered. One email per minute per account.
async function resendVerificationHandler(req, res, next) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!REGISTER_EMAIL_RE.test(email)) return res.redirect(303, '/sign-in');

    let flashMsg = 'ok:If that account still needs verification, a new link is on its way.';
    const user = await userModel.findByEmail(email);
    if (user && !user.email_verified_at) {
      const last = user.verify_sent_at ? new Date(user.verify_sent_at).getTime() : 0;
      if (Date.now() - last >= userModel.RESEND_COOLDOWN_MS) {
        try {
          await mailer.sendVerificationEmail(user, await userModel.issueVerificationToken(user.id));
        } catch (mailErr) {
          console.error('[resend] could not send verification email:', mailErr.message);
          flashMsg = 'err:We could not send the email right now. Please try again later.';
        }
      }
    }
    res.redirect(303, '/check-email?email=' + encodeURIComponent(email) + '&flash=' + encodeURIComponent(flashMsg));
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Choose a new password. Only reachable right after an old 4-digit-PIN
// sign-in (see the reset cookie above). Replaces the PIN for good.
// ---------------------------------------------------------------------
function renderSetPassword(res, status, errors, nextPath) {
  return res.status(status).render('myReports/setPassword', {
    title: 'Choose a new password',
    errors: errors || {},
    next: nextPath || '',
  });
}

function backToSignIn(res) {
  res.clearCookie(RESET_COOKIE, { path: '/' });
  return res.redirect(303, '/sign-in?flash=err:' + encodeURIComponent('Please sign in first.'));
}

// GET /set-password
function setPasswordFormHandler(req, res) {
  if (!readResetUserId(req)) return backToSignIn(res);
  const nextPath = isSafeRelativePath(req.query.next) ? req.query.next : '';
  renderSetPassword(res, 200, {}, nextPath);
}

// POST /set-password
async function setPasswordSubmitHandler(req, res, next) {
  try {
    const userId = readResetUserId(req);
    if (!userId) return backToSignIn(res);

    const user = await userModel.findById(userId);
    if (!user) return backToSignIn(res);

    const nextPath = isSafeRelativePath(req.body.next) ? req.body.next : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const password2 = typeof req.body.password_confirm === 'string' ? req.body.password_confirm : '';

    const errors = {};
    const passwordError = passwords.validate(password, user);
    if (passwordError) errors.password = passwordError;
    else if (password !== password2) errors.password_confirm = 'The two passwords do not match.';

    if (Object.keys(errors).length > 0) return renderSetPassword(res, 422, errors, nextPath);

    await userModel.setPassword(user.id, password);

    res.clearCookie(RESET_COOKIE, { path: '/' });
    signInAs(res, user);

    const destination = nextPath || '/my-reports';
    const sep = destination.includes('?') ? '&' : '?';
    res.redirect(303, `${destination}${sep}flash=ok:Password%20updated.%20You%20are%20signed%20in.`);
  } catch (err) {
    next(err);
  }
}

// POST /my-reports/sign-out, POST /sign-out
function signOutHandler(req, res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.clearCookie(RESET_COOKIE, { path: '/' });

  // Always land on the sign-in page after signing out.
  res.redirect(303, '/sign-in?flash=ok:You%20have%20been%20signed%20out');
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

router.get('/check-email', checkEmailHandler);
router.get('/verify-email', verifyEmailHandler);
router.post('/resend-verification', resendVerificationHandler);

router.get('/set-password', setPasswordFormHandler);
router.post('/set-password', setPasswordSubmitHandler);

router.post('/my-reports/sign-out', signOutHandler);
router.post('/sign-out', signOutHandler);

module.exports = router;