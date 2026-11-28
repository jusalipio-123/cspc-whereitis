// lib/mailer.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Sends the account-verification email through Brevo (free plan) using its
// HTTPS API and Node's built-in fetch — no extra npm package is needed.
//
// Needs these values in .env (see .env.example):
//   BREVO_API_KEY      API key from Brevo > SMTP & API > API Keys
//   MAIL_FROM_EMAIL    a sender you verified in Brevo > Senders & IP
//   MAIL_FROM_NAME     display name (optional)
//   APP_URL            public address of this site, used to build the link
//
// DEV CONVENIENCE: when BREVO_API_KEY is empty and NODE_ENV is not
// "production", the verification link is printed in the terminal instead of
// emailed, so the app can still be tried on a laptop without Brevo.
// -----------------------------------------------------------------------

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

function appUrl() {
  const base = process.env.APP_URL || 'http://localhost:' + (process.env.PORT || 3000);
  return base.replace(/\/+$/, '');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function verificationLink(token) {
  return appUrl() + '/verify-email?token=' + encodeURIComponent(token);
}

function passwordResetLink(token) {
  return appUrl() + '/reset-password?token=' + encodeURIComponent(token);
}

// sendVerificationEmail: throws if the email could not be sent.
async function sendVerificationEmail(user, token) {
  const link = verificationLink(token);
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('BREVO_API_KEY is not set');
    }
    console.log('[mailer] BREVO_API_KEY not set — verification link for ' + user.email + ':\n  ' + link);
    return { sent: false };
  }

  const senderEmail = process.env.MAIL_FROM_EMAIL;
  if (!senderEmail) throw new Error('MAIL_FROM_EMAIL is not set');

  const firstName = String(user.full_name || '').split(' ')[0] || 'there';
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">' +
    '<h2 style="margin:0 0 12px">Verify your email</h2>' +
    '<p>Hi ' + escapeHtml(firstName) + ',</p>' +
    '<p>Thanks for creating your CSPC WhereITis account. Please confirm that this is your email address by clicking the button below.</p>' +
    '<p style="margin:24px 0"><a href="' + escapeHtml(link) + '" style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block">Verify my email</a></p>' +
    '<p style="font-size:13px;color:#555">This link expires in 24 hours. If the button does not work, copy this address into your browser:<br>' +
    '<a href="' + escapeHtml(link) + '">' + escapeHtml(link) + '</a></p>' +
    '<p style="font-size:13px;color:#555">If you did not create this account, you can ignore this email.</p>' +
    '</div>';
  const text =
    'Hi ' + firstName + ',\n\nConfirm your CSPC WhereITis account by opening this link (valid for 24 hours):\n' +
    link + '\n\nIf you did not create this account, ignore this email.';

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderEmail, name: process.env.MAIL_FROM_NAME || 'CSPC WhereITis' },
      to: [{ email: user.email, name: user.full_name }],
      subject: 'Verify your CSPC WhereITis account',
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Brevo responded ' + res.status + ' ' + detail.slice(0, 200));
  }
  return { sent: true };
}

// sendPasswordResetEmail: same delivery mechanism as verification, with a
// different, short-lived link. The reply to POST /forgot-password is always
// the same, so this function's result is only used for logging.
async function sendPasswordResetEmail(user, token) {
  const link = passwordResetLink(token);
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('BREVO_API_KEY is not set');
    }
    console.log('[mailer] BREVO_API_KEY not set — password reset link for ' + user.email + ':\n  ' + link);
    return { sent: false };
  }

  const senderEmail = process.env.MAIL_FROM_EMAIL;
  if (!senderEmail) throw new Error('MAIL_FROM_EMAIL is not set');

  const firstName = String(user.full_name || '').split(' ')[0] || 'there';
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">' +
    '<h2 style="margin:0 0 12px">Reset your password</h2>' +
    '<p>Hi ' + escapeHtml(firstName) + ',</p>' +
    '<p>We received a request to reset the password for your CSPC WhereITis account. Click the button below to choose a new one.</p>' +
    '<p style="margin:24px 0"><a href="' + escapeHtml(link) + '" style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block">Reset my password</a></p>' +
    '<p style="font-size:13px;color:#555">This link expires in 1 hour and can be used once. If you did not request it, you can ignore this email — your current password keeps working.</p>' +
    '</div>';
  const text =
    'Hi ' + firstName + ',\n\nReset your CSPC WhereITis password within 1 hour:\n' +
    link + '\n\nIf you did not request this, ignore this email.';

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderEmail, name: process.env.MAIL_FROM_NAME || 'CSPC WhereITis' },
      to: [{ email: user.email, name: user.full_name }],
      subject: 'Reset your CSPC WhereITis password',
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Brevo responded ' + res.status + ' ' + detail.slice(0, 200));
  }
  return { sent: true };
}

