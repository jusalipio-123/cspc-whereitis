// routes/adminAuth.js
// Dedicated administrator sign-in. Mounted at /admin/login BEFORE the
// protected /admin placeholder, so a signed-out admin can reach the form.
// It uses the same scrypt check and signed cookie as ordinary sign-in, but
// only accepts accounts whose database role is 'admin'.
//
// The admin interface itself is being rebuilt; this router intentionally
// serves only a sign-in form and a small placeholder landing page for now.

const express = require('express');
const router = express.Router();
const userModel = require('../models/userModel');
const hmac = require('../lib/hmac');
const limiter = require('../lib/loginLimiter');
const validate = require('../middleware/validate');

const COOKIE_NAME = 'whereitis_id';
const COOKIE_MAX_AGE_MS = 30 * 60 * 1000;
const SCHOOL_EMAIL_RE = /^[^@\s]+@(my\.)?cspc\.edu\.ph$/i;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

function buildCookieValue(user, expiresAt) {
  const payload = `${user.id}.${user.student_no}.admin.${expiresAt}`;
  return `${payload}.${hmac.sign(payload)}`;
}

function renderLogin(res, status, values, errors) {
  return res.status(status).render('admin/login', {
    title: 'Administrator sign in',
    values: values || {},
    errors: errors || {},
  });
}

// Re-read the role from the users table on every request. The signed cookie
// is only a UI convenience and is never trusted for authorisation here.
async function requireAdminDb(req, res, next) {
  if (!req.identity) {
    return res.redirect(303, '/admin/login');
  }
  try {
    const user = await userModel.findById(req.identity.userId);
    if (!user || user.role !== 'admin') {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }
    req.adminUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

// GET /admin/login
router.get('/', (req, res) => {
  if (req.identity) return res.redirect(303, '/admin');
  renderLogin(res, 200, {}, {});
});

// POST /admin/login
router.post('/', async (req, res, next) => {
  try {
    const values = {
      email: typeof req.body.email === 'string' ? req.body.email : '',
    };
    const errors = {};

    const emailResult = validate.compose(
      validate.required('Email address'),
      validate.maxLen(160, 'Email address'),
      validate.isEmailLoose('Email address')
    )(req.body.email);
    const email = emailResult.ok ? emailResult.value.toLowerCase() : '';
    if (!emailResult.ok) errors.email = emailResult.error;

    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!password) {
      errors.password = 'Please enter your password.';
    }

    if (Object.keys(errors).length > 0) {
      return renderLogin(res, 422, values, errors);
    }

    const gate = limiter.check('admin:' + email, req.ip);
    if (gate.limited) {
      errors.password = 'Too many failed attempts. Please try again in ' + limiter.minutesText(gate.retryAfterMs) + '.';
      return renderLogin(res, 429, values, errors);
    }

    const result = await userModel.verifyPassword(email, password);

    // Deliberately generic — never reveal whether the email exists.
    if (!result || (result.user.role || 'user') !== 'admin') {
      limiter.recordFailure('admin:' + email, req.ip);
      errors.password = 'Email address and password do not match an administrator account.';
      return renderLogin(res, 401, values, errors);
    }

    const user = result.user;
    if (!user.email || !SCHOOL_EMAIL_RE.test(user.email)) {
      errors.email = 'Sign-in is limited to CSPC school email accounts.';
      return renderLogin(res, 403, values, errors);
    }

    if (!user.email_verified) {
      return res.redirect(303, '/check-email?email=' + encodeURIComponent(user.email));
    }

    if (result.legacy) {
      errors.password = 'This account must set a new password before signing in. Use the regular sign-in page first.';
      return renderLogin(res, 403, values, errors);
    }

    limiter.recordSuccess('admin:' + email);
    res.cookie(
      COOKIE_NAME,
      buildCookieValue(user, Date.now() + COOKIE_MAX_AGE_MS),
      cookieOptions()
    );
    return res.redirect(303, '/admin?flash=ok:Signed%20in');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.requireAdminDb = requireAdminDb;
