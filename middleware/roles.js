// middleware/roles.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Real role checks. The signed cookie is only a UI convenience: every
// guard here looks the account up in the users table on each request, so
// a forged or stale cookie can never grant elevated access.
//
// Non-staff get the same 404 as a missing page, so a route's existence is
// not confirmed to them.
// -----------------------------------------------------------------------

const { requireIdentity } = require('./identity');
const userModel = require('../models/userModel');

// requireViewer: loads the current account into req.viewer. Used by the
// role guards below and by routes that need the viewer's details.
async function requireViewer(req, res, next) {
  if (!req.identity) {
    return res.redirect(303, '/sign-in?next=' + encodeURIComponent(req.originalUrl));
  }
  try {
    const viewer = await userModel.findById(req.identity.userId);
    if (!viewer) {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }
    req.viewer = viewer;
    return next();
  } catch (err) {
    return next(err);
  }
}

// notFound: uniform response for an authenticated user without the role.
function notFound(res) {
  return res.status(404).render('errors/404', { title: 'Not found' });
}

function requireRole(allowed) {
  return function guard(req, res, next) {
    return requireViewer(req, res, (err) => {
      if (err) return next(err);
      if (!allowed.includes(req.viewer.role)) return notFound(res);
      return next();
    });
  };
}

// Staff and admins share the day-to-day queue and guest-report review.
const requireStaff = requireRole(['staff', 'admin']);

// Lookups, exports, bulk updates and admin-only UI.
const requireAdmin = requireRole(['admin']);

module.exports = { requireViewer, requireStaff, requireAdmin };
