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
const otp = require('../lib/otp');
const sessionStore = require('../lib/sessionStore');

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

async function signInAs(res, user) {
  // Optional database-backed session (SESSION_STORE=db). If it is off, or the
  // database save fails, fall through to the original signed cookie.
  if (sessionStore.enabled()) {
    const sid = await sessionStore.create(user, COOKIE_MAX_AGE_MS);
    if (sid) {
      res.cookie(COOKIE_NAME, sid, cookieOptions(COOKIE_MAX_AGE_MS));
      return;
    }
  }
  const expiresAt = Date.now() + COOKIE_MAX_AGE_MS;
  const role = user.role || 'user';
  res.cookie(
    COOKIE_NAME,
    buildCookieValue(user.id, user.student_no, role, expiresAt),
    cookieOptions(COOKIE_MAX_AGE_MS)
  );
}

function buildCookieValue(userId, studentNo, role, expiresAtMs) {
  const payload = `${userId}.${studentNo}.${role}.${expiresAtMs}`;
  const sig = hmac.sign(payload);
  return `${payload}.${sig}`;
}

// ---------------------------------------------------------------------
// "Email code" cookie. While someone is typing a 6-digit code it remembers WHICH
// address, WHAT the code is for (register / verify / reset) and how far they got:
//   stage 'code'     = a code was sent and we are waiting for them to type it
//   stage 'verified' = (register only) the code was right, so they may finish the form
// It is signed (cannot be edited), HttpOnly and short-lived. The same cookie is
// handed out whether or not an address has an account, so it reveals nothing.
// ---------------------------------------------------------------------
const OTP_COOKIE = 'whereitis_otp';
const OTP_COOKIE_MAX_AGE_MS = 30 * 60 * 1000;

function setOtpCookie(res, email, purpose, stage) {
  const b64 = Buffer.from(String(email), 'utf8').toString('base64url');
  const expires = Date.now() + OTP_COOKIE_MAX_AGE_MS;
  const sig = hmac.sign(`otpstate.${b64}.${purpose}.${stage}.${expires}`);
  res.cookie(OTP_COOKIE, `${b64}.${purpose}.${stage}.${expires}.${sig}`, cookieOptions(OTP_COOKIE_MAX_AGE_MS));
}

// readOtpCookie: { email, purpose, stage } from a valid, unexpired cookie, or null.
function readOtpCookie(req) {
  const raw = req.cookies && req.cookies[OTP_COOKIE];
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split('.');
  if (parts.length !== 5) return null;
  const [b64, purpose, stage, expStr, sig] = parts;
  const expires = Number(expStr);
  if (!/^[A-Za-z0-9_-]+$/.test(b64) || !otp.PURPOSES.includes(purpose) || !['code', 'verified'].includes(stage)) return null;
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  if (!hmac.verify(`otpstate.${b64}.${purpose}.${stage}.${expStr}`, sig)) return null;
  return { email: Buffer.from(b64, 'base64url').toString('utf8'), purpose, stage };
}

function clearOtpCookie(res) {
  res.clearCookie(OTP_COOKIE, { path: '/' });
}

function withQuery(path, params) {
  const q = Object.keys(params)
    .filter((k) => params[k])
    .map((k) => k + '=' + encodeURIComponent(params[k]))
    .join('&');
  return q ? path + '?' + q : path;
}

const RESET_SENT_MSG = 'If that email belongs to an account, we sent a 6-digit code. Check your inbox and spam folder.';

// sendCode: makes a code and emails it. Never throws.
//   { status: 'sent' | 'cooldown' | 'failed', message }
async function sendCode(purpose, email, fullName) {
  let issued;
  try {
    issued = await otp.issue(purpose, email);
  } catch (err) {
    console.error('[otp] could not create a code:', err.message);
    return { status: 'failed', message: 'We could not send the email right now. Please try again in a moment.' };
  }
  if (!issued.ok) {
    return {
      status: 'cooldown',
      message: 'A code was sent a moment ago. Check your inbox, or wait ' + otp.secondsText(issued.retryAfterMs) + ' before asking for another.',
    };
  }
  try {
    await mailer.sendOtpEmail({ email, full_name: fullName }, issued.code, purpose);
    return { status: 'sent', message: 'We sent a 6-digit code to ' + email + '. It expires in 10 minutes.' };
  } catch (err) {
    console.error('[otp] could not send the code email:', err.message);
    await otp.discard(purpose, email).catch(() => {});   // so they can try again straight away
    return { status: 'failed', message: 'We could not send the email right now. Please try again in a moment.' };
  }
}

