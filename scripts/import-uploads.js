// scripts/import-uploads.js
// Copies photos from public/uploads/ into the uploaded_images table of the database
// named in .env, then lists reports whose photo is still missing.
// Use it to rescue photos that exist on your computer but not on the live site:
//   1. Put the live DB credentials in .env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL=true if needed)
//   2. node scripts/import-uploads.js
// Safe to re-run: existing images are skipped.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const up = require('../middleware/upload');

(async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS uploaded_images (
    name CHAR(36) NOT NULL PRIMARY KEY, mime_type VARCHAR(40) NOT NULL,
    data MEDIUMBLOB NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS uploaded_image_chunks (
    name CHAR(36) NOT NULL, seq INT NOT NULL, data BLOB NOT NULL, PRIMARY KEY (name, seq)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const files = fs.existsSync(up.UPLOAD_DIR) ? fs.readdirSync(up.UPLOAD_DIR).filter((f) => up.NAME_RE.test(f)) : [];
  let added = 0;
  for (const f of files) {
    try {
      if (await up.storeImage(f, up.MIME_BY_EXT[path.extname(f)], fs.readFileSync(path.join(up.UPLOAD_DIR, f)))) added++;
    } catch (e) { console.error('  skipped ' + f + ': ' + e.message); }
  }
  console.log(`Local files: ${files.length}, newly imported: ${added}`);

  const [missing] = await pool.query(
    `SELECT r.id, r.title, r.photo_url FROM reports r
     LEFT JOIN uploaded_images u ON r.photo_url = CONCAT('/uploads/', u.name)
     WHERE r.photo_url LIKE '/uploads/%' AND u.name IS NULL`);
  console.log(missing.length ? `Still missing a photo (${missing.length}) - re-upload these:` : 'Every report photo now has an image.');
  missing.forEach((m) => console.log(`  report #${m.id}  ${m.title}`));
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
