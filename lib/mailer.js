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

module.exports = { sendVerificationEmail, verificationLink };
