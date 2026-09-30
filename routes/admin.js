// routes/admin.js
// Rule: every POST redirects with 303 and shows a flash. Every GET is safe and
// idempotent. Client-side required attributes are convenience only - anyone
// can send this request with curl and skip the form entirely, so we always
// validate on the server.
//
// NOTE: staff/admin routes are currently open on the honour system because
// sessions and role middleware arrive in Week 11 (requireRole). This is
// documented in AUDIT.md and on /about. The one exception is the staff
// notes POST below, which looks the caller's role up in the users table.
//
// MOUNTING NOTE: app.js mounts this router twice, at '/admin' and at
// '/staff'. Routes therefore exist in both forms where needed:
//   - GET  '/'  serves the admin dashboard at /admin and the staff queue
//                at /staff (decided by req.baseUrl).
//   - the status and notes POST routes are registered under BOTH
//     '/staff/reports/...' and '/reports/...' so that the public URL
//     /staff/reports/<reference>/... works under either mount.

const express = require('express');
const router = express.Router();
const reportModel = require('../models/reportModel');
const claimModel = require('../models/claimModel');
const statsModel = require('../models/statsModel');
const categoryModel = require('../models/categoryModel');
const locationModel = require('../models/locationModel');
const noteModel = require('../models/noteModel');
const userModel = require('../models/userModel');
const { pool } = require('../db');
const status = require('../lib/status');
const validate = require('../middleware/validate');
const { requireIdentity } = require('../middleware/identity');

// ---------------------------------------------------------------------
// Staff queue (pending claims + aging found items + note counts)
// ---------------------------------------------------------------------
async function staffQueueHandler(req, res, next) {
  try {
    const [pendingClaims, aging] = await Promise.all([
      claimModel.listPending(),
      reportModel.itemsAgingOver(60),
    ]);

    // noteCounts[reportId] = number of internal notes on that report.
    const reportIds = new Set([
      ...pendingClaims.map((c) => c.report_id),
      ...aging.map((r) => r.id),
    ]);
    const noteCounts = {};
    await Promise.all(
      [...reportIds].map(async (id) => {
        noteCounts[id] = await noteModel.countByReport(id);
      })
    );

    res.render('admin/staff', {
      title: 'Staff queue',
      pendingClaims,
      aging,
      noteCounts,
    });
  } catch (err) {
    next(err);
  }
}

// GET /staff (under the /admin mount this is /admin/staff)
router.get('/staff', requireIdentity, staffQueueHandler);

