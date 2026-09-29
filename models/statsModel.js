// models/statsModel.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Admin dashboard aggregates (FR-16). Every query uses ? placeholders.
// -----------------------------------------------------------------------

const { pool } = require('../db');

// monthlyCounts: report volume per month per kind, for the dashboard trend chart.
async function monthlyCounts(monthsBack = 12) {
  const [rows] = await pool.execute(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, kind, COUNT(*) AS n
     FROM reports
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)
     GROUP BY ym, kind
     ORDER BY ym ASC`,
    [monthsBack]
  );
  return rows;
}

// categoryDistribution: report count per category (including zero-count categories via LEFT JOIN), for the dashboard's category mix chart.
async function categoryDistribution() {
  const [rows] = await pool.execute(
    `SELECT c.name, COUNT(r.id) AS n
     FROM categories c
     LEFT JOIN reports r ON r.category_id = c.id
     GROUP BY c.id
     ORDER BY n DESC`
  );
  return rows;
}

// topLocations: the locations with the most reports, for the dashboard's "top locations" list.
async function topLocations(limit = 10) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const [rows] = await pool.execute(
    `SELECT l.name, COUNT(r.id) AS n
     FROM locations l
     LEFT JOIN reports r ON r.location_id = l.id
     GROUP BY l.id
     ORDER BY n DESC
     LIMIT ?`,
    [safeLimit]
  );
  return rows;
}

// returnedThisMonth: home-page live counter — items successfully returned so far this calendar month.
async function returnedThisMonth() {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n
     FROM reports
     WHERE status = 'returned'
       AND YEAR(returned_at) = YEAR(NOW())
       AND MONTH(returned_at) = MONTH(NOW())`
  );
  return rows[0].n;
}

// agingOver: home-page live counter / staff dashboard — found items still uncollected past `days` since occurred_on (FR-14).
async function agingOver(days) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n
     FROM reports
     WHERE kind = 'found'
       AND status IN ('open', 'matched', 'claimed')
       AND DATEDIFF(NOW(), occurred_on) > ?`,
    [days]
  );
  return rows[0].n;
}

module.exports = {
  monthlyCounts,
  categoryDistribution,
  topLocations,
  returnedThisMonth,
  agingOver,
};