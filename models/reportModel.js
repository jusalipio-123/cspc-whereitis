// models/reportModel.js
// CSPC WhereITis - Lost & Found Management System
// -----------------------------------------------------------------------
// All report reads/writes. Every query uses ? placeholders; user input
// never touches the SQL string directly - only fixed, code-defined
// fragments are ever spliced in.
// -----------------------------------------------------------------------

const { pool } = require('../db');
const db = require('../db');
const { nextReference } = require('../lib/refs');
const { canTransition } = require('../lib/status');
const tagModel = require('./tagModel');

const DETAIL_SELECT = `
  SELECT
    r.*,
    u.full_name AS reporter_name,
    c.name       AS category_name,
    c.slug       AS category_slug,
    l.name       AS location_name,
    DATEDIFF(NOW(), r.occurred_on) AS days_held
  FROM reports r
  LEFT JOIN users u ON u.id = r.user_id
  JOIN categories c ON c.id = r.category_id
  JOIN locations l  ON l.id = r.location_id
`;

// Legacy visibility filter. Every report is public now (there is no review
// step), so this is always true; it is a fixed fragment, never user input.
// A report the uploader withdrew is archived with this exact reason (see
// withdraw() below). Only the uploader may see such a report; every public
// query below hides it through APPROVED / the fragments that follow.
const WITHDRAWN_REASON = 'withdrawn by owner';
const NOT_WITHDRAWN = `NOT (r.status = 'archived' AND COALESCE(r.archived_reason, '') = '${WITHDRAWN_REASON}')`;
// Same condition for queries that read `reports` without the "r" alias.
const NOT_WITHDRAWN_BARE = `NOT (status = 'archived' AND COALESCE(archived_reason, '') = '${WITHDRAWN_REASON}')`;
const APPROVED = `r.moderation_status = 'approved' AND ${NOT_WITHDRAWN}`;

// isWithdrawn: true when the uploader withdrew this report.
function isWithdrawn(report) {
  return !!report && report.status === 'archived' && report.archived_reason === WITHDRAWN_REASON;
}

// canView: withdrawn reports are visible to their uploader only.
function canView(report, identity) {
  if (!report) return false;
  if (!isWithdrawn(report)) return true;
  return !!identity && !!report.user_id && report.user_id === identity.userId;
}

// Fixed fragment, only appended when a tag filter is active.
const TAG_JOIN = `
  JOIN report_tags rt ON rt.report_id = r.id
  JOIN tags tg        ON tg.id = rt.tag_id
`;

// attachTags: adds report.tags = [{ id, slug, label }, ...] to every row.
// This is one small query per report, which is fine at this scale. A
// future optimisation is a single "WHERE report_id IN (...)" query
// batched over all the ids on the page.
async function attachTags(rows) {
  await Promise.all(
    rows.map(async (row) => {
      row.tags = await tagModel.getTagsForReport(row.id);
    })
  );
  return rows;
}

async function attachTagsToOne(row) {
  if (row) {
    row.tags = await tagModel.getTagsForReport(row.id);
  }
  return row;
}

