// app.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Exports the configured Express app. Does NOT call app.listen() — that
// is server.js's job, so this file can also be required by a future test
// suite (Week 15) without binding a port.
// -----------------------------------------------------------------------

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const app = express();

// ---------------------------------------------------------------------
// View engine
// ---------------------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.icons = require('./views/partials/icons.js');
// ---------------------------------------------------------------------
// Body parsing + static assets
// ---------------------------------------------------------------------
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------
// Project middleware (logger, flash, identity) — built in Deliverable
// 3a. Each require is guarded so this file can already boot and be
// smoke-tested before those files exist; once they land, they load
// automatically with no change needed here.
// ---------------------------------------------------------------------
function safeRequire(modPath, label) {
  try {
    return require(modPath);
  } catch (err) {
    console.warn(`[app.js] Warning: ${label} not available yet (${err.message})`);
    return null;
  }
}

// app.js — relevant section only (middleware mounting)
// -----------------------------------------------------------------------
const logger = safeRequire('./middleware/logger', 'middleware/logger');
const flash = safeRequire('./middleware/flash', 'middleware/flash');
const identity = safeRequire('./middleware/identity', 'middleware/identity');

if (logger) app.use(logger);
if (flash) app.use(flash);
// app.js — exact lines to change
// -----------------------------------------------------------------------

// 1) The identity middleware mount: use optionalIdentity, mounted globally.
//    BEFORE:
//      if (identity) app.use(identity);
//    AFTER:
if (identity) app.use(identity.optionalIdentity);

// 2) Expose req.identity to every view via res.locals, and compute the
//    current path for the nav's sign-out "return here" hidden field.
//    Add this immediately after the identity mount:
app.use((req, res, next) => {
  res.locals.identity = req.identity;
  res.locals.currentPath = req.originalUrl;
  next();
});

// 3) routes/myReports.js now defines its own full paths (including
//    /my-reports) and is mounted at root ONLY — remove the old
//    '/my-reports' mount and mount at '/' instead.
//    BEFORE:
//      mountRouter('/my-reports', './routes/myReports', 'routes/myReports');
//    AFTER:
try {
  const myReportsRouter = require('./routes/myReports');
  app.use('/', myReportsRouter);
} catch (err) {
  console.warn('[app.js] Warning: routes/myReports not available yet (' + err.message + ')');
}
// ---------------------------------------------------------------------
// Routes — each guarded so a missing router never blocks boot.
// ---------------------------------------------------------------------
try {
  app.use('/', require('./routes/home'));
} catch (err) {
  console.warn('[app.js] Warning: routes/home not available yet (' + err.message + ')');
}

try {
  app.use('/reports', require('./routes/reports'));
} catch (err) {
  console.warn('[app.js] Warning: routes/reports not available yet (' + err.message + ')');
}

try {
  app.use('/claims', require('./routes/claims'));
} catch (err) {
  console.warn('[app.js] Warning: routes/claims not available yet (' + err.message + ')');
}

// myReports.js defines its own full paths (/my-reports, /sign-in,
// /sign-out), so it is mounted at root exactly once.
try {
  app.use('/', require('./routes/myReports'));
} catch (err) {
  console.warn('[app.js] Warning: routes/myReports not available yet (' + err.message + ')');
}

// admin.js exposes BOTH /admin/* and /staff/* — mount at root once.
try {
  app.use('/', require('./routes/admin'));
} catch (err) {
  console.warn('[app.js] Warning: routes/admin not available yet (' + err.message + ')');
}

try {
  app.use('/', require('./routes/pages'));
} catch (err) {
  console.warn('[app.js] Warning: routes/pages not available yet (' + err.message + ')');
}
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
// 404 handler
// Registered after all routers so it only catches requests nothing
// above matched. Renders a real page, never a stack trace.
// ---------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Not found' });
});

// ---------------------------------------------------------------------
// 4-argument error handler — MUST be registered last.
// Express identifies an error-handling middleware purely by its arity
// (exactly 4 parameters: err, req, res, next); it is only ever invoked
// when something earlier calls next(err) or throws synchronously inside
// a route. Registering it before other middleware/routers would mean
// none of those routes are wrapped by it yet, so errors from them would
// fall through to Express's default (unbranded, stack-trace-leaking)
// handler instead of this one. It must therefore be the last app.use().
//
// The client NEVER receives err.stack or err.message directly — only a
// generic message plus a short reference id they can quote to support
// staff, who can then correlate it against the server-side log line.
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