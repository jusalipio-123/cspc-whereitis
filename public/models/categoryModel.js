// models/categoryModel.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Category lookup table, managed by admin (FR context: "admin manages
// categories and locations"). `slug` is UNIQUE at the schema level — a
// duplicate slug throws a MySQL error 1062 from create()/update(); the
// caller (routes/admin.js) must catch that and show a friendly
// "that slug is already in use" validation message rather than letting
// the raw driver error reach the user.
// -----------------------------------------------------------------------

const { pool } = require('../db');

// list: every category, in the display order staff configured, alphabetical within the same sort_order.
async function list() {
  const [rows] = await pool.execute(
    'SELECT * FROM categories ORDER BY sort_order ASC, name ASC'
  );
  return rows;
}

// findBySlug: used by public filter URLs like /reports?category=bags.
async function findBySlug(slug) {
  const [rows] = await pool.execute('SELECT * FROM categories WHERE slug = ?', [slug]);
  return rows[0] || null;
}

// findById: used internally when a report references category_id.
async function findById(id) {
  const [rows] = await pool.execute('SELECT * FROM categories WHERE id = ?', [id]);
  return rows[0] || null;
}

// create: admin-only category creation; UNIQUE(name)/UNIQUE(slug) will throw errno 1062 on a duplicate.
async function create(data) {
  const [result] = await pool.execute(
    'INSERT INTO categories (name, slug, icon_key, sort_order) VALUES (?, ?, ?, ?)',
    [data.name, data.slug, data.icon_key || null, data.sort_order || 0]
  );
  return findById(result.insertId);
}

// update: admin-only category edit; same UNIQUE-key caveat as create().
async function update(id, data) {
  const [result] = await pool.execute(
    'UPDATE categories SET name = ?, slug = ?, icon_key = ?, sort_order = ? WHERE id = ?',
    [data.name, data.slug, data.icon_key || null, data.sort_order || 0, id]
  );
  return result.affectedRows;
}

module.exports = { list, findBySlug, findById, create, update };