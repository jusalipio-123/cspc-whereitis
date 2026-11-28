// lib/notifyEmail.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Copies an in-app notification to the user's email. Called by
// notificationModel.create() right after the notification is saved.
//
// Rules:
//   - Never throws and never slows the request: the caller does not wait.
//   - Only verified email addresses, and only users who have not turned
//     email alerts off (users.email_notifications).
//   - Chatty types (messages, comments) send at most one email per
//     conversation / report every NOTIFY_EMAIL_COOLDOWN_MIN minutes
//     (default 15), so a back-and-forth chat does not flood an inbox. The
//     in-app notification is always created.
//   - A failed send is logged and leaves the in-app notification intact.
// -----------------------------------------------------------------------

const { pool } = require('../db');
const mailer = require('./mailer');

// Which notification types are emailed. Flip one to false to keep it in-app only.
const EMAIL_TYPES = {
  claim_filed: true,
  claim_decided: true,
  status_changed: true,
  message_received: true,
  comment_added: true,
};
const COOLDOWN_TYPES = new Set(['message_received', 'comment_added']);

function cooldownMinutes() {
  const n = Number(process.env.NOTIFY_EMAIL_COOLDOWN_MIN);
  return Number.isFinite(n) && n >= 0 ? n : 15;
}

async function maybeEmail(notificationId, { user_id, type, body, link }) {
  if (!notificationId || !user_id || !EMAIL_TYPES[type]) return { sent: false, reason: 'not-emailed' };

  const [users] = await pool.execute(
    'SELECT full_name, email, email_notifications, email_verified_at FROM users WHERE id = ?',
    [user_id]
  );
  const user = users[0];
  if (!user || !user.email) return { sent: false, reason: 'no-address' };
  if (!user.email_notifications) return { sent: false, reason: 'opted-out' };
  if (!user.email_verified_at) return { sent: false, reason: 'unverified' };

  if (COOLDOWN_TYPES.has(type) && cooldownMinutes() > 0) {
    const [recent] = await pool.execute(
      `SELECT COUNT(*) AS n FROM notifications
        WHERE user_id = ? AND type = ? AND link = ? AND id <> ?
          AND emailed_at IS NOT NULL AND emailed_at > (NOW() - INTERVAL ? MINUTE)`,
      [user_id, type, link, notificationId, cooldownMinutes()]
    );
    if (Number(recent[0].n) > 0) return { sent: false, reason: 'cooldown' };
  }

  // Claim the row first so two quick events cannot both send.
  const [claimed] = await pool.execute(
    'UPDATE notifications SET emailed_at = NOW() WHERE id = ? AND emailed_at IS NULL',
    [notificationId]
  );
  if (!claimed.affectedRows) return { sent: false, reason: 'already-sent' };

  try {
    const out = await mailer.sendNotificationEmail(user, { type, body, link });
    if (!out.sent) await pool.execute('UPDATE notifications SET emailed_at = NULL WHERE id = ?', [notificationId]);
    return out;
  } catch (err) {
    await pool.execute('UPDATE notifications SET emailed_at = NULL WHERE id = ?', [notificationId]).catch(() => {});
    console.error('[notifications] email failed for notification ' + notificationId + ': ' + err.message);
    return { sent: false, reason: 'send-failed' };
  }
}

// queue: fire and forget. Safe to call without await.
function queue(notificationId, n) {
  setImmediate(() => {
    maybeEmail(notificationId, n).catch((err) => {
      console.error('[notifications] email step failed: ' + err.message);
    });
  });
}

module.exports = { maybeEmail, queue, EMAIL_TYPES };