function flashFor(sent) {
  return (sent.status === 'failed' ? 'err:' : 'ok:') + sent.message;
}

function tooManyCodes(gate) {
  return 'Too many code requests from this network. Please try again in ' + limiter.minutesText(gate.retryAfterMs) + '.';
}

// Plain-language text for a failed code check (see lib/otp.js for the reasons).
function codeErrorText(r) {
  switch (r.reason) {
    case 'format': return 'Enter the 6-digit code from your email.';
    case 'invalid': return 'That code is not correct. ' + (r.attemptsLeft === 1 ? '1 try' : r.attemptsLeft + ' tries') + ' left.';
    case 'locked': return 'Too many wrong tries for that code. Request a new code below.';
    default: return 'That code has expired or was not found. Request a new code below.';
  }
}
function countsAsFailure(r) {
  return r.reason === 'invalid' || r.reason === 'locked';
}

// dashboardFor: students/staff/teachers share the My Reports interface;
// administrators land in the admin console after signing in.
function dashboardFor(role) {
  return role === 'admin' ? '/admin' : '/my-reports';
}

// A ?next= value is still honoured when it points at a same-site relative
// path, except admin-only areas which non-admins must not be sent to.
function allowedNext(path, role) {
  if (!path || path.startsWith('//') || path.includes('://')) return false;
  if (path === '/admin' || path.startsWith('/admin/')) return role === 'admin';
  return true;
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
    return res.redirect(303, dashboardFor(req.identity.role));
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

    const emailResult = validate.compose(
      validate.required('Email address'),
      validate.maxLen(160, 'Email address'),
      validate.isEmailLoose('Email address')
    )(req.body.email);
    const email = emailResult.ok ? emailResult.value.toLowerCase() : '';
    if (!emailResult.ok) errors.email = emailResult.error;

    // Passwords are used exactly as typed (never trimmed), so spaces are allowed.
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!password) {
      errors.password = 'Please enter your password.';
    } else if (password.length > passwords.MAX_LENGTH) {
      errors.password = 'Email address and password do not match our records.';
    }

    const values = { email: typeof req.body.email === 'string' ? req.body.email : '' };
    if (Object.keys(errors).length > 0) {
      return res.status(422).render('myReports/signIn', {
        title: 'Sign in to My Reports',
        values,
        errors,
        next: nextPath,
      });
    }

    // Too many wrong guesses on this email address (or from this address)?
    const gate = limiter.check(email, req.ip);
    if (gate.limited) {
      return res.status(429).render('myReports/signIn', {
        title: 'Sign in to My Reports',
        values,
        errors: { password: 'Too many failed attempts. Please try again in ' + limiter.minutesText(gate.retryAfterMs) + '.' },
        next: nextPath,
      });
    }

    const result = await userModel.verifyPassword(email, password);

    // Deliberately generic: never reveal whether the email exists.
    if (!result) {
      limiter.recordFailure(email, req.ip);
      return res.status(401).render('myReports/signIn', {
        title: 'Sign in to My Reports',
        values,
        errors: { password: 'Email address and password do not match our records.' },
        next: nextPath,
      });
    }

    limiter.recordSuccess(email);
    const user = result.user;
    const role = user.role || 'user';

    // Soft policy check (not authentication) — @cspc.edu.ph accounts only.
    if (!user.email || !SCHOOL_EMAIL_RE.test(user.email)) {
      return res.status(403).render('myReports/signIn', {
        title: 'Sign in to My Reports',
        values,
        errors: {
          email:
            'Sign-in is limited to CSPC school email accounts. Contact the IT office if you believe this is a mistake.',
        },
        next: nextPath,
      });
    }

    // Email verification stays enabled for every account: send a 6-digit code and let them type it.
    if (!user.email_verified) {
      const gate = otp.requestGate(req.ip);
      const sent = gate.allowed
        ? await sendCode('verify', user.email, user.full_name)
        : { status: 'failed', message: tooManyCodes(gate) };
      setOtpCookie(res, user.email, 'verify', 'code');
      return res.redirect(303, withQuery('/verify-code', {
        flash: (sent.status === 'failed' ? 'err:' : 'ok:') + 'Please verify your email before signing in. ' + sent.message,
      }));
    }

    // Old account that just used its 4-digit PIN: they are NOT signed in yet. They must choose a
    // real password first (this erases the old PIN).
    if (result.legacy) {
      res.cookie(RESET_COOKIE, buildResetCookieValue(user.id, Date.now() + RESET_MAX_AGE_MS), cookieOptions(RESET_MAX_AGE_MS));
      return res.redirect(303, '/set-password' + (nextPath ? '?next=' + encodeURIComponent(nextPath) : ''));
    }

    await signInAs(res, user);

    const destination = allowedNext(nextPath, role) ? nextPath : dashboardFor(role);
    const sep = destination.includes('?') ? '&' : '?';
    res.redirect(303, `${destination}${sep}flash=ok:Signed%20in`);
  } catch (err) {
    next(err);
  }
}


