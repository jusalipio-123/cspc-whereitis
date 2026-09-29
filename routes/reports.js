// routes/reports.js
// Rule: every POST redirects with 303 and shows a flash. Every GET is safe and
// idempotent. Client-side required attributes are convenience only 
const express = require('express');
const router = express.Router();
const reportModel = require('../models/reportModel');
const categoryModel = require('../models/categoryModel');
const locationModel = require('../models/locationModel');
const commentModel = require('../models/commentModel');
const bookmarkModel = require('../models/bookmarkModel');
const tagModel = require('../models/tagModel');
const noteModel = require('../models/noteModel');
const userModel = require('../models/userModel');
const matching = require('../lib/matching');
const validate = require('../middleware/validate');
const { requireIdentity } = require('../middleware/identity');

const MATCH_WINDOW_DAYS = Number(process.env.MATCH_WINDOW_DAYS) || 30;
const MAX_TAGS = 3;

// validateTags: checkboxes arrive as undefined, a single string, or an
// array. Coerce to an array, then check every id against the tags table
// (an allow-list). Returns the valid integer ids plus an error message.
function validateTags(rawTagIds, allTags) {
  const validIds = new Set(allTags.map((t) => t.id));
  const list = Array.isArray(rawTagIds) ? rawTagIds : rawTagIds ? [rawTagIds] : [];
  const ids = [];
  let sawInvalid = false;

  list.forEach((item) => {
    const parsed = validate.isInt({ min: 1 }, 'Tag')(item);
    if (!parsed.ok || !validIds.has(parsed.value)) {
      sawInvalid = true;
      return;
    }
    if (!ids.includes(parsed.value)) ids.push(parsed.value);
  });

  let error = null;
  if (sawInvalid) {
    error = 'Please choose tags from the list provided.';
  } else if (ids.length > MAX_TAGS) {
    error = 'Please pick at most ' + MAX_TAGS + ' tags.';
  }
  return { ids, error };
}

// Shared validation for report creation/editing, so POST / and
// POST /:reference/edit can never drift apart.
function validateReportFields(body, allTags) {
  const errors = {};
  const values = {};

  const kindResult = validate.oneOf(['lost', 'found'], 'Kind')(body.kind);
  values.kind = kindResult.value;
  if (!kindResult.ok) errors.kind = kindResult.error;

  const categoryResult = validate.isInt({ min: 1 }, 'Category')(body.category_id);
  values.category_id = categoryResult.value;
  if (!categoryResult.ok) errors.category_id = categoryResult.error;

  const locationResult = validate.isInt({ min: 1 }, 'Location')(body.location_id);
  values.location_id = locationResult.value;
  if (!locationResult.ok) errors.location_id = locationResult.error;

  const titleResult = validate.compose(
    validate.required('Title'),
    validate.minLen(5, 'Title'),
    validate.maxLen(120, 'Title')
  )(body.title);
  values.title = titleResult.value;
  if (!titleResult.ok) errors.title = titleResult.error;

  const descriptionResult = validate.compose(
    validate.required('Description'),
    validate.minLen(20, 'Description'),
    validate.maxLen(1000, 'Description')
  )(body.description);
  values.description = descriptionResult.value;
  if (!descriptionResult.ok) errors.description = descriptionResult.error;

  const occurredOnResult = validate.compose(
    validate.isIsoDate('Date'),
    validate.isDateNotFuture('Date')
  )(body.occurred_on);
  values.occurred_on = occurredOnResult.value;
  if (!occurredOnResult.ok) errors.occurred_on = occurredOnResult.error;

  // Cross-field rule: a FOUND report must record where the item is held.
  if (kindResult.value === 'found') {
    const holdingResult = validate.compose(
      validate.required('Holding location'),
      validate.maxLen(160, 'Holding location')
    )(body.holding_location);
    values.holding_location = holdingResult.value;
    if (!holdingResult.ok) errors.holding_location = holdingResult.error;
  } else {
    values.holding_location = '';
  }

  const tagResult = validateTags(body.tag_ids, allTags);
  if (tagResult.error) errors.tag_ids = tagResult.error;

  return {
    values,
    errors,
    tagIds: tagResult.ids,
    ok: Object.keys(errors).length === 0,
  };
}

