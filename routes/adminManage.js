// routes/adminManage.js
// CSPC WhereITis — admin console: manage reports, comments and users.
// Mounted at /admin BEFORE routes/admin.js (see app.js). Every route here is
// admin-only: requireAdmin re-reads users.role from the database each time.
// Rule: every POST redirects with 303 and a flash. Browsers' Origin header is
// already checked for all POSTs in app.js.

const express = require('express');
const router = express.Router();
const adminModel = require('../models/adminModel');
const reportModel = require('../models/reportModel');
const { requireAdmin } = require('../middleware/roles');

const REPORT_STATUSES = ['open', 'matched', 'claimed', 'returned', 'archived'];
const MODERATION = ['approved', 'pending', 'rejected'];
const USER_ROLES = ['user', 'staff', 'teacher', 'admin'];

function text(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// Only same-site /admin paths are accepted as a "go back to" target.
function safeBack(p, fallback) {
  if (typeof p !== 'string' || !p.startsWith('/admin') || p.startsWith('//') || p.includes('://')) return fallback;
  return p.replace(/([?&])flash=[^&]*&?/g, '$1').replace(/[?&]$/, '');
}

function backWith(back, type, message) {
  return back + (back.includes('?') ? '&' : '?') + 'flash=' + type + ':' + encodeURIComponent(message);
}

// Sidebar badges (pending reviews / claims) for every /admin page.
router.use(async (req, res, next) => {
  res.locals.adminBadges = { guestPending: 0, claimsPending: 0 };
  const role = req.identity && req.identity.role;
  if (role === 'admin' || role === 'staff') {
    try { res.locals.adminBadges = await adminModel.badges(); } catch (err) { /* badges are cosmetic */ }
  }
  next();
});

// ---------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------
router.get('/reports', requireAdmin, async (req, res, next) => {
  try {
    const filters = {
      q: text(req.query.q, 80),
      kind: ['lost', 'found'].includes(req.query.kind) ? req.query.kind : '',
      status: REPORT_STATUSES.includes(req.query.status) ? req.query.status : '',
      moderation: MODERATION.includes(req.query.moderation) ? req.query.moderation : '',
    };
    const page = Math.max(Number(req.query.page) || 1, 1);
    const result = await reportModel.listForAdmin({ ...filters, page, perPage: 25 });
    res.render('admin/reports', {
      title: 'Manage reports',
      filters,
      result,
      statuses: REPORT_STATUSES,
    });
  } catch (err) {
    next(err);
  }
});

async function reportAction(req, res, next, action) {
  try {
    const back = safeBack(req.body.return_to, '/admin/reports');
    const report = await reportModel.findById(Number(req.params.id));
    if (!report) return res.redirect(303, backWith(back, 'err', 'That report no longer exists.'));

    if (action === 'delete') {
      await adminModel.deleteReport(report.id);
      console.log(`[admin] ${req.viewer.email} deleted report ${report.reference_no}`);
      return res.redirect(303, backWith(back, 'ok', report.reference_no + ' was deleted.'));
    }
    const visible = action === 'unhide';
    await adminModel.setVisibility(
      report.id,
      visible,
      req.viewer.id,
      visible ? null : 'Hidden by an administrator'
    );
    console.log(`[admin] ${req.viewer.email} ${action} report ${report.reference_no}`);
    return res.redirect(303, backWith(back, 'ok', report.reference_no + (visible ? ' is public again.' : ' is now hidden from the public.')));
  } catch (err) {
    return next(err);
  }
}

router.post('/reports/:id/delete', requireAdmin, (req, res, next) => reportAction(req, res, next, 'delete'));
router.post('/reports/:id/hide', requireAdmin, (req, res, next) => reportAction(req, res, next, 'hide'));
router.post('/reports/:id/unhide', requireAdmin, (req, res, next) => reportAction(req, res, next, 'unhide'));

// ---------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------
router.get('/comments', requireAdmin, async (req, res, next) => {
  try {
    const q = text(req.query.q, 80);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const result = await adminModel.listComments({ q, page, perPage: 25 });
    res.render('admin/comments', { title: 'Manage comments', q, result });
  } catch (err) {
    next(err);
  }
});

router.post('/comments/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const back = safeBack(req.body.return_to, '/admin/comments');
    const ok = await adminModel.deleteComment(Number(req.params.id));
    console.log(`[admin] ${req.viewer.email} deleted comment ${req.params.id}`);
    res.redirect(303, backWith(back, ok ? 'ok' : 'err', ok ? 'Comment deleted.' : 'That comment no longer exists.'));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Users (role changes only; admin is never granted or removed here)
// ---------------------------------------------------------------------
router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const q = text(req.query.q, 80);
    const role = USER_ROLES.includes(req.query.role) ? req.query.role : '';
    const page = Math.max(Number(req.query.page) || 1, 1);
    const result = await adminModel.listUsers({ q, role, page, perPage: 25 });
    res.render('admin/users', { title: 'Manage users', q, role, result, meId: req.viewer.id });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/role', requireAdmin, async (req, res, next) => {
  try {
    const back = safeBack(req.body.return_to, '/admin/users');
    const id = Number(req.params.id);
    const role = text(req.body.role, 20);
    if (id === req.viewer.id) return res.redirect(303, backWith(back, 'err', 'You cannot change your own role.'));
    if (!['user', 'staff', 'teacher'].includes(role)) {
      return res.redirect(303, backWith(back, 'err', 'Choose Student, Staff or Teacher. Admin cannot be granted here.'));
    }
    const ok = await adminModel.setUserRole(id, role);
    if (ok) console.log(`[admin] ${req.viewer.email} set user ${id} role to ${role}`);
    res.redirect(303, backWith(back, ok ? 'ok' : 'err', ok ? 'Role updated.' : 'Could not change that account (admin accounts are protected).'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
