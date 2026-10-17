// routes/home.js
// Rule: every POST redirects with 303 and shows a flash. Every GET is safe and
// idempotent. Client-side required attributes are convenience only - anyone
// can send this request with curl and skip the form entirely, so we always
// validate on the server.

const express = require('express');
const router = express.Router();
const reportModel = require('../models/reportModel');
const statsModel = require('../models/statsModel');
const categoryModel = require('../models/categoryModel');

// GET /
// Home page: hero, live counters, latest reports, recently returned.
// Safe and idempotent: reads only, no state changes.
router.get('/', async (req, res, next) => {
  try {
    const [
      openLostResult,
      openFoundResult,
      returnedThisMonth,
      agingOver60,
      latestReports,
      recentlyReturned,
      categories,
    ] = await Promise.all([
      // "Open Lost" / "Open Found" come from narrow list() calls
      // (perPage: 1) because list() already returns the total for us.
      reportModel.list({ kind: 'lost', status: 'open', page: 1, perPage: 1 }),
      reportModel.list({ kind: 'found', status: 'open', page: 1, perPage: 1 }),
      statsModel.returnedThisMonth(),
      statsModel.agingOver(60),
      reportModel.latestN(6),
      reportModel.latestReturned(4),
      categoryModel.list(),
    ]);

    const counts = {
      openLost: openLostResult.total,
      openFound: openFoundResult.total,
      returnedThisMonth,
      agingOver60,
    };

    res.render('home', {
      title: 'CSPC WhereITis - Lost & Found',
      counts,
      latestReports,
      recentlyReturned,
      categories,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;