// ---------------------------------------------------------------------
// Create an account (self-service registration) — VERIFY FIRST.
//   1. /register          the person enters only their CSPC email
//   2. /verify-code       we email a 6-digit code; they type it
//   3. /register/details  only now do they fill in the rest; the account is created
//                         already verified and they are signed in
// Nothing is saved until step 3, so a mistyped or invented address never creates
// an account and nobody can reserve someone else's email or ID number.
// Roles available to the public are Student, Staff and Teacher only.
// The stored values are user (the historical Student value), staff, teacher.
// ---------------------------------------------------------------------
// ID number: student/staff/teacher IDs may contain digits, letters and hyphens.
const ID_NO_RE = /^[A-Za-z0-9-]{5,20}$/;
// Registration email: @cspc.edu.ph or @my.cspc.edu.ph (sign-in keeps the looser SCHOOL_EMAIL_RE so existing accounts still work).
const REGISTER_EMAIL_RE = /^[^@\s]+@(my\.)?cspc\.edu\.ph$/i;
// School emails: my.cspc.edu.ph or cspc.edu.ph.
const SCHOOL_EMAIL_RE = /^[^@\s]+@(my\.)?cspc\.edu\.ph$/i;
const PUBLIC_ROLE_MAP = { student: 'user', staff: 'staff', teacher: 'teacher' };

function renderRegisterEmail(res, status, values, errors, nextPath) {
  return res.status(status).render('myReports/registerEmail', {
    title: 'Create an account',
    values: values || {},
    errors: errors || {},
    next: nextPath || '',
  });
}

function renderRegister(res, status, values, errors, nextPath) {
  return res.status(status).render('myReports/register', {
    title: 'Create an account',
    values: values || {},
    errors: errors || {},
    next: nextPath || '',
  });
}

// Step 1. GET /register, GET /my-reports/register
function registerFormHandler(req, res) {
  if (req.identity) return res.redirect(303, dashboardFor(req.identity.role));
  const nextPath = isSafeRelativePath(req.query.next) ? req.query.next : '';
  renderRegisterEmail(res, 200, {}, {}, nextPath);
}

// Step 1. POST /register, POST /my-reports/register
async function registerEmailSubmitHandler(req, res, next) {
  try {
    const nextPath = isSafeRelativePath(req.body.next) ? req.body.next : '';
    const emailR = validate.compose(
      validate.required('Email address'),
      validate.maxLen(160, 'Email address'),
      validate.isEmailLoose('Email address')
    )(req.body.email);
    const email = emailR.value.toLowerCase();
    const values = { email: emailR.value };

    let error = '';
    if (!emailR.ok) error = emailR.error;
    else if (!REGISTER_EMAIL_RE.test(email)) error = 'Please use your CSPC school email (e.g. name@my.cspc.edu.ph).';
    if (error) return renderRegisterEmail(res, 422, values, { email: error }, nextPath);

    const existing = await userModel.findByEmail(email);
    if (existing && existing.email_verified_at) {
      return renderRegisterEmail(res, 422, values, { email: 'An account with this email already exists. Try signing in.' }, nextPath);
    }

    const gate = otp.requestGate(req.ip);
    if (!gate.allowed) return renderRegisterEmail(res, 429, values, { email: tooManyCodes(gate) }, nextPath);

    // An older account that never finished verifying just gets its email verified by the code.
    const purpose = existing ? 'verify' : 'register';
    const sent = await sendCode(purpose, email, existing && existing.full_name);
    if (sent.status === 'failed') return renderRegisterEmail(res, 503, values, { email: sent.message }, nextPath);

    setOtpCookie(res, email, purpose, 'code');
    res.redirect(303, withQuery('/verify-code', { next: nextPath, flash: flashFor(sent) }));
  } catch (err) {
    next(err);
  }
}