// GET /
// Public report list with filters, keyword search, tag filter, pagination.
router.get('/', async (req, res, next) => {
  try {
    const { kind, category, location, status, from, to, q, tag } = req.query;
    let page = parseInt(req.query.page, 10);
    if (!Number.isInteger(page) || page < 1) page = 1;
    const perPage = 12;

    const [categories, locations, allTags] = await Promise.all([
      categoryModel.list(),
      locationModel.list(),
      tagModel.listAll(),
    ]);

    // Filters are resolved against the already-loaded lists. An
    // unrecognised value is simply ignored, so a stale or mistyped link
    // degrades to "no filter" instead of a broken page. The location
    // dropdown submits the location id.
    const categoryRow = category ? categories.find((c) => c.slug === category) : null;
    const locationRow = location ? locations.find((l) => String(l.id) === String(location)) : null;
    const tagRow = tag ? allTags.find((t) => t.slug === tag) : null;

    const result = await reportModel.list({
      kind: kind || null,
      category_id: categoryRow ? categoryRow.id : null,
      location_id: locationRow ? locationRow.id : null,
      status: status || null,
      from: from || null,
      to: to || null,
      q: q || null,
      tag_slug: tagRow ? tagRow.slug : null,
      page,
      perPage,
    });

    res.render('reports/list', {
      title: 'Browse reports',
      ...result,
      categories,
      locations,
      allTags,
      filters: { kind, category, location, status, from, to, q, tag },
    });
  } catch (err) {
    next(err);
  }
});

// GET /new
router.get('/new', async (req, res, next) => {
  try {
    const [categories, locations, allTags] = await Promise.all([
      categoryModel.list(),
      locationModel.list(),
      tagModel.listAll(),
    ]);

    res.render('reports/new', {
      title: 'Report an item',
      categories,
      locations,
      allTags,
      selectedTagIds: [],
      values: { kind: req.query.kind === 'found' ? 'found' : req.query.kind === 'lost' ? 'lost' : '' },
      errors: {},
    });
  } catch (err) {
    next(err);
  }
});

// POST /
router.post('/', requireIdentity, async (req, res, next) => {
  try {
    const [categories, locations, allTags] = await Promise.all([
      categoryModel.list(),
      locationModel.list(),
      tagModel.listAll(),
    ]);

    const { values, errors, tagIds, ok } = validateReportFields(req.body, allTags);

    if (!ok) {
      return res.status(422).render('reports/new', {
        title: 'Report an item',
        categories,
        locations,
        allTags,
        selectedTagIds: tagIds,
        values,
        errors,
      });
    }

    const created = await reportModel.create({
      user_id: req.identity.userId,
      kind: values.kind,
      category_id: values.category_id,
      location_id: values.location_id,
      title: values.title,
      description: values.description,
      occurred_on: values.occurred_on,
      holding_location: values.holding_location || null,
      tag_ids: tagIds,
      photo_url: req.body.photo_url ? String(req.body.photo_url).trim() : null,
    });

    // 303 (not 302/307) guarantees the browser follows up with a GET, so
    // a page refresh cannot resubmit the form (Post/Redirect/Get).
    const flashMessage = encodeURIComponent(
      'Report created. Save your reference number, or sign in to My Reports to track it.'
    );
    res.redirect(303, '/reports/' + created.reference_no + '?flash=ok:' + flashMessage);
  } catch (err) {
    next(err);
  }
});

// GET /:reference
// Public, permanent, shareable detail page (FR-10).
router.get('/:reference', async (req, res, next) => {
  try {
    const report = await reportModel.findByReference(req.params.reference);
    if (!report) {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }

    const [comments, possibleMatches] = await Promise.all([
      commentModel.listByReport(report.id),
      matching.suggestMatches(report.id, MATCH_WINDOW_DAYS),
    ]);

    const locals = {
      title: report.title + ' - ' + report.reference_no,
      report,
      comments,
      possibleMatches,
      bookmarked: false,
      identity: req.identity,
    };

    if (req.identity) {
      locals.bookmarked = await bookmarkModel.isBookmarked(req.identity.userId, report.id);

      // Role lookup by DB query - there are no sessions yet (Week 11), so
      // the signed cookie only proves WHO the user is; we ask the users
      // table what their role is. staffNotes is added to the locals ONLY
      // for staff/admin, so the view's "typeof staffNotes" check keeps the
      // internal notes section invisible to everyone else.
      const viewer = await userModel.findById(req.identity.userId);
      if (viewer && (viewer.role === 'staff' || viewer.role === 'admin')) {
        locals.staffNotes = await noteModel.listByReport(report.id);
      }
    }

    res.render('reports/detail', locals);
  } catch (err) {
    next(err);
  }
});

