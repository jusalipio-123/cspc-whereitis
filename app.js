// app.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Exports the configured Express app. Does NOT call app.listen() — that
// is server.js's job, so this file can also be required by a future test
// suite (Week 15) without binding a port.
// -----------------------------------------------------------------------

// All dates in this app are Philippine Standard Time (UTC+08:00).
process.env.TZ = 'Asia/Manila';
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const app = express();

// Behind the host's reverse proxy: trust 1 hop so req.ip is the visitor and
// req.protocol reflects HTTPS (needed by the login limiter, anti-spam, Secure cookies).
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.icons = require('./views/partials/icons.js');

// Date helpers for every view (Philippine Standard Time).
const phTime = require('./lib/time');
app.locals.fmtDate = phTime.fmtDate;
app.locals.fmtDateTime = phTime.fmtDateTime;
app.locals.todayISO = phTime.todayISO;
app.locals.isoDate = phTime.isoDate;

// ---------------------------------------------------------------------
// Body parsing + static assets
// ---------------------------------------------------------------------
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------
// Global middleware — logger, flash, identity, unread badge.
//
// These requires are deliberately NOT guarded. A missing or broken module
// must stop the boot: silently skipping identity would turn every protected
// route into a public one, and silently skipping a router would leave the
// app looking healthy while whole features 404.
// ---------------------------------------------------------------------
app.use(require('./middleware/logger'));
app.use(require('./middleware/flash'));
app.use(require('./middleware/identity').optionalIdentity);
app.use(require('./middleware/unread'));

// Expose req.identity to every view, plus the current path for the nav's
// sign-out "return here" hidden field.
app.use((req, res, next) => {
  res.locals.identity = req.identity;
  res.locals.currentPath = req.originalUrl;
  next();
});

// ---------------------------------------------------------------------
// Same-origin guard for state-changing requests. Browsers send Origin on
// form POSTs; a value from another host means a cross-site attempt to use
// the visitor's cookie. Requests without Origin (curl, health checks,
// server-to-server calls) are unaffected. This is defence in depth with
// SameSite=Lax — a per-form CSRF token is still the stronger fix.
// ---------------------------------------------------------------------
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();

  let sameOrigin = false;
  try {
    sameOrigin = new URL(origin).host.toLowerCase() === String(req.get('host') || '').toLowerCase();
  } catch (err) {
    sameOrigin = false;
  }
  if (!sameOrigin) return res.status(403).render('errors/403', { title: 'Forbidden' });
  return next();
});

// ---------------------------------------------------------------------
// Routes — each router is mounted exactly once. The more specific
// /admin/moderation mount comes before /admin so it wins on prefix match.
// ---------------------------------------------------------------------
app.use('/', require('./routes/home'));
app.use('/reports', require('./routes/reports'));
app.use('/claims', require('./routes/claims'));
app.use('/', require('./routes/myReports'));

app.use('/admin/login', require('./routes/adminAuth'));
app.use('/admin/moderation', require('./routes/moderation'));
app.use('/admin', require('./routes/admin'));

app.use('/notifications', require('./routes/notifications'));
app.use('/messages', require('./routes/messages'));
app.use('/', require('./routes/pages'));

// ---------------------------------------------------------------------
// GET /health
// Returns a small JSON status blob. Intentionally has NO auth/identity
// requirement: uptime monitors, load balancers, and lab TAs checking
// "is the server even up" must be able to hit this without a student
// number + PIN. It reveals nothing sensitive — just process uptime and
// whether the DB ping succeeded — so leaving it open is not a privacy
// or security concern at this scope.
// ---------------------------------------------------------------------
app.get('/health', async (req, res) => {
  try {
    await db.ping();
    res.status(200).json({ status: 'ok', uptime: process.uptime(), db: 'up' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', uptime: process.uptime(), db: 'down' });
  }
});

// ---------------------------------------------------------------------
// 404 handler — registered after all routers so it only catches requests
// nothing above matched. Renders a real page, never a stack trace.
// ---------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Not found' });
});

// ---------------------------------------------------------------------
// 4-argument error handler — MUST be registered last. Express identifies
// an error-handling middleware purely by its arity (err, req, res, next).
// The client never receives err.stack or err.message directly — only a
// generic message plus a short reference id for support.
// ---------------------------------------------------------------------
app.use((err, req, res, next) => {
  const refId = crypto.randomUUID();
  console.error(`[error] ref=${refId} ${req.method} ${req.originalUrl}`, err.stack);
  res.status(500).render('errors/500', {
    title: 'Something went wrong',
    refId,
  });
});

module.exports = app;
