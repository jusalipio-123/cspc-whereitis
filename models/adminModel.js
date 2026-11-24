// models/adminModel.js
// CSPC WhereITis — queries used only by the admin console (routes/adminManage.js).
// Every query uses ? placeholders; nothing from the browser is concatenated into SQL.

const { pool } = require('../db');

async function badges() {
  const [rows] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM reports WHERE submitter_type = 'guest' AND moderation_status = 'pending') AS guestPending,
       (SELECT COUNT(*) FROM claims WHERE status = 'pending') AS claimsPending`
  );
  return { guestPending: Number(rows[0].guestPending), claimsPending: Number(rows[0].claimsPending) };
}

async function counts() {
  const [rows] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM reports) AS reportsTotal,
       (SELECT COUNT(*) FROM reports WHERE status = 'open' AND moderation_status = 'approved') AS reportsOpen,
       (SELECT COUNT(*) FROM reports WHERE moderation_status = 'rejected') AS reportsHidden,
       (SELECT COUNT(*) FROM report_comments) AS commentsTotal,
       (SELECT COUNT(*) FROM users) AS usersTotal`
  );
  const r = rows[0];
  const out = {};
  Object.keys(r).forEach((k) => { out[k] = Number(r[k]); });
  return out;
}

function pageArgs(filters) {
  const perPage = Math.min(Math.max(Number(filters.perPage) || 25, 1), 100);
  const page = Math.max(Number(filters.page) || 1, 1);
  return { perPage, page, offset: (page - 1) * perPage };
}

// ---- Comments --------------------------------------------------------
async function listComments(filters = {}) {
  const { perPage, page, offset } = pageArgs(filters);
  const where = ['1 = 1'];
  const params = [];
  if (filters.q) {
    where.push('(rc.body LIKE ? OR u.full_name LIKE ? OR u.student_no LIKE ? OR r.reference_no LIKE ?)');
    const like = `%${filters.q}%`;
    params.push(like, like, like, like);
  }
  const from = `FROM report_comments rc
                JOIN reports r ON r.id = rc.report_id
                JOIN users u ON u.id = rc.user_id
                WHERE ${where.join(' AND ')}`;
  const [count] = await pool.query(`SELECT COUNT(*) AS total ${from}`, params);
  const [rows] = await pool.query(
    `SELECT rc.id, rc.body, rc.created_at, r.reference_no, r.title AS report_title,
            u.full_name AS author_name, u.student_no AS author_no
       ${from}
      ORDER BY rc.created_at DESC, rc.id DESC
      LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );
  return { rows, total: Number(count[0].total), page, perPage };
}

async function deleteComment(id) {
  const [result] = await pool.query('DELETE FROM report_comments WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

// ---- Reports ---------------------------------------------------------
// Hard delete. Claims, comments, status history, bookmarks, notifications and
// message threads for the report are removed by ON DELETE CASCADE.
async function deleteReport(id) {
  const [result] = await pool.query('DELETE FROM reports WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

// Hide = take the report off every public page without deleting it. Public
// queries only show moderation_status = 'approved'.
async function setVisibility(id, visible, adminId, note) {
  const [result] = await pool.query(
    `UPDATE reports
        SET moderation_status = ?, moderated_by = ?, moderated_at = NOW(), moderation_note = ?
      WHERE id = ?`,
    [visible ? 'approved' : 'rejected', adminId, note, id]
  );
  return result.affectedRows > 0;
}

// ---- Users -----------------------------------------------------------
async function listUsers(filters = {}) {
  const { perPage, page, offset } = pageArgs(filters);
  const where = ['1 = 1'];
  const params = [];
  if (filters.role) { where.push('u.role = ?'); params.push(filters.role); }
  if (filters.q) {
    where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.student_no LIKE ?)');
    const like = `%${filters.q}%`;
    params.push(like, like, like);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [count] = await pool.query(`SELECT COUNT(*) AS total FROM users u ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT u.id, u.student_no, u.full_name, u.email, u.role, u.email_verified_at, u.created_at,
            (SELECT COUNT(*) FROM reports r WHERE r.user_id = u.id) AS report_count
       FROM users u
       ${whereSql}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ? OFFSET ?`,
    [...params, perPage, offset]
  );
  return { rows, total: Number(count[0].total), page, perPage };
}

// Admin accounts can never be created or changed here: the admin role comes
// only from ADMIN_EMAILS (see lib/migrate.js) or a manual SQL update.
async function setUserRole(id, role) {
  if (!['user', 'staff', 'teacher'].includes(role)) return false;
  const [result] = await pool.query(
    "UPDATE users SET role = ? WHERE id = ? AND role <> 'admin'",
    [role, id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  badges, counts, listComments, deleteComment,
  deleteReport, setVisibility, listUsers, setUserRole,
};