// GET /:reference/edit
router.get('/:reference/edit', requireIdentity, async (req, res, next) => {
  try {
    const report = await reportModel.findByReference(req.params.reference);

    // Not found, or found but not owned by this identity: both render the
    // SAME 404, so we never confirm to a non-owner that the report exists.
    if (!report || report.user_id !== req.identity.userId) {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }

    if (report.status !== 'open') {
      return res.status(404).render('errors/404', {
        title: 'Not found',
        flash: {
          type: 'err',
          message: 'This report can no longer be edited because its status is ' + report.status + '.',
        },
      });
    }

    const [categories, locations, allTags] = await Promise.all([
      categoryModel.list(),
      locationModel.list(),
      tagModel.listAll(),
    ]);

    res.render('reports/edit', {
      title: 'Edit ' + report.reference_no,
      categories,
      locations,
      allTags,
      selectedTagIds: (report.tags || []).map((t) => t.id),
      values: report,
      errors: {},
      report,
    });
  } catch (err) {
    next(err);
  }
});

// POST /:reference/edit
router.post('/:reference/edit', requireIdentity, async (req, res, next) => {
  try {
    const report = await reportModel.findByReference(req.params.reference);

    if (!report || report.user_id !== req.identity.userId) {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }

    if (report.status !== 'open') {
      return res.status(404).render('errors/404', {
        title: 'Not found',
        flash: {
          type: 'err',
          message: 'This report can no longer be edited because its status is ' + report.status + '.',
        },
      });
    }

    const [categories, locations, allTags] = await Promise.all([
      categoryModel.list(),
      locationModel.list(),
      tagModel.listAll(),
    ]);

    // The kind of an existing report cannot change, so it always comes
    // from the stored report, never from the submitted form.
    const { values, errors, tagIds, ok } = validateReportFields(
      { ...req.body, kind: report.kind },
      allTags
    );

    if (!ok) {
      return res.status(422).render('reports/edit', {
        title: 'Edit ' + report.reference_no,
        categories,
        locations,
        allTags,
        selectedTagIds: tagIds,
        values,
        errors,
        report,
      });
    }

    await reportModel.updateWhileOpen(report.id, req.identity.userId, {
  title: values.title,
  description: values.description,
  category_id: values.category_id,
  location_id: values.location_id,
  occurred_on: values.occurred_on,
  holding_location: values.holding_location || null,
  photo_url: req.body.photo_url ? String(req.body.photo_url).trim() : null,
});

    res.redirect(303, '/reports/' + report.reference_no + '?flash=ok:Report%20updated');
  } catch (err) {
    next(err);
  }
});

// POST /:reference/withdraw
router.post('/:reference/withdraw', requireIdentity, async (req, res, next) => {
  try {
    const report = await reportModel.findByReference(req.params.reference);

    if (!report || report.user_id !== req.identity.userId) {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }

    if (report.status !== 'open') {
      return res.status(404).render('errors/404', {
        title: 'Not found',
        flash: {
          type: 'err',
          message: 'This report can no longer be withdrawn because its status is ' + report.status + '.',
        },
      });
    }

    await reportModel.withdraw(report.id, req.identity.userId);

    res.redirect(303, '/reports/' + report.reference_no + '?flash=ok:Report%20withdrawn');
  } catch (err) {
    next(err);
  }
});

// POST /:reference/comments
router.post('/:reference/comments', requireIdentity, async (req, res, next) => {
  try {
    const report = await reportModel.findByReference(req.params.reference);

    if (!report || report.user_id !== req.identity.userId) {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }

    const bodyResult = validate.compose(
      validate.required('Comment'),
      validate.minLen(1, 'Comment'),
      validate.maxLen(500, 'Comment')
    )(req.body.body);

    if (!bodyResult.ok) {
      return res.redirect(
        303,
        '/reports/' + report.reference_no + '?flash=err:' + encodeURIComponent(bodyResult.error) + '#comments'
      );
    }

    await commentModel.create({
      report_id: report.id,
      user_id: req.identity.userId,
      body: bodyResult.value,
    });

    res.redirect(303, '/reports/' + report.reference_no + '?flash=ok:Comment%20added#comments');
  } catch (err) {
    next(err);
  }
});

// GET /:reference/print
// Print-only receipt. Deliberately loads NO staff notes.
router.get('/:reference/print', async (req, res, next) => {
  try {
    const report = await reportModel.findByReference(req.params.reference);
    if (!report) {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }

    res.render('reports/print', {
      title: 'Receipt - ' + report.reference_no,
      report,
    });
  } catch (err) {
    next(err);
  }
});

// POST /:reference/bookmark
router.post('/:reference/bookmark', requireIdentity, async (req, res, next) => {
  try {
    const report = await reportModel.findByReference(req.params.reference);
    if (!report) {
      return res.status(404).render('errors/404', { title: 'Not found' });
    }

    await bookmarkModel.toggle(req.identity.userId, report.id);

    res.redirect(303, '/reports/' + report.reference_no + '?flash=ok:Bookmark%20updated');
  } catch (err) {
    next(err);
  }
});

module.exports = router;