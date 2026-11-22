// routes/googleAuth.js
// CSPC WhereITis — Google Sign-In (Google Identity Services ID-token flow).
// -----------------------------------------------------------------------
// The browser gets an ID token from Google and POSTs it here. We verify the
// token with Google's tokeninfo endpoint, then either link it to an existing
// account with the same email or create a verified, passwordless account.
// Finally we set the SAME whereitis_id cookie the password flow uses, so the
// rest of the app does not need to know how the person signed in.
//
// Requires GOOGLE_CLIENT_ID in .env. Without it the endpoint returns a clear
// 503 instead of pretending to work.
// -----------------------------------------------------------------------

const express = require('express');
const crypto = require('crypto');
const userModel = require('../models/userModel');
const hmac = require('../lib/hmac');
const sessionStore = require('../lib/sessionStore');

const router = express.Router();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
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

function buildCookieValue(userId, studentNo, role, expiresAtMs) {
  const payload = `${userId}.${studentNo}.${role}.${expiresAtMs}`;
  return `${payload}.${hmac.sign(payload)}`;
}

async function signInAs(res, user) {
  if (sessionStore.enabled()) {
    const sid = await sessionStore.create(user, COOKIE_MAX_AGE_MS);
    if (sid) {
      res.cookie(COOKIE_NAME, sid, cookieOptions());
      return;
    }
  }
  const role = user.role || 'user';
  res.cookie(
    COOKIE_NAME,
    buildCookieValue(user.id, user.student_no, role, Date.now() + COOKIE_MAX_AGE_MS),
    cookieOptions()
  );
}

// Same redirect rules as the password sign-in route, so ?next= cannot become
// an open redirect or send a student into the admin console.
function isSafeRelativePath(path) {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.includes('://')
  );
}

function dashboardFor(role) {
  return role === 'admin' ? '/admin' : '/my-reports';
}

function allowedNext(path, role) {
  if (!path) return false;
  if (path === '/admin' || path.startsWith('/admin/')) return role === 'admin';
  return true;
}

// verifyGoogleToken: calls Google, not the browser. Every check below is
// required — a valid signature for a different client or an old expiry must
// never be accepted just because Google signed it.
async function verifyGoogleToken(credential) {
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Google could not verify that sign-in. Please try again.');

  const info = await response.json();
  if (info.aud !== CLIENT_ID) throw new Error('This Google sign-in was issued for a different app.');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) {
    throw new Error('Unrecognised Google sign-in issuer.');
  }
  if (!info.exp || Number(info.exp) * 1000 <= Date.now()) {
    throw new Error('That Google sign-in has expired. Please try again.');
  }
  if (String(info.email_verified) !== 'true') {
    throw new Error('Please verify your email address with Google first.');
  }
  if (info.azp && info.azp !== CLIENT_ID) {
    throw new Error('This Google sign-in was issued for a different app.');
  }
  if (!info.email || !SCHOOL_EMAIL_RE.test(info.email)) {
    throw new Error('Use your CSPC Google account (@cspc.edu.ph or @my.cspc.edu.ph).');
  }

  return {
    email: info.email.toLowerCase(),
    name: String(info.name || info.email.split('@')[0]).slice(0, 120),
  };
}

// student_no must be unique. Google accounts have no student number, so give
// them a clearly-marked, collision-resistant one rather than inventing a real
// ID that might belong to someone else.
function newStudentNo() {
  return 'GOO-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

router.post('/', async (req, res) => {
  try {
    if (!CLIENT_ID) {
      return res.status(503).json({
        ok: false,
        error: 'Google Sign-In is not configured yet. Ask the administrator to set GOOGLE_CLIENT_ID.',
      });
    }

    const credential = typeof req.body.credential === 'string' ? req.body.credential : '';
    if (!credential) return res.status(400).json({ ok: false, error: 'Missing Google credential.' });

    const profile = await verifyGoogleToken(credential);
    let user = await userModel.findByEmail(profile.email);

    if (!user) {
      // Two people signing in with the same new Google account at once can
      // both reach this point; the UNIQUE(email) key decides the winner.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          user = await userModel.createGoogleUser({
            student_no: newStudentNo(),
            full_name: profile.name,
            email: profile.email,
          });
          break;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            user = await userModel.findByEmail(profile.email);
            if (user) break;
            continue;
          }
          throw err;
        }
      }
    }

    if (!user) {
      return res.status(500).json({ ok: false, error: 'Could not create your account. Please try again.' });
    }

    // Google verified this exact address, so it is safe to trust it here too.
    if (!user.email_verified_at) {
      await userModel.markEmailVerified(user.id);
      user.email_verified_at = new Date();
    }

    await signInAs(res, user);

    const nextPath = isSafeRelativePath(req.body.next) ? req.body.next : '';
    const redirect = allowedNext(nextPath, user.role) ? nextPath : dashboardFor(user.role);
    return res.json({ ok: true, redirect });
  } catch (err) {
    return res.status(401).json({ ok: false, error: err.message || 'Google sign-in failed.' });
  }
});

module.exports = router;
