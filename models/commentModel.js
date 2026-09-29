// models/commentModel.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Report comments (FR-12). Every query uses ? placeholders.
// -----------------------------------------------------------------------

const { pool } = require('../db');

// create: adds a comment from the report owner onto their own report.
async function create(data) {
  const [result] = await pool.execute(
    'INSERT INTO report_comments (report_id, user_id, body) VALUES (?, ?, ?)',
    [data.report_id, data.user_id, data.body]
  );
  return result.insertId;
}

// listByReport: every comment on a report, oldest first (reading order), joined with the commenter's name.
async function listByReport(reportId) {
  const [rows] = await pool.execute(
    `SELECT rc.*, u.full_name AS commenter_name
     FROM report_comments rc
     JOIN users u ON u.id = rc.user_id
     WHERE rc.report_id = ?
     ORDER BY rc.created_at ASC`,
    [reportId]
  );
  return rows;
}

module.exports = { create, listByReport };