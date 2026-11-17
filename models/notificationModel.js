// models/notificationModel.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// In-app notifications for registered users. Every query uses ? placeholders.
// -----------------------------------------------------------------------

const { pool } = require('../db');

// create: never throws into the caller. A failed notification must not undo
// the real action (filing a claim, changing a status) that triggered it.
async function create({ user_id, type, report_id = null, body, link }) {
  if (!user_id) return null; // nobody to notify
  try {
    const [result] = await pool.execute(
      'INSERT INTO notifications (user_id, type, report_id, body, link) VALUES (?, ?, ?, ?, ?)',
      [user_id, type, report_id, String(body).slice(0, 255), link]
    );
    return result.insertId;
  } catch (err) {
    console.error('[notifications] could not create notification:', err.message);
    return null;
  }
}

async function listByUser(userId, limit = 50) {
  const safe = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const [rows] = await pool.execute(
    `SELECT id, type, report_id, body, link, is_read, created_at
     FROM notifications WHERE user_id = ?
     ORDER BY created_at DESC, id DESC LIMIT ?`,
    [userId, String(safe)]
  );
  return rows;
}

async function unreadCount(userId) {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId]
  );
  return Number(rows[0].n);
}

// markRead / markAllRead: the user_id in the WHERE clause is the ownership
// check, so nobody can mark someone else's notification.
async function markRead(id, userId) {
  const [r] = await pool.execute(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, userId]);
  return r.affectedRows;
}

async function markAllRead(userId) {
  const [r] = await pool.execute(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);
  return r.affectedRows;
}

// markLinkRead: opening a message thread clears its notification(s).
async function markLinkRead(userId, link) {
  await pool.execute(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND link = ? AND is_read = 0',
    [userId, link]
  );
}

module.exports = { create, listByUser, unreadCount, markRead, markAllRead, markLinkRead };