// Step 2. GET /verify-code
async function renderVerifyCode(res, status, st, errors, nextPath) {
  let waitMs = 0;
  try { waitMs = await otp.cooldownLeftMs(st.purpose, st.email); } catch (err) { /* show the button */ }
  return res.status(status).render('myReports/verifyCode', {
    title: 'Enter your code',
    email: st.email,
    purpose: st.purpose,
    errors: errors || {},
    next: nextPath || '',
    resendWaitSec: Math.ceil(waitMs / 1000),
  });
}

async function verifyCodeFormHandler(req, res, next) {
  try {
    const st = readOtpCookie(req);
    if (st && st.purpose === 'reset') return res.redirect(303, '/reset-password');
    if (!st || st.stage !== 'code') {
      return res.redirect(303, '/register?flash=err:' + encodeURIComponent('Please enter your email to get a code.'));
    }
    const nextPath = isSafeRelativePath(req.query.next) ? req.query.next : '';
    await renderVerifyCode(res, 200, st, {}, nextPath);
  } catch (err) {
    next(err);
  }
}

// Step 2. POST /verify-code
async function verifyCodeSubmitHandler(req, res, next) {
  try {
    const st = readOtpCookie(req);
    if (st && st.purpose === 'reset') return res.redirect(303, '/reset-password');
    if (!st || st.stage !== 'code') {
      return res.redirect(303, '/register?flash=err:' + encodeURIComponent('Your code session expired. Enter your email to get a new code.'));
    }
    const nextPath = isSafeRelativePath(req.body.next) ? req.body.next : '';

    // Wrong guesses are limited per address and per network on top of the 5-tries-per-code rule.
    const gate = limiter.check('otp:' + st.email, req.ip);
    if (gate.limited) {
      return renderVerifyCode(res, 429, st, { code: 'Too many wrong codes. Please try again in ' + limiter.minutesText(gate.retryAfterMs) + '.' }, nextPath);
    }

    const code = typeof req.body.code === 'string' ? req.body.code : '';
    const result = await otp.check(st.purpose, st.email, code);
    if (!result.ok) {
      if (countsAsFailure(result)) limiter.recordFailure('otp:' + st.email, req.ip);
      return renderVerifyCode(res, 422, st, { code: codeErrorText(result) }, nextPath);
    }
    limiter.recordSuccess('otp:' + st.email);

    if (st.purpose === 'register') {
      setOtpCookie(res, st.email, 'register', 'verified');
      return res.redirect(303, withQuery('/register/details', { next: nextPath }));
    }

    // purpose 'verify': an existing account whose email was never confirmed.
    const user = await userModel.findByEmail(st.email);
    if (user && !user.email_verified_at) await userModel.markEmailVerified(user.id);
    clearOtpCookie(res);
    res.redirect(303, '/sign-in?flash=ok:' + encodeURIComponent('Email verified! Please sign in.'));
  } catch (err) {
    next(err);
  }
}

