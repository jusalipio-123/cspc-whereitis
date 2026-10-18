// models/messageModel.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Direct messages between registered users, always about one report. Every query uses ? placeholders.
// -----------------------------------------------------------------------

const { pool } = require('../db');

// findOrCreateConversation: UNIQUE (report_id, starter_user_id) means a
// second "Message" click reopens the same thread. INSERT IGNORE + re-select
// is race-safe if the button is double-clicked.
async function findOrCreateConversation(reportId, ownerId, starterId) {
  await pool.execute(
    `INSERT IGNORE INTO conversations (report_id, owner_user_id, starter_user_id)
     VALUES (?, ?, ?)`,
    [reportId, ownerId, starterId]
  );
  const [rows] = await pool.execute(
    'SELECT id FROM conversations WHERE report_id = ? AND starter_user_id = ?',
    [reportId, starterId]
  );
  return rows[0].id;
}

async function findExisting(reportId, starterId) {
  const [rows] = await pool.execute(
    'SELECT id FROM conversations WHERE report_id = ? AND starter_user_id = ?',
    [reportId, starterId]
  );
  return rows[0] ? rows[0].id : null;
}

const CONV_SELECT = `
  SELECT c.*, r.reference_no, r.title AS report_title,
         ou.full_name AS owner_name, su.full_name AS starter_name
  FROM conversations c
  JOIN reports r ON r.id = c.report_id
  JOIN users ou  ON ou.id = c.owner_user_id
  JOIN users su  ON su.id = c.starter_user_id
`;

// getForUser: returns the conversation ONLY if userId is one of its two
// participants - the route treats null as a 404, so a thread's existence is
// never confirmed to an outsider.
async function getForUser(id, userId) {
  const [rows] = await pool.execute(
    `${CONV_SELECT} WHERE c.id = ? AND (c.owner_user_id = ? OR c.starter_user_id = ?)`,
    [id, userId, userId]
  );
  return rows[0] || null;
}

async function listForUser(userId) {
  const [rows] = await pool.execute(
    `${CONV_SELECT.replace('SELECT c.*,', `SELECT c.*,
       (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
          AND m.sender_user_id <> ? AND m.read_at IS NULL) AS unread,`)}
     WHERE c.owner_user_id = ? OR c.starter_user_id = ?
     ORDER BY c.last_message_at DESC`,
    [userId, userId, userId]
  );
  return rows;
}

async function listMessages(conversationId) {
  const [rows] = await pool.execute(
    `SELECT m.id, m.sender_user_id, m.body, m.created_at, u.full_name AS sender_name
     FROM messages m JOIN users u ON u.id = m.sender_user_id
     WHERE m.conversation_id = ? ORDER BY m.id ASC`,
    [conversationId]
  );
  return rows;
}

async function addMessage(conversationId, senderId, body) {
  const [result] = await pool.execute(
    'INSERT INTO messages (conversation_id, sender_user_id, body) VALUES (?, ?, ?)',
    [conversationId, senderId, body]
  );
  await pool.execute('UPDATE conversations SET last_message_at = NOW() WHERE id = ?', [conversationId]);
  return result.insertId;
}

// markThreadRead: marks the OTHER person's messages as read by `userId`.
async function markThreadRead(conversationId, userId) {
  await pool.execute(
    `UPDATE messages SET read_at = NOW()
     WHERE conversation_id = ? AND sender_user_id <> ? AND read_at IS NULL`,
    [conversationId, userId]
  );
}

// countRecentBySender: backs the per-user send limit.
async function countRecentBySender(userId, minutes) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM messages
     WHERE sender_user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [userId, minutes]
  );
  return Number(rows[0].n);
}

module.exports = {
  findOrCreateConversation, findExisting, getForUser, listForUser,
  listMessages, addMessage, markThreadRead, countRecentBySender,
};
