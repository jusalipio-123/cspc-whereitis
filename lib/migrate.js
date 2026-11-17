// lib/migrate.js
// Runs once at server start. If the database was created before the
// "Other (please specify)" feature, add the missing columns and the new
// categories / locations automatically, so nobody has to run SQL by hand.
// Safe to run on every start: it does nothing when everything is in place.
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function hasColumn(table, column) {
  const [rows] = await pool.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}

async function run() {
  const columns = [
    ['categories', 'is_other', 'ALTER TABLE categories ADD COLUMN is_other TINYINT(1) NOT NULL DEFAULT 0'],
    ['locations', 'is_other', 'ALTER TABLE locations ADD COLUMN is_other TINYINT(1) NOT NULL DEFAULT 0'],
    ['reports', 'category_other', 'ALTER TABLE reports ADD COLUMN category_other VARCHAR(60) NULL AFTER category_id'],
    ['reports', 'location_other', 'ALTER TABLE reports ADD COLUMN location_other VARCHAR(120) NULL AFTER location_id'],
  ];
  let changed = false;
  for (const [table, column, sql] of columns) {
    if (!(await hasColumn(table, column))) {
      await pool.query(sql);
      changed = true;
      console.log('Database updated: added ' + table + '.' + column);
    }
  }

  // The old "Academic" copy of the CCS building now sits with the other CCS places.
  await pool.query("UPDATE locations SET zone = 'College of Computer Studies' WHERE name = 'College of Computer Studies Building' AND zone = 'Academic'");

  const [[row]] = await pool.query('SELECT COUNT(*) AS n FROM categories WHERE is_other = 1');
  if (row.n === 0) {
    const file = path.join(__dirname, '..', 'add-more-categories-locations.sql');
    const statements = fs.readFileSync(file, 'utf8')
      .split(/;\s*\n/)
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter((s) => s && !/^ALTER TABLE/i.test(s));
    for (const sql of statements) await pool.query(sql);
    console.log('Database updated: added more categories and CSPC campus locations');
  }
}

module.exports = { run };
