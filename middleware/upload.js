// middleware/upload.js
// Optional item-photo upload for the report forms.
// - multer parses multipart/form-data into memory (max 5 MB, one file named "photo").
// - Nothing touches the disk until the route has validated the rest of the form
//   (call savePhoto(req.file) only after validation passes), so a rejected
//   submission never leaves an orphan file behind.
// - The file type is decided by its first bytes (magic numbers), never by the
//   browser-supplied filename or MIME type, and the stored name is random.
let multer = null;
try {
  multer = require('multer');
} catch (err) {
  // Without this guard a missing package would make app.js skip the whole
  // /reports router and every report page would show "page not found".
  console.warn('[upload] multer is not installed — run "npm install". Photo upload is disabled until then.');
}
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Set UPLOAD_DIR to a persistent writable directory on production hosting.
// By default, keep uploads under the same public root served by Express.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', 'public', 'uploads');
const URL_PREFIX = '/uploads/';
const MAX_BYTES = 5 * 1024 * 1024;

const parser = multer
  ? multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_BYTES, files: 1, fields: 40 },
    }).single('photo')
  : function (req, res, cb) { cb(new Error('MULTER_MISSING')); };

// Express middleware. Never fails the request itself: a bad upload is recorded
// on req.uploadError so the route can re-render the form with a friendly message.
function parsePhoto(req, res, next) {
  parser(req, res, function (err) {
    if (err) {
      req.uploadError = err.message === 'MULTER_MISSING'
        ? 'Photo upload is not set up on this server yet (run "npm install", then restart).'
        : err.code === 'LIMIT_FILE_SIZE'
        ? 'That photo is larger than 5 MB. Choose a smaller image.'
        : 'We could not read that file. Try a different image.';
    }
    next();
  });
}

function sniffExtension(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.length >= 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return '.webp';
  return null;
}

// Returns an error message if the uploaded file is unacceptable, else null.
function checkPhoto(req) {
  if (req.uploadError) return req.uploadError;
  if (req.file && (!req.file.size || !sniffExtension(req.file.buffer))) {
    return 'Photos must be JPG, JPEG, PNG or WebP images.';
  }
  return null;
}

// Photos are optional when creating a report. Keep this helper for callers that
// explicitly need to check whether a file was supplied.
function requirePhoto(req) {
  return null; // Photos are optional; invalid/oversized files are still rejected by checkPhoto().
}

function hasPhoto(req) {
  return !!(req.file && req.file.size > 0);
}

// Writes the (already checked) file and returns its public path, e.g. /uploads/ab12.jpg
async function savePhoto(file) {
  const ext = sniffExtension(file.buffer);
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const name = crypto.randomBytes(16).toString('hex') + ext;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), file.buffer, { flag: 'wx' });
  return URL_PREFIX + name;
}

function isUploadPath(p) {
  return typeof p === 'string' && /^\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(p);
}

// Best-effort delete of a previously uploaded photo (ignores external links).
async function removePhoto(p) {
  if (!isUploadPath(p)) return;
  try { await fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(p))); } catch (e) { /* already gone */ }
}

module.exports = { UPLOAD_DIR, parsePhoto, checkPhoto, requirePhoto, hasPhoto, savePhoto, removePhoto, isUploadPath };
