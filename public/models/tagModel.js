// models/tagModel.js
// CSPC WhereITis - Lost & Found Management System
// -----------------------------------------------------------------------
// Tags (fixed allow-list, many-to-many with reports). Every query uses
// ? placeholders.
// -----------------------------------------------------------------------

const { pool } = require('../db');

// listAll: the whole fixed allow-list, in display order.
async function listAll() {
  const [rows] = await pool.execute(
    'SELECT * FROM tags ORDER BY sort_order ASC, label ASC'
  );
  return rows;
}

// getTagsForReport: the tags attached to one report, as { id, slug, label }.
async function getTagsForReport(reportId) {
  const [rows] = await pool.execute(
    `SELECT t.id, t.slug, t.label
     FROM report_tags rt
     JOIN tags t ON t.id = rt.tag_id
     WHERE rt.report_id = ?
     ORDER BY t.sort_order ASC, t.label ASC`,
    [reportId]
  );
  return rows;
}

// setTagsForReport: replaces a report's tags with exactly tagIds. Runs in
// one transaction so a report is never left half-tagged. Callers must
// already have validated tagIds against the allow-list; non-integers are
// dropped here defensively and duplicates are collapsed.
async function setTagsForReport(reportId, tagIds) {
  const ids = [...new Set((tagIds || []).map(Number).filter((n) => Number.isInteger(n)))];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM report_tags WHERE report_id = ?', [reportId]);
    for (const tagId of ids) {
      await conn.execute(
        'INSERT INTO report_tags (report_id, tag_id) VALUES (?, ?)',
        [reportId, tagId]
      );
    }
    await conn.commit();
    return ids.length;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// listReportsByTag: ids of every report carrying the tag with this slug.
async function listReportsByTag(tagSlug) {
  const [rows] = await pool.execute(
    `SELECT rt.report_id
     FROM report_tags rt
     JOIN tags t ON t.id = rt.tag_id
     WHERE t.slug = ?`,
    [tagSlug]
  );
  return rows.map((row) => row.report_id);
}

// countByTag: usage per tag (including unused tags), for the admin dashboard.
async function countByTag() {
  const [rows] = await pool.execute(
    `SELECT t.slug, t.label, COUNT(rt.report_id) AS n
     FROM tags t
     LEFT JOIN report_tags rt ON rt.tag_id = t.id
     GROUP BY t.id
     ORDER BY t.sort_order ASC`
  );
  return rows;
}

module.exports = {
  listAll,
  getTagsForReport,
  setTagsForReport,
  listReportsByTag,
  countByTag,
};