// ---------------------------------------------------------------------
// Notification emails: "someone claimed your report", "you have a new
// message", and the other in-app notifications, copied to the user's inbox.
// The email never contains private message text. It only says that
// something happened and links back to the site, where sign-in is required.
// ---------------------------------------------------------------------
const NOTIFY_COPY = {
  claim_filed:      { subject: 'New claim on your report',      heading: 'Someone filed a claim',          cta: 'Review the claim' },
  claim_decided:    { subject: 'Your claim has been decided',   heading: 'Your claim was reviewed',        cta: 'View your claim' },
  status_changed:   { subject: 'Your report status changed',    heading: 'Report status updated',          cta: 'View report' },
  message_received: { subject: 'You have a new message',        heading: 'You have a new message',         cta: 'Read message' },
  comment_added:    { subject: 'New comment on your report',    heading: 'New comment on your report',     cta: 'View comment' },
};

function buildNotificationEmail(user, n) {
  const copy = NOTIFY_COPY[n.type] || { subject: 'New activity on WhereITis', heading: 'New activity', cta: 'Open WhereITis' };
  const firstName = String(user.full_name || '').split(' ')[0] || 'there';
  const link = appUrl() + (String(n.link || '').charAt(0) === '/' ? n.link : '/notifications');
  const settings = appUrl() + '/notifications';
  const brand = '#10427a';

  const html =
    '<div style="background:#f3f5f8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">' +
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #dcdfe3;border-radius:10px;overflow:hidden">' +
    '<div style="background:' + brand + ';padding:16px 24px;color:#ffffff">' +
    '<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.8">CSPC WhereITis</div>' +
    '<div style="font-size:18px;font-weight:bold;margin-top:2px">Lost &amp; Found</div></div>' +
    '<div style="padding:24px">' +
    '<h2 style="margin:0 0 12px;font-size:20px;color:' + brand + '">' + escapeHtml(copy.heading) + '</h2>' +
    '<p style="margin:0 0 6px">Hi ' + escapeHtml(firstName) + ',</p>' +
    '<p style="margin:0 0 4px;font-size:15px;line-height:1.5">' + escapeHtml(n.body) + '</p>' +
    '<p style="margin:24px 0"><a href="' + escapeHtml(link) + '" style="background:' + brand + ';color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block">' + escapeHtml(copy.cta) + '</a></p>' +
    '<p style="font-size:12px;color:#666;margin:0">You need to sign in to view the details.</p>' +
    '</div>' +
    '<div style="padding:14px 24px;background:#f7f8fa;border-top:1px solid #e6e8eb;font-size:12px;color:#666">' +
    'You get this email because email alerts are on for your account. ' +
    '<a href="' + escapeHtml(settings) + '" style="color:' + brand + '">Turn them off in your Inbox</a>.</div>' +
    '</div></div>';

  const text =
    'Hi ' + firstName + ',\n\n' + n.body + '\n\n' + copy.cta + ': ' + link +
    '\n\nYou need to sign in to view the details.\n' +
    'Turn email alerts off any time in your Inbox: ' + settings + '\n';

  return { subject: copy.subject, html, text, link };
}