// create: REGISTERED report. Generates the reference number first
// (lib/refs.js runs its own SELECT ... FOR UPDATE transaction), inserts
// the report, then stores its tags. The route validates everything BEFORE
// calling create(). submitter_type / moderation_status take their column
// defaults ('registered' / 'approved'), so this path is unchanged.
async function create(data) {
  const referenceNo = await nextReference(data.kind);
  const [result] = await pool.query(
    `INSERT INTO reports (
       reference_no, user_id, kind, category_id, location_id,
       title, description, occurred_on, holding_location, photo_url
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      referenceNo,
      data.user_id,
      data.kind,
      data.category_id,
      data.location_id,
      data.title,
      data.description,
      data.occurred_on,
      data.holding_location || null,
      data.photo_url || null
    ]
  );
  return findByReference(referenceNo);
}

// findByReference: public detail-page lookup by the LF-YYYY-NNNN code.
async function findByReference(referenceNo) {
  const [rows] = await pool.execute(`${DETAIL_SELECT} WHERE r.reference_no = ?`, [referenceNo]);
  return attachTagsToOne(rows[0] || null);
}

// findById: same shape as findByReference but by numeric PK.
async function findById(id) {
  const [rows] = await pool.execute(`${DETAIL_SELECT} WHERE r.id = ?`, [id]);
  return attachTagsToOne(rows[0] || null);
}

// list: /reports filter + search + pagination. Only fixed SQL fragments
// are concatenated; every user value goes through the params array.
async function list(filters = {}) {
  const {
    kind, category_id, location_id, status, from, to, q, tag_slug,
    sort = 'newest', active_only = false,
    page = 1, perPage = 12,
  } = filters;

  const where = [APPROVED];
  const params = [];

  if (kind) { where.push('r.kind = ?'); params.push(kind); }
  if (category_id) { where.push('r.category_id = ?'); params.push(category_id); }
  if (location_id) { where.push('r.location_id = ?'); params.push(location_id); }
  if (status) { where.push('r.status = ?'); params.push(status); }
  // Lost / Found boards only show items that are still unresolved unless asked otherwise.
  else if (active_only) { where.push("r.status IN ('open','matched')"); }
  if (from) { where.push('r.occurred_on >= ?'); params.push(from); }
  if (to) { where.push('r.occurred_on <= ?'); params.push(to); }
  if (tag_slug) { where.push('tg.slug = ?'); params.push(tag_slug); }
  if (q) {
    // '%q%' is a bound parameter, never interpolated into the SQL string.
    where.push('(r.title LIKE ? OR r.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const tagJoin = tag_slug ? TAG_JOIN : '';

  // ORDER BY comes from a fixed allow-list; the user value is never interpolated.
  const ORDERS = {
    newest: 'r.created_at DESC',   // most recently reported
    oldest: 'r.occurred_on ASC',   // missing / held the longest
    recent: 'r.occurred_on DESC',  // happened most recently
    title:  'r.title ASC',
  };
  const orderBy = ORDERS[sort] || ORDERS.newest;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM reports r ${tagJoin} ${whereClause}`,
    params
  );
  const total = countRows[0].total;

  const safePerPage = Math.min(Math.max(Number(perPage) || 12, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safePerPage;

  // LIMIT/OFFSET are server-computed integers passed as bound params.
  // They are sent as strings because mysql2's execute() sends JS numbers
  // as DOUBLE, which MySQL 8.0.22+ rejects for LIMIT/OFFSET placeholders.
  const [rows] = await pool.execute(
    `${DETAIL_SELECT} ${tagJoin} ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, String(safePerPage), String(offset)]
  );
  await attachTags(rows);

  return {
    rows,
    total,
    page: safePage,
    perPage: safePerPage,
    totalPages: Math.max(Math.ceil(total / safePerPage), 1),
  };
}

// updateWhileOpen: the WHERE clause enforces ownership (user_id = ?) AND
// that the report is still editable (status = 'open'). Tags are only
// touched when the UPDATE actually matched a row.
async function updateWhileOpen(id, userId, data) {
  const [result] = await pool.query(
    `UPDATE reports
     SET title = ?, description = ?, category_id = ?, location_id = ?,
         occurred_on = ?, holding_location = ?, photo_url = ?, updated_at = NOW()
     WHERE id = ? AND user_id = ? AND status = 'open'`,
    [
      data.title,
      data.description,
      data.category_id,
      data.location_id,
      data.occurred_on,
      data.holding_location || null,
      data.photo_url || null,
      id,
      userId
    ]
  );
  return result.affectedRows;
}
// setStatus: the general status gateway. Read-check-write-history all
// inside ONE transaction so the audit row (NFR-08) can never disagree
// with the actual status.
async function setStatus(id, newStatus, changedBy, note = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      'SELECT status FROM reports WHERE id = ? FOR UPDATE',
      [id]
    );
    if (rows.length === 0) {
      throw new Error('Report not found.');
    }
    const currentStatus = rows[0].status;

    if (!canTransition(currentStatus, newStatus)) {
      throw new Error(`That status change is not allowed from ${currentStatus}.`);
    }

    await conn.execute('UPDATE reports SET status = ? WHERE id = ?', [newStatus, id]);
    await conn.execute(
      `INSERT INTO report_status_history (report_id, from_status, to_status, changed_by, note)
       VALUES (?, ?, ?, ?, ?)`,
      [id, currentStatus, newStatus, changedBy, note]
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

// withdraw: owner-only soft-delete (archive with a fixed reason).
async function withdraw(id, userId) {
  const [result] = await pool.execute(
    `UPDATE reports
     SET status = 'archived', archived_reason = ?
     WHERE id = ? AND user_id = ? AND status = 'open'`,
    [WITHDRAWN_REASON, id, userId]
  );
  if (result.affectedRows > 0) {
    await pool.execute(
      `INSERT INTO report_status_history (report_id, from_status, to_status, changed_by, note)
       VALUES (?, 'open', 'archived', ?, ?)`,
      [id, userId, WITHDRAWN_REASON]
    );
  }
  return result.affectedRows;
}

// markReturned: owner action (FR-13). The legality check goes through
// lib/status.canTransition so TRANSITIONS stays the single source of truth.
async function markReturned(id, returnedTo, changedBy) {
  const [beforeRows] = await pool.execute('SELECT status FROM reports WHERE id = ?', [id]);
  if (beforeRows.length === 0) return 0;
  const fromStatus = beforeRows[0].status;

  if (!canTransition(fromStatus, 'returned')) {
    throw new Error(`That status change is not allowed from ${fromStatus}.`);
  }

  // "AND status = ?" guards against another request changing the status
  // between the SELECT above and this UPDATE.
  const [result] = await pool.execute(
    `UPDATE reports
     SET status = 'returned', returned_to = ?, returned_at = NOW()
     WHERE id = ? AND status = ?`,
    [returnedTo, id, fromStatus]
  );
  if (result.affectedRows > 0) {
    await pool.execute(
      `INSERT INTO report_status_history (report_id, from_status, to_status, changed_by, note)
       VALUES (?, ?, 'returned', ?, 'Marked returned by owner')`,
      [id, fromStatus, changedBy]
    );
  }
  return result.affectedRows;
}

// archive: owner action (FR-15), same canTransition rule as markReturned.
async function archive(id, reason, changedBy) {
  const [beforeRows] = await pool.execute('SELECT status FROM reports WHERE id = ?', [id]);
  if (beforeRows.length === 0) return 0;
  const fromStatus = beforeRows[0].status;

  if (!canTransition(fromStatus, 'archived')) {
    throw new Error(`That status change is not allowed from ${fromStatus}.`);
  }

  const [result] = await pool.execute(
    `UPDATE reports SET status = 'archived', archived_reason = ? WHERE id = ? AND status = ?`,
    [reason, id, fromStatus]
  );
  if (result.affectedRows > 0) {
    await pool.execute(
      `INSERT INTO report_status_history (report_id, from_status, to_status, changed_by, note)
       VALUES (?, ?, 'archived', ?, ?)`,
      [id, fromStatus, changedBy, reason]
    );
  }
  return result.affectedRows;
}

// findByUser: every report a user filed, newest first (My Reports).
async function findByUser(userId) {
  const [rows] = await pool.execute(
    `${DETAIL_SELECT} WHERE r.user_id = ? ORDER BY r.created_at DESC`,
    [userId]
  );
  return attachTags(rows);
}

// latestN: newest N reports for the home page. The limit is a clamped,
// server-computed integer bound as a ? placeholder (sent as a string, see
// the note in list()).
async function latestN(n) {
  const safeN = Math.min(Math.max(Number(n) || 6, 1), 50);
  const [rows] = await pool.execute(
    `${DETAIL_SELECT} WHERE ${APPROVED} ORDER BY r.created_at DESC LIMIT ?`,
    [String(safeN)]
  );
  return attachTags(rows);
}

// latestReturned: most recently returned items, for the home page's
// "Recently Returned" section.
async function latestReturned(limit = 4) {
  const safeLimit = Math.min(Math.max(Number(limit) || 4, 1), 50);
  const [rows] = await pool.execute(
    `SELECT r.*, c.name AS category_name, c.slug AS category_slug,
            l.name AS location_name
     FROM reports r
     LEFT JOIN categories c ON c.id = r.category_id
     LEFT JOIN locations  l ON l.id = r.location_id
     WHERE r.status = 'returned' AND r.returned_at IS NOT NULL AND ${APPROVED}
     ORDER BY r.returned_at DESC
     LIMIT ?`,
    [String(safeLimit)]
  );
  return attachTags(rows);
}

// countByStatus: one row per status, reshaped into a plain object.
async function countByStatus() {
  const [rows] = await pool.execute(
    `SELECT status, COUNT(*) AS total FROM reports WHERE moderation_status = 'approved' AND ${NOT_WITHDRAWN_BARE} GROUP BY status`
  );
  const counts = { open: 0, matched: 0, claimed: 0, returned: 0, archived: 0 };
  rows.forEach((row) => {
    counts[row.status] = row.total;
  });
  return counts;
}

// itemsAgingOver: found items still uncollected past `days` (FR-14).
async function itemsAgingOver(days) {
  const [rows] = await pool.execute(
    `${DETAIL_SELECT}
     WHERE r.kind = 'found' AND ${APPROVED}
       AND r.status IN ('open', 'matched', 'claimed')
       AND DATEDIFF(NOW(), r.occurred_on) > ?
     ORDER BY r.occurred_on ASC`,
    [days]
  );
  return rows;
}

// findForMatching: raw candidate pool for the matching engine.
async function findForMatching(reportId, windowDays) {
  const report = await findById(reportId);
  if (!report) return [];

  const oppositeKind = report.kind === 'lost' ? 'found' : 'lost';

  const [rows] = await pool.execute(
    `${DETAIL_SELECT}
     WHERE r.kind = ? AND ${APPROVED}
       AND r.category_id = ?
       AND r.id <> ?
       AND r.status != 'archived'
       AND ABS(DATEDIFF(r.occurred_on, ?)) <= ?`,
    [oppositeKind, report.category_id, report.id, report.occurred_on, windowDays]
  );
  return rows;
}

// overview: numbers for the All-reports dashboard. One query, reshaped.
async function overview() {
  const [rows] = await pool.execute(
<<<<<<< HEAD
    `SELECT kind, status, COUNT(*) AS total FROM reports WHERE moderation_status = 'approved' AND ${NOT_WITHDRAWN_BARE} GROUP BY kind, status`
=======
    'SELECT kind, status, COUNT(*) AS total FROM reports GROUP BY kind, status'
>>>>>>> 93c7506e4d5e5c24efaad28b38eb79c32b9ca749
  );
  const out = {
    total: 0,
    byStatus: { open: 0, matched: 0, claimed: 0, returned: 0, archived: 0 },
    lost: { total: 0, active: 0 },
    found: { total: 0, active: 0, returned: 0 },
  };
  rows.forEach((r) => {
    const n = Number(r.total);
    out.total += n;
    out.byStatus[r.status] = (out.byStatus[r.status] || 0) + n;
    if (out[r.kind]) {
      out[r.kind].total += n;
      if (r.status === 'open' || r.status === 'matched') out[r.kind].active += n;
      if (r.kind === 'found' && r.status === 'returned') out.found.returned += n;
    }
  });
  out.returnRate = out.found.total ? Math.round((out.found.returned / out.found.total) * 100) : 0;
  return out;
}

// facets: category + location counts for the Lost / Found sidebars
// (unresolved items of one kind only).
async function facets(kind) {
  const [cats] = await pool.execute(
    `SELECT c.slug, c.name, COUNT(*) AS n
       FROM reports r JOIN categories c ON c.id = r.category_id
<<<<<<< HEAD
      WHERE r.kind = ? AND ${APPROVED} AND r.status IN ('open','matched')
=======
      WHERE r.kind = ? AND r.status IN ('open','matched')
>>>>>>> 93c7506e4d5e5c24efaad28b38eb79c32b9ca749
      GROUP BY c.id, c.slug, c.name ORDER BY n DESC, c.name ASC`, [kind]);
  const [locs] = await pool.execute(
    `SELECT l.id, l.name, COUNT(*) AS n
       FROM reports r JOIN locations l ON l.id = r.location_id
<<<<<<< HEAD
      WHERE r.kind = ? AND ${APPROVED} AND r.status IN ('open','matched')
=======
      WHERE r.kind = ? AND r.status IN ('open','matched')
>>>>>>> 93c7506e4d5e5c24efaad28b38eb79c32b9ca749
      GROUP BY l.id, l.name ORDER BY n DESC, l.name ASC`, [kind]);
  return { categories: cats, locations: locs };
}

// expiringSoon: found items nearing the end of the holding period.
async function expiringSoon(minDays = 60, limit = 4) {
  const [rows] = await pool.execute(
    `${DETAIL_SELECT}
<<<<<<< HEAD
     WHERE r.kind = 'found' AND r.status = 'open' AND ${APPROVED}
=======
     WHERE r.kind = 'found' AND r.status = 'open'
>>>>>>> 93c7506e4d5e5c24efaad28b38eb79c32b9ca749
       AND DATEDIFF(NOW(), r.occurred_on) >= ?
     ORDER BY r.occurred_on ASC LIMIT ?`,
    [String(minDays), String(limit)]
  );
  return attachTags(rows);
}

module.exports = {
  create,
  findByReference,
  findById,
  list,
  updateWhileOpen,
  setStatus,
  withdraw,
  isWithdrawn,
  canView,
  WITHDRAWN_REASON,
  markReturned,
  archive,
  findByUser,
  latestN,
  latestReturned,
  countByStatus,
  itemsAgingOver,
  findForMatching,
  overview,
  facets,
  expiringSoon,
};