// POST /verify-code/resend — a new code for whatever this browser is verifying.
async function resendCodeHandler(req, res, next) {
  try {
    const st = readOtpCookie(req);
    if (!st) return res.redirect(303, '/register?flash=err:' + encodeURIComponent('Your code session expired. Enter your email to get a new code.'));
    const nextPath = isSafeRelativePath(req.body.next) ? req.body.next : '';
    const gate = otp.requestGate(req.ip);

    if (st.purpose === 'reset') {
      if (st.stage === 'verified') return res.redirect(303, '/reset-password');
      // Same reply whether or not the address has an account.
      if (!gate.allowed) return res.redirect(303, withQuery('/reset-password', { flash: 'err:' + tooManyCodes(gate) }));
      const user = await userModel.findByEmail(st.email);
      if (user) await sendCode('reset', st.email, user.full_name);
      return res.redirect(303, withQuery('/reset-password', { flash: 'ok:' + RESET_SENT_MSG }));
    }

    if (st.stage !== 'code') return res.redirect(303, withQuery('/register/details', { next: nextPath }));
    if (!gate.allowed) return res.redirect(303, withQuery('/verify-code', { next: nextPath, flash: 'err:' + tooManyCodes(gate) }));

    const user = st.purpose === 'verify' ? await userModel.findByEmail(st.email) : null;
    const sent = await sendCode(st.purpose, st.email, user && user.full_name);
    res.redirect(303, withQuery('/verify-code', { next: nextPath, flash: flashFor(sent) }));
  } catch (err) {
    next(err);
  }
}

// Step 3. GET /register/details
function registerDetailsFormHandler(req, res) {
  const st = readOtpCookie(req);
  if (!st || st.purpose !== 'register' || st.stage !== 'verified') {
    return res.redirect(303, '/register?flash=err:' + encodeURIComponent('Please verify your email first.'));
  }
  const nextPath = isSafeRelativePath(req.query.next) ? req.query.next : '';
  renderRegister(res, 200, { email: st.email }, {}, nextPath);
}

// Step 3. POST /register/details
async function registerDetailsSubmitHandler(req, res, next) {
  try {
    const st = readOtpCookie(req);
    if (!st || st.purpose !== 'register' || st.stage !== 'verified') {
      return res.redirect(303, '/register?flash=err:' + encodeURIComponent('Your verification expired. Please verify your email again.'));
    }
    const nextPath = isSafeRelativePath(req.body.next) ? req.body.next : '';
    const errors = {};
    const values = { email: st.email };      // the verified address; anything posted is ignored

    const nameR = validate.compose(
      validate.required('Full name'),
      validate.minLen(3, 'Full name'),
      validate.maxLen(120, 'Full name')
    )(req.body.full_name);
    values.full_name = nameR.value;
    if (!nameR.ok) errors.full_name = nameR.error;

    // Role is an allow-list. 'admin' is never accepted from a browser.
    const roleKey = String(req.body.role || '').toLowerCase();
    values.role = PUBLIC_ROLE_MAP[roleKey] ? roleKey : '';
    if (!values.role) errors.role = 'Please choose Student, Staff or Teacher.';

    const noR = validate.compose(
      validate.required('ID number'),
      validate.maxLen(20, 'ID number')
    )(req.body.student_no);
    values.student_no = noR.value;
    if (!noR.ok) errors.student_no = noR.error;
    else if (!ID_NO_RE.test(noR.value)) errors.student_no = 'Use 5-20 letters, numbers or hyphens (no spaces).';
    else if (/^(ADM|STF|GOO)-/i.test(noR.value)) errors.student_no = 'That ID number format is reserved. Please enter your real ID number.';

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
    if (!errors.student_no && (await userModel.studentNoExists(values.student_no))) {
      errors.student_no = 'An account with this ID number already exists. Try signing in.';
    }
    if (await userModel.emailExists(values.email)) {
      clearOtpCookie(res);
      return res.redirect(303, '/sign-in?flash=err:' + encodeURIComponent('An account with this email already exists. Please sign in.'));
    }

    if (Object.keys(errors).length > 0) return renderRegister(res, 422, values, errors, nextPath);

    let user;
    try {
      user = await userModel.create({
        student_no: values.student_no,
        full_name: values.full_name,
        email: values.email,
        role: PUBLIC_ROLE_MAP[values.role],
        password,
      });
    } catch (err) {
      // Two people registering at once can slip past the pre-check; the UNIQUE keys catch it.
      if (err && err.code === 'ER_DUP_ENTRY') {
        if (/email/i.test(err.message)) {
          clearOtpCookie(res);
          return res.redirect(303, '/sign-in?flash=err:' + encodeURIComponent('An account with this email already exists. Please sign in.'));
        }
        errors.student_no = 'An account with this ID number already exists. Try signing in.';
        return renderRegister(res, 422, values, errors, nextPath);
      }
      throw err;
    }

    // The email was proven by the code, so the account starts verified and they are signed in.
    await userModel.markEmailVerified(user.id);
    clearOtpCookie(res);
    await signInAs(res, user);

    const role = user.role || 'user';
    const destination = allowedNext(nextPath, role) ? nextPath : dashboardFor(role);
    const sep = destination.includes('?') ? '&' : '?';
    res.redirect(303, `${destination}${sep}flash=ok:${encodeURIComponent('Account created. Welcome to WhereITis!')}`);
  } catch (err) {
    next(err);
  }
}

