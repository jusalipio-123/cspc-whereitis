// routes/claims.js
// Rule: every POST redirects with 303 and shows a flash. Every GET is safe and
// idempotent. Client-side required attributes are convenience only — anyone
// can send this request with curl and skip the form entirely, so we always
// validate on the server.

const express = require('express');
const router = express.Router();
const claimModel = require('../models/claimModel');
const reportModel = require('../models/reportModel');
const validate = require('../middleware/validate');
const { requireIdentity } = require('../middleware/identity');

// Shared validation for the claim form — used by both the pre-check and
// the actual POST /, so the rules can never drift apart.
function validateClaimFields(body) {
  const errors = {};
  const values = {};

  const refResult = validate.required('Report reference')(body.report_reference);
  values.report_reference = refResult.value;
  if (!refResult.ok) {
    errors.report_reference = refResult.error;
  }

  const proofResult = validate.compose(
    validate.required('Proof of ownership'),
    validate.minLen(30, 'Proof of ownership'),
    validate.maxLen(1000, 'Proof of ownership')
  )(body.proof_text);
  values.proof_text = proofResult.value;
  if (!proofResult.ok) {
    errors.proof_text = proofResult.error;
  }

  const featuresResult = validate.compose(
    validate.required('Distinguishing features'),
    validate.minLen(30, 'Distinguishing features'),
    validate.maxLen(500, 'Distinguishing features')
  )(body.distinguishing_features);
  values.distinguishing_features = featuresResult.value;
  if (!featuresResult.ok) {
    errors.distinguishing_features = featuresResult.error;
  }

  return { values, errors, ok: Object.keys(errors).length === 0 };
}

// routes/claims.js — the specific requireIdentity gate change,
// GET /claims/new only. Every other route in this file is unchanged
// and still uses the shared requireIdentity middleware as-is.

// BEFORE:
//   router.get('/new', requireIdentity, async (req, res, next) => { ... });

// AFTER — inline gate replacing the shared requireIdentity for this
// one route, so the redirect can carry a next= back to the claim form:
router.get('/new', async (req, res, next) => {
  if (!req.identity) {
    const reportRef = req.query.report || '';
    const target = `/claims/new${reportRef ? `?report=${encodeURIComponent(reportRef)}` : ''}`;
    return res.redirect(303, `/my-reports/sign-in?next=${encodeURIComponent(target)}`);
  }

  try {
    const report = await reportModel.findByReference(req.query.report);

    if (!report || report.moderation_status !== 'approved' || !reportModel.canView(report, req.identity)) {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }

    if (req.identity && report.user_id && report.user_id === req.identity.userId) {
      return res.status(403).render('errors/404', {
        title: 'Cannot file claim',
        flash: { type: 'err', message: 'You posted this report, so you cannot claim it. Claims are for other people who think the item is theirs.' },
      });
    }

    if (report.kind !== 'found') {
      return res.status(422).render('errors/404', {
        title: 'Cannot file claim',
        flash: { type: 'err', message: 'Claims can only be filed against found items.' },
      });
    }

    if (['claimed', 'returned', 'archived'].includes(report.status)) {
      return res.status(422).render('errors/404', {
        title: 'Cannot file claim',
        flash: { type: 'err', message: 'This item has already been resolved.' },
      });
    }

    const existingClaim = await claimModel.findByReportAndUser(report.id, req.identity.userId);
    if (existingClaim && existingClaim.status === 'pending') {
      return res.redirect(303, '/my-reports?flash=err:You%20already%20have%20a%20claim%20on%20this%20report');
    }

    res.render('claims/new', {
      title: `File a claim — ${report.reference_no}`,
      report,
      values: { report_reference: report.reference_no },
      errors: {},
    });
  } catch (err) {
    next(err);
  }
});

// POST /
router.post('/', requireIdentity, async (req, res, next) => {
  try {
    const { values, errors, ok } = validateClaimFields(req.body);

    // A blank/invalid report_reference means there's no report to
    // re-render the form against — treat that as a 404 rather than
    // trying to render claims/new with report: null.
    const report = values.report_reference
      ? await reportModel.findByReference(values.report_reference)
      : null;

    if (!report || report.moderation_status !== 'approved' || !reportModel.canView(report, req.identity)) {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }

    if (!ok) {
      return res.status(422).render('claims/new', {
        title: `File a claim — ${report.reference_no}`,
        report,
        values,
        errors,
      });
    }

    if (req.identity && report.user_id && report.user_id === req.identity.userId) {
      return res.status(403).render('errors/404', {
        title: 'Cannot file claim',
        flash: { type: 'err', message: 'You posted this report, so you cannot claim it. Claims are for other people who think the item is theirs.' },
      });
    }

    if (report.kind !== 'found') {
      return res.status(422).render('errors/404', {
        title: 'Cannot file claim',
        flash: { type: 'err', message: 'Claims can only be filed against found items.' },
      });
    }

    if (['claimed', 'returned', 'archived'].includes(report.status)) {
      return res.status(422).render('errors/404', {
        title: 'Cannot file claim',
        flash: { type: 'err', message: 'This item has already been resolved.' },
      });
    }

    let claim;
    try {
      claim = await claimModel.create({
        report_id: report.id,
        claimant_user_id: req.identity.userId,
        proof_text: values.proof_text,
        distinguishing_features: values.distinguishing_features,
      });
    } catch (err) {
      // claimModel.create() already translates MySQL errno 1062 (the
      // UNIQUE (report_id, claimant_user_id) key) into this friendly
      // message — catch it here and re-render the form instead of
      // letting it fall through to the generic error handler.
      if (err.message === 'You have already filed a claim on this report.') {
        return res.status(422).render('claims/new', {
          title: `File a claim — ${report.reference_no}`,
          report,
          values,
          errors: { report_reference: err.message },
        });
      }
      throw err;
    }

    // 303 so a page refresh re-fetches the claim detail page with a GET
    // instead of resubmitting this claim a second time.
    res.redirect(303, `/claims/${claim.id}?flash=ok:Claim%20filed`);
  } catch (err) {
    next(err);
  }
});

