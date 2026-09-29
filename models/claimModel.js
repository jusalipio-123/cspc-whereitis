// models/claimModel.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// All claim reads/writes. Every query uses ? placeholders.
// -----------------------------------------------------------------------

const { pool } = require('../db');

const DETAIL_SELECT = `
  SELECT
    cl.*,
    r.reference_no, r.title AS report_title, r.kind AS report_kind, r.status AS report_status,
    u.full_name AS claimant_name, u.student_no AS claimant_student_no
  FROM claims cl
  JOIN reports r ON r.id = cl.report_id
  JOIN users u   ON u.id = cl.claimant_user_id
`;

// create: inserts a new claim; the UNIQUE (report_id, claimant_user_id) key enforces "one claim per user per report" at the database level.
async function create(data) {
  try {
    const [result] = await pool.execute(
      `INSERT INTO claims (report_id, claimant_user_id, proof_text, distinguishing_features, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [data.report_id, data.claimant_user_id, data.proof_text, data.distinguishing_features]
    );
    return findById(result.insertId);
  } catch (err) {
    // MySQL error 1062 = duplicate entry, i.e. the UNIQUE key fired —
    // translate the low-level driver error into a message a student
    // will actually understand, instead of leaking a raw SQL error.
    if (err.errno === 1062) {
      throw new Error('You have already filed a claim on this report.');
    }
    throw err;
  }
}

// findById: single claim detail, joined with its report and claimant for display.
async function findById(id) {
  const [rows] = await pool.execute(`${DETAIL_SELECT} WHERE cl.id = ?`, [id]);
  return rows[0] || null;
}

// findByReportAndUser: used before insert to detect an existing claim (friendlier pre-check than waiting for the duplicate-key error).
async function findByReportAndUser(reportId, userId) {
  const [rows] = await pool.execute(
    'SELECT * FROM claims WHERE report_id = ? AND claimant_user_id = ?',
    [reportId, userId]
  );
  return rows[0] || null;
}

// listByReport: every claim ever filed on one report, newest first — shown to the report owner and staff.
async function listByReport(reportId) {
  const [rows] = await pool.execute(
    `${DETAIL_SELECT} WHERE cl.report_id = ? ORDER BY cl.created_at DESC`,
    [reportId]
  );
  return rows;
}

// listPending: the staff review queue — every claim awaiting a decision.
async function listPending() {
  const [rows] = await pool.execute(
    `${DETAIL_SELECT} WHERE cl.status = 'pending' ORDER BY cl.created_at ASC`
  );
  return rows;
}

// listByUser: powers "My Reports" — claims a given identity has filed on other people's found reports.
async function listByUser(userId) {
  const [rows] = await pool.execute(
    `${DETAIL_SELECT} WHERE cl.claimant_user_id = ? ORDER BY cl.created_at DESC`,
    [userId]
  );
  return rows;
}

// Approves one claim and auto-rejects every other pending claim on the
// same report, in ONE transaction, then sets the report to 'claimed' and
// writes a history row. See FR-06.
async function approve(claimId, decidedBy, note = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [claimRows] = await conn.execute(
      'SELECT * FROM claims WHERE id = ? FOR UPDATE',
      [claimId]
    );
    if (claimRows.length === 0) {
      throw new Error('Claim not found.');
    }
    const claim = claimRows[0];
    if (claim.status !== 'pending') {
      throw new Error('This claim was already decided.');
    }

    await conn.execute(
      `UPDATE claims SET status = 'approved', decided_by = ?, decided_at = NOW(), decision_note = ?
       WHERE id = ?`,
      [decidedBy, note, claimId]
    );

    await conn.execute(
      `UPDATE claims
       SET status = 'rejected', decided_by = ?, decided_at = NOW(),
           decision_note = 'Another claim was approved'
       WHERE report_id = ? AND id != ? AND status = 'pending'`,
      [decidedBy, claim.report_id, claimId]
    );

    const [reportRows] = await conn.execute(
      'SELECT status FROM reports WHERE id = ? FOR UPDATE',
      [claim.report_id]
    );
    const fromStatus = reportRows[0].status;

    await conn.execute(
      `UPDATE reports SET status = 'claimed' WHERE id = ?`,
      [claim.report_id]
    );

    await conn.execute(
      `INSERT INTO report_status_history (report_id, from_status, to_status, changed_by, note)
       VALUES (?, ?, 'claimed', ?, 'Claim approved')`,
      [claim.report_id, fromStatus, decidedBy]
    );

    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// reject: decides a single claim as rejected; the report's own status is left untouched.
async function reject(claimId, decidedBy, note = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [claimRows] = await conn.execute(
      'SELECT * FROM claims WHERE id = ? FOR UPDATE',
      [claimId]
    );
    if (claimRows.length === 0) {
      throw new Error('Claim not found.');
    }
    if (claimRows[0].status !== 'pending') {
      throw new Error('This claim was already decided.');
    }

    await conn.execute(
      `UPDATE claims SET status = 'rejected', decided_by = ?, decided_at = NOW(), decision_note = ?
       WHERE id = ?`,
      [decidedBy, note, claimId]
    );

    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  create,
  findById,
  findByReportAndUser,
  listByReport,
  listPending,
  listByUser,
  approve,
  reject,
};