// GET /check-email — the old "look for the link" page. Codes now live on /verify-code.
function checkEmailHandler(req, res) {
  res.redirect(303, readOtpCookie(req) ? '/verify-code' : '/sign-in');
}

// GET /verify-email?token=...  Only for verification links emailed BEFORE codes were introduced
// (they stay valid for their 24 hours). New emails carry a code instead.
async function verifyEmailHandler(req, res, next) {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const row = /^[0-9a-f]{64}$/.test(token) ? await userModel.findByVerificationToken(token) : null;
    const invalid = '/sign-in?flash=err:' + encodeURIComponent('That verification link is no longer valid. Sign in and we will email you a code instead.');

    if (!row) return res.redirect(303, invalid);
    if (row.email_verified_at) {
      return res.redirect(303, '/sign-in?flash=ok:' + encodeURIComponent('Your email is already verified. Please sign in.'));
    }
    if (!row.verify_token_expires || new Date(row.verify_token_expires).getTime() < Date.now()) {
      return res.redirect(303, invalid);
    }

    await userModel.markEmailVerified(row.id);
    res.redirect(303, '/sign-in?flash=ok:' + encodeURIComponent('Account verified successfully! Please sign in.'));
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Forgot password, with a 6-digit code. The reply is identical whether or not the
// email has an account, so this cannot be used to discover who is registered.
//   /forgot-password  enter the email  ->  we email a code (if the account exists)
//   /reset-password   step 1: type the code (checked on its own)
//                     step 2: only after the code is accepted, choose the new password
// ---------------------------------------------------------------------
function forgotPasswordFormHandler(req, res) {
  res.render('myReports/forgotPassword', {
    title: 'Forgot your password?',
    values: {},
    errors: {},
  });
}

async function forgotPasswordSubmitHandler(req, res, next) {
  try {
    const emailResult = validate.compose(
      validate.required('Email address'),
      validate.maxLen(160, 'Email address'),
      validate.isEmailLoose('Email address')
    )(req.body.email);
    const values = { email: typeof req.body.email === 'string' ? req.body.email : '' };
    const fail = (status, message) => res.status(status).render('myReports/forgotPassword', {
      title: 'Forgot your password?',
      values,
      errors: { email: message },
    });

    if (!emailResult.ok) return fail(422, emailResult.error);

    const email = emailResult.value.toLowerCase();
    const gate = limiter.check(email, req.ip);
    if (gate.limited) return fail(429, 'Too many requests. Please try again in ' + limiter.minutesText(gate.retryAfterMs) + '.');
    const codeGate = otp.requestGate(req.ip);
    if (!codeGate.allowed) return fail(429, tooManyCodes(codeGate));

    const user = await userModel.findByEmail(email);
    if (user) await sendCode('reset', email, user.full_name);    // failures are logged, never shown

    setOtpCookie(res, email, 'reset', 'code');
    return res.redirect(303, withQuery('/reset-password', { flash: 'ok:' + RESET_SENT_MSG }));
  } catch (err) {
    next(err);
  }
}

// Step 2 of a reset: the new-password form. Only shown after the emailed code was accepted.
function renderResetPassword(res, status, email, errors) {
  return res.status(status).render('myReports/resetPassword', {
    title: 'Choose a new password',
    email,
    errors: errors || {},
  });
}

// GET /reset-password
//   no code session        -> back to /forgot-password
//   code not typed yet     -> the code page
//   code already accepted  -> the new-password form
async function resetPasswordFormHandler(req, res, next) {
  try {
    const st = readOtpCookie(req);
    if (!st || st.purpose !== 'reset') {
      if (typeof req.query.token === 'string' && req.query.token) {
        return res.redirect(303, '/forgot-password?flash=err:' + encodeURIComponent('Password resets now use a 6-digit code. Request one below.'));
      }
      return res.redirect(303, '/forgot-password');
    }
    if (st.stage === 'verified') return renderResetPassword(res, 200, st.email, {});
    await renderVerifyCode(res, 200, st, {}, '');
  } catch (err) {
    next(err);
  }
}

// POST /reset-password
//   step 1 (stage 'code')     checks the code ONLY; if right, unlocks step 2
//   step 2 (stage 'verified') sets the new password
async function resetPasswordSubmitHandler(req, res, next) {
  try {
    const st = readOtpCookie(req);
    if (!st || st.purpose !== 'reset') {
      return res.redirect(303, '/forgot-password?flash=err:' + encodeURIComponent('Your reset session expired. Request a new code.'));
    }

    if (st.stage === 'code') {
      const gate = limiter.check('otp:' + st.email, req.ip);
      if (gate.limited) {
        return renderVerifyCode(res, 429, st, { code: 'Too many wrong codes. Please try again in ' + limiter.minutesText(gate.retryAfterMs) + '.' }, '');
      }
      const code = typeof req.body.code === 'string' ? req.body.code : '';
      const result = await otp.check('reset', st.email, code);
      if (!result.ok) {
        if (countsAsFailure(result)) limiter.recordFailure('otp:' + st.email, req.ip);
        return renderVerifyCode(res, 422, st, { code: codeErrorText(result) }, '');
      }
      limiter.recordSuccess('otp:' + st.email);
      setOtpCookie(res, st.email, 'reset', 'verified');
      return res.redirect(303, withQuery('/reset-password', { flash: 'ok:Code accepted. Now choose a new password.' }));
    }

    // stage 'verified': the code was already proven, so only the password is checked here.
    const user = await userModel.findByEmail(st.email);
    if (!user) {
      clearOtpCookie(res);
      return res.redirect(303, '/forgot-password?flash=err:' + encodeURIComponent('Your reset session expired. Request a new code.'));
    }
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const password2 = typeof req.body.password_confirm === 'string' ? req.body.password_confirm : '';
    const errors = {};
    const passwordError = passwords.validate(password, user);
    if (passwordError) errors.password = passwordError;
    else if (password !== password2) errors.password_confirm = 'The two passwords do not match.';
    if (Object.keys(errors).length > 0) return renderResetPassword(res, 422, st.email, errors);

    await userModel.setPassword(user.id, password);
    if (!user.email_verified_at) await userModel.markEmailVerified(user.id);   // they proved the mailbox is theirs
    clearOtpCookie(res);

    return res.redirect(303, '/sign-in?flash=ok:' + encodeURIComponent('Password updated. Please sign in with your new password.'));
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
    await signInAs(res, user);

    const role = user.role || 'user';
    const destination = allowedNext(nextPath, role) ? nextPath : dashboardFor(role);
    const sep = destination.includes('?') ? '&' : '?';
    res.redirect(303, `${destination}${sep}flash=ok:Password%20updated.%20You%20are%20signed%20in.`);
  } catch (err) {
    next(err);
  }
}

// POST /my-reports/sign-out, POST /sign-out
async function signOutHandler(req, res) {
  if (sessionStore.enabled() && req.cookies && sessionStore.looksLikeSid(req.cookies[COOKIE_NAME])) {
    await sessionStore.destroy(req.cookies[COOKIE_NAME]);
  }
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
router.post('/register', registerEmailSubmitHandler);
router.post('/my-reports/register', registerEmailSubmitHandler);
router.get('/register/details', registerDetailsFormHandler);
router.post('/register/details', registerDetailsSubmitHandler);

router.get('/verify-code', verifyCodeFormHandler);
router.post('/verify-code', verifyCodeSubmitHandler);
router.post('/verify-code/resend', resendCodeHandler);
router.get('/check-email', checkEmailHandler);
router.get('/verify-email', verifyEmailHandler);

router.get('/forgot-password', forgotPasswordFormHandler);
router.post('/forgot-password', forgotPasswordSubmitHandler);
router.get('/reset-password', resetPasswordFormHandler);
router.post('/reset-password', resetPasswordSubmitHandler);

router.get('/set-password', setPasswordFormHandler);
router.post('/set-password', setPasswordSubmitHandler);

router.post('/my-reports/sign-out', signOutHandler);
router.post('/sign-out', signOutHandler);

module.exports = router;