// loadOwnedClaim: shared guard for the claim pages.
// Only two people may open a claim: the claimant who filed it, and the user
// who uploaded the report it is against (the "owner"). Anyone else gets the
// same 404 as a missing claim, so the claim's existence is never confirmed.
// Returns { claim, report, isOwner, isClaimant } or null (response already sent).
async function loadClaimForViewer(req, res) {
  const claim = await claimModel.findById(req.params.id);
  const report = claim ? await reportModel.findById(claim.report_id) : null;
  const userId = req.identity.userId;

  const isClaimant = !!claim && claim.claimant_user_id === userId;
  const isOwner = !!report && !!report.user_id && report.user_id === userId;

  if (!claim || !report || (!isClaimant && !isOwner)) {
    res.status(404).render('errors/404', { title: 'Not found' });
    return null;
  }
  return { claim, report, isOwner, isClaimant };
}

// GET /:id
router.get('/:id', requireIdentity, async (req, res, next) => {
  try {
    const ctx = await loadClaimForViewer(req, res);
    if (!ctx) return;
    const { claim, report, isOwner, isClaimant } = ctx;

    res.render('claims/detail', {
      title: `Claim on ${claim.reference_no}`,
      claim,
      report,
      isOwner,
      isClaimant,
      // Only the report's uploader decides, and only while the claim is open.
      canDecide: isOwner && claim.status === 'pending',
    });
  } catch (err) {
    next(err);
  }
});

// POST /:id/approve  (report owner only)
router.post('/:id/approve', requireIdentity, async (req, res, next) => {
  try {
    const ctx = await loadClaimForViewer(req, res);
    if (!ctx) return;
    const { claim, report, isOwner } = ctx;

    // The claimant can see the page but must not be able to approve their own claim.
    if (!isOwner) {
      return res.status(403).render('errors/404', {
        title: 'Not allowed',
        flash: { type: 'err', message: 'Only the person who posted this report can approve or reject claims on it.' },
      });
    }

    if (['returned', 'archived'].includes(report.status)) {
      return res.redirect(303, `/claims/${claim.id}?flash=err:${encodeURIComponent('This report is already closed.')}`);
    }

    const noteResult = validate.optional(validate.maxLen(255, 'Decision note'))(req.body.note);
    const note = noteResult.value || null;

    try {
      // claimModel.approve runs in one transaction: it approves this
      // claim, auto-rejects every other pending claim on the same
      // report, and sets the report's status to 'claimed' (FR-06).
      await claimModel.approve(claim.id, req.identity.userId, note);
    } catch (err) {
      if (err.message === 'This claim was already decided.') {
        return res.redirect(303, `/claims/${claim.id}?flash=err:${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    res.redirect(303, `/claims/${claim.id}?flash=ok:Claim%20approved`);
  } catch (err) {
    next(err);
  }
});

// POST /:id/reject  (report owner only)
router.post('/:id/reject', requireIdentity, async (req, res, next) => {
  try {
    const ctx = await loadClaimForViewer(req, res);
    if (!ctx) return;
    const { claim, isOwner } = ctx;

    if (!isOwner) {
      return res.status(403).render('errors/404', {
        title: 'Not allowed',
        flash: { type: 'err', message: 'Only the person who posted this report can approve or reject claims on it.' },
      });
    }

    const noteResult = validate.compose(
      validate.required('Reason'),
      validate.minLen(5, 'Reason'),
      validate.maxLen(255, 'Reason')
    )(req.body.note);

    if (!noteResult.ok) {
      return res.redirect(303, `/claims/${claim.id}?flash=err:${encodeURIComponent(noteResult.error)}`);
    }

    try {
      await claimModel.reject(claim.id, req.identity.userId, noteResult.value);
    } catch (err) {
      if (err.message === 'This claim was already decided.') {
        return res.redirect(303, `/claims/${claim.id}?flash=err:${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    res.redirect(303, `/claims/${claim.id}?flash=ok:Claim%20rejected`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
