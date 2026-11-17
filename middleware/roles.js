// middleware/roles.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Real role check for the NEW staff-only routes (guest-report review).
// Looks the role up in the users table on every request, the same way the
// staff-notes route does, because there are no sessions yet (Week 11).
// Non-staff get the same 404 as a missing page, so the route's existence is
// not confirmed to them. (The older /admin routes are still on the honour
// system - see README "Known issues".)
// -----------------------------------------------------------------------

const userModel = require('../models/userModel');

async function requireStaff(req, res, next) {
  try {
    if (!req.identity) {
      return res.redirect(303, '/sign-in?next=' + encodeURIComponent(req.originalUrl));
    }
    const viewer = await userModel.findById(req.identity.userId);
    if (!viewer || (viewer.role !== 'staff' && viewer.role !== 'admin')) {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }
    req.viewer = viewer;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireStaff };
