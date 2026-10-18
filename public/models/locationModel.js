// models/locationModel.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Location lookup table, managed by admin. Every query uses ? placeholders.
// -----------------------------------------------------------------------

const { pool } = require('../db');

// list: every location grouped by zone for admin/staff screens.
async function list() {
  const [rows] = await pool.execute(
    'SELECT * FROM locations ORDER BY zone ASC, name ASC'
  );
  return rows;
}

// listPublic: only locations students should see in the report-a-lost/found-item dropdown, hiding internal-only holding spots.
async function listPublic() {
  const [rows] = await pool.execute(
    'SELECT * FROM locations WHERE is_public = 1 ORDER BY zone ASC, name ASC'
  );
  return rows;
}

// findBySlug: locations have no slug column in the schema, but the public filter UI may still pass a name-derived slug; kept for interface symmetry with categoryModel and resolved via a name match.
async function findBySlug(slug) {
  const [rows] = await pool.execute(
    'SELECT * FROM locations WHERE LOWER(REPLACE(name, " ", "-")) = ?',
    [slug]
  );
  return rows[0] || null;
}

// findById: used internally when a report references location_id.
async function findById(id) {
  const [rows] = await pool.execute('SELECT * FROM locations WHERE id = ?', [id]);
  return rows[0] || null;
}

// create: admin-only location creation; UNIQUE(name) will throw errno 1062 on a duplicate.
async function create(data) {
  const [result] = await pool.execute(
    'INSERT INTO locations (name, zone, is_public) VALUES (?, ?, ?)',
    [data.name, data.zone || null, data.is_public === false ? 0 : 1]
  );
  return findById(result.insertId);
}

module.exports = { list, listPublic, findBySlug, findById, create };