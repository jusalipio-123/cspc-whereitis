// models/noteModel.js
// CSPC WhereITis - Lost & Found Management System
// -----------------------------------------------------------------------
// Staff-only internal notes. These are NOT public comments: they must
// never be loaded by the public report page, the print receipt, or any
// guest-facing route. Every query uses ? placeholders.
// -----------------------------------------------------------------------
   // Staff-only internal notes. These are never shown on the public report
   // page — the route only passes them to the view when the signed-in user
   // has role='staff' or role='admin'.

const { pool } = require('../db');

// create: adds an internal note to a report.
async function create(data) {
  const [result] = await pool.execute(
    'INSERT INTO report_notes (report_id, author_user_id, body) VALUES (?, ?, ?)',
    [data.report_id, data.author_user_id, data.body]
  );
  return result.insertId;
}

// listByReport: notes oldest-first (reading order), with the author's name.
async function listByReport(reportId) {
  const [rows] = await pool.execute(
    `SELECT n.*, u.full_name AS author_name
     FROM report_notes n
     JOIN users u ON u.id = n.author_user_id
     WHERE n.report_id = ?
     ORDER BY n.created_at ASC, n.id ASC`,
    [reportId]
  );
  return rows;
}

// countByReport: how many notes a report has (for the staff queue).
async function countByReport(reportId) {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS n FROM report_notes WHERE report_id = ?',
    [reportId]
  );
  return rows[0].n;
}

module.exports = { create, listByReport, countByReport };