// routes/assistant.js
// CSPC WhereITis — endpoints for the AI help assistant.
//
//   GET  /api/assistant/status   { enabled: true|false }   (never calls the AI)
//   POST /api/assistant/chat     { messages: [{role, content}, ...] }
//
// Safety rails:
//   * The API key stays on the server (lib/assistant.js).
//   * Lookups are read-only and return a WHITELIST of public fields only. Guest
//     contact details, report descriptions (which owners use to verify claims),
//     reporter names and photos never reach the model.
//   * Pending-review and withdrawn reports are never returned.
//   * Per-visitor rate limits plus a site-wide daily cap bound the API bill.

const express = require('express');
const router = express.Router();

const assistant = require('../lib/assistant');
const reportModel = require('../models/reportModel');
const categoryModel = require('../models/categoryModel');
const locationModel = require('../models/locationModel');
const matching = require('../lib/matching');

const PER_MINUTE = Number(process.env.ASSISTANT_PER_MINUTE) || 8;
const PER_DAY = Number(process.env.ASSISTANT_PER_DAY) || 60;
const SITE_DAILY_CAP = Number(process.env.ASSISTANT_SITE_DAILY_CAP) || 1500;

// ---- tiny in-memory limiter (fine for one Node process) ---------------
const buckets = new Map();
let siteDay = { day: '', n: 0 };

function hit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start >= windowMs) { b = { start: now, n: 0 }; buckets.set(key, b); }
  b.n += 1;
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now - v.start >= 24 * 3600 * 1000) buckets.delete(k);
  }
  return b.n > max;
}

function siteCapReached() {
  const today = new Date().toISOString().slice(0, 10);
  if (siteDay.day !== today) siteDay = { day: today, n: 0 };
  siteDay.n += 1;
  return siteDay.n > SITE_DAILY_CAP;
}

// ---- public-field whitelist -------------------------------------------
function publicReport(row) {
  const out = {
    reference_no: row.reference_no,
    title: row.title,
    kind: row.kind,
    status: row.status,
    category: row.category_name,
    location: row.location_name,
    occurred_on: row.occurred_on instanceof Date ? row.occurred_on.toISOString().slice(0, 10) : row.occurred_on,
  };
  // Shown on the public report page already; useful for "where do I pick it up?".
  if (row.kind === 'found' && row.holding_location) out.holding_location = row.holding_location;
  return out;
}

const deps = {
  async searchReports(q, kind) {
    const result = await reportModel.list({ q, kind, page: 1, perPage: 6, sort: 'newest' });
    return (result.rows || []).map(publicReport);
  },

  async findMatches(description, kind) {
    const corpus = await reportModel.scanCorpus(120);
    const probe = { title: description, description, kind, category_id: null, location_id: null, occurred_on: new Date() };
    return corpus
      .filter((row) => !kind || row.kind !== kind)
      .map((row) => {
        const { score, reasons } = matching.scanProbe(probe, row);
        return { report: publicReport(row), score, reasons };
      })
      .filter((m) => m.score >= 15 && m.reasons.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  },

  async getReport(reference) {
    const row = await reportModel.findByReference(reference);
    if (!row) return null;
    // findByReference does not filter on review state, so enforce it here.
    if (row.moderation_status !== 'approved') return null;
    if (!reportModel.canView(row, null)) return null;
    return publicReport(row);
  },

  async siteStats() {
    const counts = await reportModel.countByStatus();
    return {
      open: counts.open || 0,
      matched: counts.matched || 0,
      claimed: counts.claimed || 0,
      returned: counts.returned || 0,
    };
  },

  async listOptions() {
    const [categories, locations] = await Promise.all([categoryModel.list(), locationModel.listPublic()]);
    return {
      categories: categories.map((c) => c.name),
      locations: locations.map((l) => l.name),
    };
  },
};

// GET /api/assistant/status
router.get('/api/assistant/status', (req, res) => {
  res.json({ enabled: assistant.isEnabled() });
});

// POST /api/assistant/chat
router.post('/api/assistant/chat', async (req, res) => {
  if (!assistant.isEnabled()) {
    return res.status(503).json({ ok: false, fallback: true, error: 'The AI assistant is not turned on.' });
  }

  const ip = String(req.ip || 'unknown');
  if (hit('m:' + ip, PER_MINUTE, 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'You are sending messages quickly. Please wait a minute.' });
  }
  if (hit('d:' + ip, PER_DAY, 24 * 3600 * 1000)) {
    return res.status(429).json({ ok: false, error: 'Daily assistant limit reached. The Help page and the Nexus scanner still work.' });
  }
  if (siteCapReached()) {
    return res.status(503).json({ ok: false, fallback: true, error: 'The assistant is resting for today.' });
  }

  const body = req.body || {};
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ ok: false, error: 'Say something first.' });
  }

  try {
    const out = await assistant.chat({
      messages: body.messages,
      signedIn: !!req.identity,
      deps,
    });
    return res.json({ ok: true, reply: out.reply });
  } catch (err) {
    const status = err && err.status ? err.status : 502;
    console.error('[assistant]', err && err.message);
    return res.status(status).json({
      ok: false,
      fallback: status >= 500,
      error: (err && err.publicMessage) || 'The assistant is unavailable right now.',
    });
  }
});

module.exports = router;
