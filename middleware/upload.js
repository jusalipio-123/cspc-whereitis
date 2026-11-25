// middleware/upload.js
// Optional item-photo upload for the report forms.
// - multer parses multipart/form-data into memory (max 5 MB, one file named "photo").
// - Nothing is stored until the route has validated the rest of the form
//   (call savePhoto(req.file) only after validation passes), so a rejected
//   submission never leaves an orphan file behind.
// - The file type is decided by its first bytes (magic numbers), never by the
//   browser-supplied filename or MIME type, and the stored name is random.
// Fail loud on a missing dependency: a silent fallback would accept report
// submissions with photos quietly disabled, which is worse than a boot error.
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../db');

// Photos are stored in the database (table uploaded_images), NOT on local disk.
// Most hosts (Render, Railway, Heroku, Fly, ...) give the app an ephemeral disk
// that is wiped on every deploy/restart and is not shared between instances, so
// files written to public/uploads/ vanish on the live site. The database
// persists, so the image always travels with the report that points at it.
// public/uploads/ is only read as a legacy fallback (express.static) and as the
// source for lib/migrate.js importing older files into the database.
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const URL_PREFIX = '/uploads/';
const MAX_BYTES = 5 * 1024 * 1024;

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 40 },
}).single('photo');

// Express middleware. Never fails the request itself: a bad upload is recorded
// on req.uploadError so the route can re-render the form with a friendly message.
function parsePhoto(req, res, next) {
  parser(req, res, function (err) {
    if (err) {
      req.uploadError = err.code === 'LIMIT_FILE_SIZE'
        ? 'That photo is larger than 5 MB. Choose a smaller image.'
        : 'We could not read that file. Try a different image.';
    }
    next();
  });
}

function sniffExtension(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.slice(0, 6).toString('latin1'))) return '.gif';
  if (buf.length >= 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return '.webp';
  return null;
}

// Returns an error message if the uploaded file is unacceptable, else null.
function checkPhoto(req) {
  if (req.uploadError) return req.uploadError;
  if (req.file && req.file.size > 0 && !sniffExtension(req.file.buffer)) {
    return 'Photos must be JPG, PNG, GIF or WebP images.';
  }
  return null;
}

function hasPhoto(req) {
  return !!(req.file && req.file.size > 0);
}

const MIME_BY_EXT = { '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
const NAME_RE = /^[a-f0-9]{32}\.(jpg|png|gif|webp)$/;

// MySQL refuses any single query bigger than its max_allowed_packet (often only 1-4 MB on
// shared hosting) and drops the connection. So a photo is stored in small chunks: tiny
// photos in one row, larger ones split across uploaded_image_chunks. Each query stays
// well under the limit, whatever the server is set to.
const CHUNK_BYTES = 256 * 1024;

// Writes a photo under `name`. Safe to call again for a name that already exists (it is skipped).
// Returns true if it stored something.
async function storeImage(name, mime, buf) {
  const [[exists]] = await pool.query('SELECT COUNT(*) AS n FROM uploaded_images WHERE name = ?', [name]);
  if (exists.n) return false;
  try {
    if (buf.length <= CHUNK_BYTES) {
      await pool.query('INSERT INTO uploaded_images (name, mime_type, data) VALUES (?, ?, ?)', [name, mime, buf]);
    } else {
      // Row first (empty data = "look in the chunks"), then the pieces.
      await pool.query('INSERT INTO uploaded_images (name, mime_type, data) VALUES (?, ?, ?)', [name, mime, Buffer.alloc(0)]);
      for (let i = 0, seq = 0; i < buf.length; i += CHUNK_BYTES, seq++) {
        await pool.query('INSERT INTO uploaded_image_chunks (name, seq, data) VALUES (?, ?, ?)',
          [name, seq, buf.subarray(i, i + CHUNK_BYTES)]);
      }
    }
  } catch (err) {
    // Never leave a half-written photo behind.
    try { await pool.query('DELETE FROM uploaded_image_chunks WHERE name = ?', [name]); } catch (e) { /* ignore */ }
    try { await pool.query('DELETE FROM uploaded_images WHERE name = ?', [name]); } catch (e) { /* ignore */ }
    throw err;
  }
  return true;
}

// Stores the (already checked) file in the database and returns its public path,
// e.g. /uploads/ab12.jpg
async function savePhoto(file) {
  const ext = sniffExtension(file.buffer);
  const name = crypto.randomBytes(16).toString('hex') + ext;
  await storeImage(name, MIME_BY_EXT[ext], file.buffer);
  return URL_PREFIX + name;
}

// GET /uploads/:name — serves a stored photo. Mounted AFTER express.static so any
// legacy file still on disk is served first; everything else comes from the database.
async function serveUpload(req, res, next) {
  const name = String(req.params.name || '');
  if (!NAME_RE.test(name)) return next();
  try {
    const [rows] = await pool.query('SELECT mime_type, data FROM uploaded_images WHERE name = ? LIMIT 1', [name]);
    if (!rows.length) return next();
    let data = rows[0].data;
    if (!data || !data.length) {
      const [parts] = await pool.query('SELECT data FROM uploaded_image_chunks WHERE name = ? ORDER BY seq', [name]);
      if (!parts.length) return next();
      data = Buffer.concat(parts.map((r) => r.data));
    }
    res.set({
      'Content-Type': rows[0].mime_type,
      'Content-Length': data.length,
      // The name is random and never reused, so the bytes behind it never change.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.end(data);
  } catch (err) {
    return next(err);
  }
}

function isUploadPath(p) {
  return typeof p === 'string' && /^\/uploads\/[a-f0-9]{32}\.(jpg|png|gif|webp)$/.test(p);
}

// Best-effort delete of a previously uploaded photo (ignores external links).
async function removePhoto(p) {
  if (!isUploadPath(p)) return;
  try { await pool.query('DELETE FROM uploaded_image_chunks WHERE name = ?', [path.basename(p)]); } catch (e) { /* best effort */ }
  try { await pool.query('DELETE FROM uploaded_images WHERE name = ?', [path.basename(p)]); } catch (e) { /* best effort */ }
  try { await fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(p))); } catch (e) { /* already gone */ }
}

module.exports = { parsePhoto, checkPhoto, hasPhoto, savePhoto, storeImage, serveUpload, removePhoto, isUploadPath, UPLOAD_DIR, MIME_BY_EXT, NAME_RE };
