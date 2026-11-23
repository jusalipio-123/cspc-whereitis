// routes/nexus.js
// Public "Nexus" command centre: campus radar, explainable match scanner,
// and a live pulse of recent reports. Every GET is safe. POST /api/nexus/scan
// only reads; it never writes. Guest contact fields are stripped before JSON.

const express = require('express');
const router = express.Router();
const reportModel = require('../models/reportModel');
const categoryModel = require('../models/categoryModel');
const locationModel = require('../models/locationModel');
const matching = require('../lib/matching');
const phTime = require('../lib/time');

const SCAN_MIN = 3;
const SCAN_MAX = 200;
const SCAN_LIMIT = 8;
const SCAN_FLOOR = 15;
const CORPUS_SIZE = 120;

// Tiny in-memory throttle so a scripted client cannot hammer the scanner.
const hits = new Map();
function tooMany(ip, max, windowMs) {
  const now = Date.now();
  const key = String(ip || 'unknown');
  let bucket = hits.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, n: 0 };
    hits.set(key, bucket);
  }
  bucket.n += 1;
  if (hits.size > 2000) {
    for (const [k, v] of hits) {
      if (now - v.start >= windowMs) hits.delete(k);
    }
  }
  return bucket.n > max;
}

function publicReport(row) {
  if (!row) return null;
  return {
    reference_no: row.reference_no,
    title: row.title,
    kind: row.kind,
    status: row.status,
    category_name: row.category_name,
    location_name: row.location_name,
    occurred_on: row.occurred_on,
    photo_url: row.photo_url || null,
    created_at: row.created_at,
  };
}

function groupRadar(rows) {
  const zones = new Map();
  rows.forEach((row) => {
    const key = row.zone || 'Campus';
    if (!zones.has(key)) zones.set(key, { zone: key, lost: 0, found: 0, locations: [] });
    const z = zones.get(key);
    z.lost += row.lost_n;
    z.found += row.found_n;
    z.locations.push({
      id: row.location_id,
      name: row.name,
      lost: row.lost_n,
      found: row.found_n,
    });
  });
  return [...zones.values()].sort((a, b) => (b.lost + b.found) - (a.lost + a.found));
}

// GET /nexus
router.get('/nexus', async (req, res, next) => {
  try {
    const [radarRows, latest, categories, locations, counts, openLostResult, openFoundResult] = await Promise.all([
      reportModel.radarByLocation(),
      reportModel.latestN(8),
      categoryModel.list(),
      locationModel.listPublic(),
      reportModel.countByStatus(),
      reportModel.list({ kind: 'lost', status: 'open', page: 1, perPage: 1 }),
      reportModel.list({ kind: 'found', status: 'open', page: 1, perPage: 1 }),
    ]);

    const zones = groupRadar(radarRows);
    const openLost = openLostResult.total;
    const openFound = openFoundResult.total;

    res.render('nexus/index', {
      title: 'Nexus',
      description: 'CSPC WhereITis Nexus — campus radar, match scanner, and live pulse.',
      zones,
      latest,
      categories,
      locations,
      counts: {
        open: counts.open || 0,
        matched: counts.matched || 0,
        claimed: counts.claimed || 0,
        returned: counts.returned || 0,
        openLost,
        openFound,
      },
      scannedAt: phTime.fmtDateTime(new Date()),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/nexus/pulse — newest public reports for the live feed.
router.get('/api/nexus/pulse', async (req, res, next) => {
  try {
    if (tooMany(req.ip, 60, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    }
    const rows = await reportModel.latestN(12);
    res.json({
      ok: true,
      generated_at: new Date().toISOString(),
      items: rows.map(publicReport),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/nexus/radar — zone counts, for a live refresh of the map.
router.get('/api/nexus/radar', async (req, res, next) => {
  try {
    if (tooMany(req.ip, 60, 60 * 1000)) {
      return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    }
    const rows = await reportModel.radarByLocation();
    res.json({ ok: true, zones: groupRadar(rows) });
  } catch (err) {
    next(err);
  }
});

// POST /api/nexus/scan — explainable match scan against open reports.
router.post('/api/nexus/scan', async (req, res, next) => {
  try {
    if (tooMany(req.ip, 20, 60 * 1000)) {
      return res.status(429).json({ error: 'Scanner is cooling down. Try again in a minute.' });
    }

    const body = req.body || {};
    const q = String(body.q || '').trim();
    if (q.length < SCAN_MIN) {
      return res.status(400).json({ error: 'Describe the item in at least ' + SCAN_MIN + ' characters.' });
    }
    if (q.length > SCAN_MAX) {
      return res.status(400).json({ error: 'Keep the description under ' + SCAN_MAX + ' characters.' });
    }

    const kind = body.kind === 'lost' || body.kind === 'found' ? body.kind : null;
    const categoryId = Number.parseInt(body.category_id, 10) || null;
    const locationId = Number.parseInt(body.location_id, 10) || null;

    const corpus = await reportModel.scanCorpus(CORPUS_SIZE);
    const probe = {
      title: q,
      description: q,
      kind,
      category_id: categoryId,
      location_id: locationId,
      occurred_on: new Date(),
    };

    const matches = corpus
      .filter((row) => !kind || row.kind !== kind) // if you lost it, prefer found reports
      .map((row) => {
        const { score, reasons } = matching.scanProbe(probe, row);
        return { report: publicReport(row), score, reasons };
      })
      .filter((entry) => entry.score >= SCAN_FLOOR && entry.reasons.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, SCAN_LIMIT);

    res.json({
      ok: true,
      query: q,
      corpus: corpus.length,
      matches,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