// sendNotificationEmail: throws if the email could not be sent. With no API
// key (development) it prints the email instead, like the other mails here.
async function sendNotificationEmail(user, n) {
  const mail = buildNotificationEmail(user, n);
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') throw new Error('BREVO_API_KEY is not set');
    console.log('[mailer] BREVO_API_KEY not set. Notification email for ' + user.email + ':\n  ' +
      mail.subject + ' | ' + n.body + '\n  ' + mail.link);
    return { sent: false };
  }

  const senderEmail = process.env.MAIL_FROM_EMAIL;
  if (!senderEmail) throw new Error('MAIL_FROM_EMAIL is not set');

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderEmail, name: process.env.MAIL_FROM_NAME || 'CSPC WhereITis' },
      to: [{ email: user.email, name: user.full_name }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Brevo responded ' + res.status + ' ' + detail.slice(0, 200));
  }
  return { sent: true };
}

// ---------------------------------------------------------------------
// sendOtpEmail: emails a 6-digit code (registration, verifying an older
// account, or password reset). `purpose` is 'register' | 'verify' | 'reset'.
// `who` is { email, full_name? } — for registration there is no name yet.
// Throws if the email could not be sent; the caller then discards the code.
// In development with no BREVO_API_KEY the code is printed in the terminal.
// ---------------------------------------------------------------------
const OTP_COPY = {
  register: {
    subject: 'Your CSPC WhereITis verification code',
    heading: 'Verify your email',
    intro: 'Use this code to confirm your email address and finish creating your CSPC WhereITis account.',
    ignore: 'If you did not try to create an account, you can ignore this email.',
  },
  verify: {
    subject: 'Your CSPC WhereITis verification code',
    heading: 'Verify your email',
    intro: 'Use this code to confirm your email address so you can sign in to CSPC WhereITis.',
    ignore: 'If you did not try to sign in, you can ignore this email.',
  },
  reset: {
    subject: 'Your CSPC WhereITis password reset code',
    heading: 'Reset your password',
    intro: 'Use this code to choose a new password for your CSPC WhereITis account.',
    ignore: 'If you did not request this, you can ignore this email — your current password keeps working.',
  },
};

async function sendOtpEmail(who, code, purpose) {
  const copy = OTP_COPY[purpose];
  if (!copy) throw new Error('Unknown OTP purpose');
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('BREVO_API_KEY is not set');
    }
    console.log('[mailer] BREVO_API_KEY not set — ' + purpose + ' code for ' + who.email + ': ' + code);
    return { sent: false };
  }

  const senderEmail = process.env.MAIL_FROM_EMAIL;
  if (!senderEmail) throw new Error('MAIL_FROM_EMAIL is not set');

  const firstName = String(who.full_name || '').split(' ')[0];
  const greeting = firstName ? 'Hi ' + firstName + ',' : 'Hi,';
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">' +
    '<h2 style="margin:0 0 12px">' + escapeHtml(copy.heading) + '</h2>' +
    '<p>' + escapeHtml(greeting) + '</p>' +
    '<p>' + escapeHtml(copy.intro) + '</p>' +
    '<p style="margin:24px 0;text-align:center"><span style="display:inline-block;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:14px 22px;font-family:Consolas,Menlo,monospace;font-size:32px;font-weight:bold;letter-spacing:8px;color:#0f172a">' +
    escapeHtml(code) + '</span></p>' +
    '<p style="font-size:13px;color:#555">This code expires in 10 minutes and can be used once. Never share it with anyone — CSPC staff will never ask for it.</p>' +
    '<p style="font-size:13px;color:#555">' + escapeHtml(copy.ignore) + '</p>' +
    '</div>';
  const text =
    greeting + '\n\n' + copy.intro + '\n\nYour code: ' + code +
    '\n\nIt expires in 10 minutes and can be used once. Never share it with anyone.\n\n' + copy.ignore;

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderEmail, name: process.env.MAIL_FROM_NAME || 'CSPC WhereITis' },
      to: [{ email: who.email, name: who.full_name || who.email }],
      subject: copy.subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Brevo responded ' + res.status + ' ' + detail.slice(0, 200));
  }
  return { sent: true };
}

module.exports = {
  sendVerificationEmail, sendPasswordResetEmail, sendNotificationEmail, sendOtpEmail,
  buildNotificationEmail, verificationLink, passwordResetLink,
};