// ---------------------------------------------------------------------
// POST status change
// ---------------------------------------------------------------------
router.post(
  ['/staff/reports/:reference/status', '/reports/:reference/status'],
  requireIdentity,
  async (req, res, next) => {
    try {
      const toStatusResult = validate.oneOf(
        ['open', 'matched', 'claimed', 'returned', 'archived'],
        'Status'
      )(req.body.to_status);

      if (!toStatusResult.ok) {
        return res.status(422).render('errors/422', {
          title: 'Not allowed',
          message: toStatusResult.error,
        });
      }
      const toStatus = toStatusResult.value;

      const noteResult = validate.optional(validate.maxLen(255, 'Note'))(req.body.note);
      const note = noteResult.value || null;

      const report = await reportModel.findByReference(req.params.reference);
      if (!report) {
        return res.status(404).render('errors/404', { title: 'Not found' });
      }

      if (!status.canTransition(report.status, toStatus)) {
        return res.status(422).render('errors/422', {
          title: 'Not allowed',
          message: 'That status change is not allowed from ' + report.status + '.',
        });
      }

      if (toStatus === 'returned') {
        const returnedToResult = validate.compose(
          validate.required('Returned to'),
          validate.minLen(2, 'Returned to'),
          validate.maxLen(120, 'Returned to')
        )(req.body.returned_to);

        if (!returnedToResult.ok) {
          return res.status(422).render('errors/422', {
            title: 'Not allowed',
            message: returnedToResult.error,
          });
        }

        await reportModel.markReturned(report.id, returnedToResult.value, req.identity.userId);
      } else if (toStatus === 'archived') {
        const reasonResult = validate.compose(
          validate.required('Archive reason'),
          validate.minLen(5, 'Archive reason'),
          validate.maxLen(255, 'Archive reason')
        )(req.body.archived_reason);

        if (!reasonResult.ok) {
          return res.status(422).render('errors/422', {
            title: 'Not allowed',
            message: reasonResult.error,
          });
        }

        await reportModel.archive(report.id, reasonResult.value, req.identity.userId);
      } else {
        try {
          await reportModel.setStatus(report.id, toStatus, req.identity.userId, note);
        } catch (err) {
          return res.status(422).render('errors/422', {
            title: 'Not allowed',
            message: err.message,
          });
        }
      }

      res.redirect(303, '/reports/' + report.reference_no + '?flash=ok:Status%20updated');
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// POST staff-only internal note
// ---------------------------------------------------------------------
router.post(
  ['/staff/reports/:reference/notes', '/reports/:reference/notes'],
  requireIdentity,
  async (req, res, next) => {
    try {
      // Role lookup by DB query - no sessions yet (Week 11). A student who
      // POSTs here with curl gets the same 404 as a missing report, so the
      // route does not even confirm it exists.
      const viewer = await userModel.findById(req.identity.userId);
      if (!viewer || (viewer.role !== 'staff' && viewer.role !== 'admin')) {
        return res.status(404).render('errors/404', { title: 'Not found' });
      }

      const report = await reportModel.findByReference(req.params.reference);
      if (!report) {
        return res.status(404).render('errors/404', { title: 'Not found' });
      }

      const bodyResult = validate.compose(
        validate.required('Note'),
        validate.minLen(3, 'Note'),
        validate.maxLen(500, 'Note')
      )(req.body.body);

      if (!bodyResult.ok) {
        return res.redirect(
          303,
          '/reports/' + report.reference_no + '?flash=err:' + encodeURIComponent(bodyResult.error) + '#staff-notes'
        );
      }

      await noteModel.create({
        report_id: report.id,
        author_user_id: req.identity.userId,
        body: bodyResult.value,
      });

      res.redirect(303, '/reports/' + report.reference_no + '?flash=ok:Note%20added#staff-notes');
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// GET / : admin dashboard at /admin, staff queue at /staff
// ---------------------------------------------------------------------
async function dashboardHandler(req, res, next) {
  try {
    const [
      monthlyCounts,
      categoryDistribution,
      topLocations,
      returnedThisMonth,
      agingOver60,
      statusCounts,
    ] = await Promise.all([
      statsModel.monthlyCounts(12),
      statsModel.categoryDistribution(),
      statsModel.topLocations(10),
      statsModel.returnedThisMonth(),
      statsModel.agingOver(60),
      reportModel.countByStatus(),
    ]);

    res.render('admin/dashboard', {
      title: 'Admin dashboard',
      monthlyCounts,
      categoryDistribution,
      topLocations,
      returnedThisMonth,
      agingOver60,
      statusCounts,
    });
  } catch (err) {
    next(err);
  }
}

router.get('/', requireIdentity, (req, res, next) => {
  if (req.baseUrl === '/staff') {
    return staffQueueHandler(req, res, next);
  }
  return dashboardHandler(req, res, next);
});

// GET /admin/export.csv
   // Streams a CSV export of the current month's reports. For this volume
   // we buffer the full response in memory; for >10k rows we would switch
   // to a streaming writer.
router.get('/export.csv', requireIdentity, async (req, res, next) => {
  try {
    // No streaming needed for this volume; if the dataset grows past
    // about 10k rows, switch to a streaming CSV writer.
    const [rows] = await pool.execute(
      'SELECT r.reference_no, r.kind, c.name AS category, l.name AS location, ' +
      'r.title, r.status, r.occurred_on, r.created_at ' +
      'FROM reports r ' +
      'JOIN categories c ON c.id = r.category_id ' +
      'JOIN locations l ON l.id = r.location_id ' +
      'WHERE YEAR(r.created_at) = YEAR(NOW()) AND MONTH(r.created_at) = MONTH(NOW()) ' +
      'ORDER BY r.created_at ASC'
    );

    const escapeCsv = (value) => {
      const str = String(value === null || value === undefined ? '' : value);
      if (/[",\n]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const header = 'reference_no,kind,category,location,title,status,occurred_on,created_at';
    const lines = rows.map((row) =>
      [
        row.reference_no,
        row.kind,
        row.category,
        row.location,
        row.title,
        row.status,
        row.occurred_on,
        row.created_at,
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csvString = [header].concat(lines).join('\n');

    const now = new Date();
    const yyyyMm = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="whereitis-' + yyyyMm + '.csv"');
    res.send(csvString);
  } catch (err) {
    next(err);
  }
});

// GET /admin/bulk
router.get('/bulk', requireIdentity, async (req, res, next) => {
  try {
    const { rows } = await reportModel.list({ page: 1, perPage: 100 });

    res.render('admin/bulk', {
      title: 'Bulk update',
      reports: rows,
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/bulk
router.post('/bulk', requireIdentity, async (req, res, next) => {
  let conn;
  try {
    let referenceNos = req.body.report_ids;
    if (!referenceNos) referenceNos = [];
    if (!Array.isArray(referenceNos)) referenceNos = [referenceNos];

    if (referenceNos.length === 0) {
      return res.status(422).render('errors/422', {
        title: 'Not allowed',
        message: 'Select at least one report to update.',
      });
    }

    const toStatusResult = validate.oneOf(
      ['open', 'matched', 'claimed', 'returned', 'archived'],
      'Status'
    )(req.body.to_status);

    if (!toStatusResult.ok) {
      return res.status(422).render('errors/422', {
        title: 'Not allowed',
        message: toStatusResult.error,
      });
    }
    const toStatus = toStatusResult.value;
    const note = validate.optional(validate.maxLen(255, 'Note'))(req.body.note).value || null;

    // The connection is acquired inside the try block so a failure to get
    // one is handled by the catch below instead of escaping the handler.
    conn = await pool.getConnection();

    // Bulk update is all-or-nothing: if ANY report in the batch cannot
    // legally make this transition, the whole batch rolls back. A partial
    // update would leave the staff queue in an inconsistent state.
    await conn.beginTransaction();

    let updatedCount = 0;

    for (const referenceNo of referenceNos) {
      const [reportRows] = await conn.execute(
        'SELECT id, status FROM reports WHERE reference_no = ? FOR UPDATE',
        [referenceNo]
      );

      if (reportRows.length === 0) {
        await conn.rollback();
        return res.status(422).render('errors/422', {
          title: 'Not allowed',
          message: 'Batch aborted - ' + referenceNo + ' was not found.',
        });
      }

      const currentStatus = reportRows[0].status;

      if (!status.canTransition(currentStatus, toStatus)) {
        await conn.rollback();
        return res.status(422).render('errors/422', {
          title: 'Not allowed',
          message: 'Batch aborted - ' + referenceNo + ' cannot move from ' + currentStatus + ' to ' + toStatus + '.',
        });
      }

      await conn.execute('UPDATE reports SET status = ? WHERE id = ?', [toStatus, reportRows[0].id]);
      await conn.execute(
        'INSERT INTO report_status_history (report_id, from_status, to_status, changed_by, note) VALUES (?, ?, ?, ?, ?)',
        [reportRows[0].id, currentStatus, toStatus, req.identity.userId, note]
      );

      updatedCount += 1;
    }

    await conn.commit();

    res.redirect(303, '/admin?flash=ok:Updated%20' + updatedCount + '%20reports');
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        // Nothing more to do; the original error is what matters.
      }
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// GET /admin/categories
router.get('/categories', requireIdentity, async (req, res, next) => {
  try {
    const categories = await categoryModel.list();
    res.render('admin/categories', {
      title: 'Manage categories',
      categories,
      values: {},
      errors: {},
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/categories
router.post('/categories', requireIdentity, async (req, res, next) => {
  try {
    const errors = {};

    const nameResult = validate.compose(
      validate.required('Name'),
      validate.minLen(2, 'Name'),
      validate.maxLen(60, 'Name')
    )(req.body.name);
    if (!nameResult.ok) errors.name = nameResult.error;

    const slugRaw = String(req.body.slug || '').trim();
    const slugShapeResult = validate.compose(
      validate.required('Slug'),
      validate.minLen(2, 'Slug'),
      validate.maxLen(60, 'Slug')
    )(slugRaw);
    if (!slugShapeResult.ok) {
      errors.slug = slugShapeResult.error;
    } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slugRaw)) {
      errors.slug = 'Slug must be lowercase letters, numbers, and hyphens only.';
    }

    const iconKeyResult = validate.optional(validate.maxLen(40, 'Icon key'))(req.body.icon_key);
    if (!iconKeyResult.ok) errors.icon_key = iconKeyResult.error;

    const sortOrderResult = validate.isInt({ min: 0, max: 999 }, 'Sort order')(req.body.sort_order || 0);
    if (!sortOrderResult.ok) errors.sort_order = sortOrderResult.error;

    if (Object.keys(errors).length > 0) {
      const categories = await categoryModel.list();
      return res.status(422).render('admin/categories', {
        title: 'Manage categories',
        categories,
        values: req.body,
        errors,
      });
    }

    try {
      await categoryModel.create({
        name: nameResult.value,
        slug: slugRaw,
        icon_key: iconKeyResult.value || null,
        sort_order: sortOrderResult.value,
      });
    } catch (err) {
      if (err.errno === 1062) {
        const categories = await categoryModel.list();
        return res.status(422).render('admin/categories', {
          title: 'Manage categories',
          categories,
          values: req.body,
          errors: { slug: 'That name or slug is already in use.' },
        });
      }
      throw err;
    }

    res.redirect(303, '/admin/categories?flash=ok:Category%20added');
  } catch (err) {
    next(err);
  }
});

// GET /admin/locations
router.get('/locations', requireIdentity, async (req, res, next) => {
  try {
    const locations = await locationModel.list();
    res.render('admin/locations', {
      title: 'Manage locations',
      locations,
      values: {},
      errors: {},
    });
  } catch (err) {
    next(err);
  }
});

// POST /admin/locations
router.post('/locations', requireIdentity, async (req, res, next) => {
  try {
    const errors = {};

    const nameResult = validate.compose(
      validate.required('Name'),
      validate.minLen(2, 'Name'),
      validate.maxLen(120, 'Name')
    )(req.body.name);
    if (!nameResult.ok) errors.name = nameResult.error;

    const zoneResult = validate.optional(validate.maxLen(60, 'Zone'))(req.body.zone);
    if (!zoneResult.ok) errors.zone = zoneResult.error;

    const isPublic = req.body.is_public === 'on' || req.body.is_public === 'true' || req.body.is_public === '1';

    if (Object.keys(errors).length > 0) {
      const locations = await locationModel.list();
      return res.status(422).render('admin/locations', {
        title: 'Manage locations',
        locations,
        values: req.body,
        errors,
      });
    }

    try {
      await locationModel.create({
        name: nameResult.value,
        zone: zoneResult.value || null,
        is_public: isPublic,
      });
    } catch (err) {
      if (err.errno === 1062) {
        const locations = await locationModel.list();
        return res.status(422).render('admin/locations', {
          title: 'Manage locations',
          locations,
          values: req.body,
          errors: { name: 'That location name is already in use.' },
        });
      }
      throw err;
    }

    res.redirect(303, '/admin/locations?flash=ok:Location%20added');
  } catch (err) {
    next(err);
  }
});

module.exports = router;