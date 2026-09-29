// models/bookmarkModel.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Bookmarks (FR-18). Every query uses ? placeholders.
// -----------------------------------------------------------------------

const { pool } = require('../db');

// toggle: flips a user's bookmark on a report — deletes it if present, inserts it if absent — and reports which state it ended up in.
async function toggle(userId, reportId) {
  const [existing] = await pool.execute(
    'SELECT 1 FROM bookmarks WHERE user_id = ? AND report_id = ?',
    [userId, reportId]
  );

  if (existing.length > 0) {
    await pool.execute(
      'DELETE FROM bookmarks WHERE user_id = ? AND report_id = ?',
      [userId, reportId]
    );
    return { bookmarked: false };
  }

  await pool.execute(
    'INSERT INTO bookmarks (user_id, report_id) VALUES (?, ?)',
    [userId, reportId]
  );
  return { bookmarked: true };
}

// listByUser: every report a user has bookmarked, joined with the report itself, for the "My Reports" bookmarks grid.
async function listByUser(userId) {
  const [rows] = await pool.execute(
    `SELECT b.created_at AS bookmarked_at, r.*
     FROM bookmarks b
     JOIN reports r ON r.id = b.report_id
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC`,
    [userId]
  );
  return rows;
}

// isBookmarked: quick boolean check used to render a filled/outline bookmark icon on a report detail page.
async function isBookmarked(userId, reportId) {
  const [rows] = await pool.execute(
    'SELECT 1 FROM bookmarks WHERE user_id = ? AND report_id = ?',
    [userId, reportId]
  );
  return rows.length > 0;
}

module.exports = { toggle, listByUser, isBookmarked };