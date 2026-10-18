// routes/moderation.js
// Staff review queue for GUEST reports.
// Rule: every POST redirects with 303 and shows a flash. Every GET is safe and
// idempotent. Client-side required attributes are convenience only, so every
// field is validated again here.
//
// Mounted at /admin/moderation. Unlike the older admin routes (honour system),
// every route here checks the caller's role in the users table.
//
// Guest contact details (name / email / phone) are shown ONLY on these
// screens and on the staff-only block of the report page.

const express = require('express');
const router = express.Router();
const reportModel = require('../models/reportModel');
const validate = require('../middleware/validate');
const { requireStaff } = require('../middleware/roles');

router.use(requireStaff);

// GET /admin/moderation?view=pending|approved|rejected
router.get('/', async (req, res, next) => {
  try {
    const view = ['pending', 'approved', 'rejected'].includes(req.query.view) ? req.query.view : 'pending';
    const [rows, pending] = await Promise.all([
      reportModel.listForModeration(view),
      reportModel.listForModeration('pending'),
    ]);
    res.render('admin/moderation', {
      title: 'Guest report review',
      view,
      reports: rows,
      pendingCount: pending.length,
    });
  } catch (err) {
    next(err);
  }
});

async function decide(req, res, next, decision) {
  try {
    const report = await reportModel.findByReference(req.params.reference);
    // Back to the page the button was on: the queue or the report itself.
    const back = req.body.return_to === 'report'
      ? '/reports/' + req.params.reference
      : '/admin/moderation';

    if (!report || report.submitter_type !== 'guest') {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }

    // Approving needs no reason; rejecting does, so the record shows why.
    const noteRule = decision === 'rejected'
      ? validate.compose(validate.required('Reason'), validate.minLen(5, 'Reason'), validate.maxLen(255, 'Reason'))
      : validate.optional(validate.maxLen(255, 'Note'));
    const noteResult = noteRule(req.body.note);
    if (!noteResult.ok) {
      return res.redirect(303, back + (back.includes('?') ? '&' : '?') + 'flash=err:' + encodeURIComponent(noteResult.error));
    }

    try {
      await reportModel.moderate(report.id, decision, req.viewer.id, noteResult.value || null);
    } catch (err) {
      return res.redirect(303, back + (back.includes('?') ? '&' : '?') + 'flash=err:' + encodeURIComponent(err.message));
    }

    const msg = decision === 'approved'
      ? report.reference_no + ' approved and now public'
      : report.reference_no + ' rejected';
    res.redirect(303, back + (back.includes('?') ? '&' : '?') + 'flash=ok:' + encodeURIComponent(msg));
  } catch (err) {
    next(err);
  }
}

// POST /admin/moderation/:reference/approve
router.post('/:reference/approve', (req, res, next) => decide(req, res, next, 'approved'));

// POST /admin/moderation/:reference/reject
router.post('/:reference/reject', (req, res, next) => decide(req, res, next, 'rejected'));

module.exports = router;
