// scripts/preview-ui.js
// Renders the real EJS templates with sample data so you can look at the UI
// without MySQL. Not used in production. Bind 0.0.0.0 for the Arena preview.

process.env.TZ = 'Asia/Manila';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const express = require('express');
const path = require('path');
const phTime = require('../lib/time');
const matching = require('../lib/matching');

const root = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(root, 'views'));
app.locals.icons = require('../views/partials/icons.js');
app.locals.googleClientId = '';
app.locals.fmtDate = phTime.fmtDate;
app.locals.fmtDateTime = phTime.fmtDateTime;
app.locals.todayISO = phTime.todayISO;
app.locals.isoDate = phTime.isoDate;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(root, 'public')));

app.use((req, res, next) => {
  res.locals.identity = null;
  res.locals.currentPath = req.originalUrl;
  res.locals.flash = null;
  res.locals.unreadCount = 0;
  next();
});

const now = new Date();
function daysAgo(n) {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
}

const categories = [
  { id: 1, name: 'Bags' },
  { id: 2, name: 'Gadgets' },
  { id: 3, name: 'IDs & Cards' },
  { id: 4, name: 'Umbrellas & Raincoats' },
  { id: 5, name: 'Bottles, Tumblers & Lunch Boxes' },
];

const locations = [
  { id: 2, name: 'CCS - 2nd Floor Hallway', zone: 'College of Computer Studies' },
  { id: 3, name: 'Library', zone: 'Academic' },
  { id: 4, name: 'Gymnasium', zone: 'Sports' },
  { id: 5, name: 'Canteen / Food Court', zone: 'Amenities' },
  { id: 6, name: 'Main Gate', zone: 'Entrance & Grounds' },
];

const reports = [
  {
    id: 1, reference_no: 'LF-2026-0001', kind: 'lost', status: 'open',
    title: 'Black Nike umbrella',
    description: 'Black Nike folding umbrella left near the CCS 2nd floor hallway after rain.',
    category_id: 4, category_name: 'Umbrellas & Raincoats',
    location_id: 2, location_name: 'CCS - 2nd Floor Hallway',
    occurred_on: daysAgo(1), created_at: daysAgo(1), photo_url: null, tags: [], days_held: 1,
  },
  {
    id: 2, reference_no: 'LF-2026-0002', kind: 'found', status: 'open',
    title: 'Blue ID lace with CSPC card',
    description: 'Found a student ID in a blue lace near the library entrance.',
    category_id: 3, category_name: 'IDs & Cards',
    location_id: 3, location_name: 'Library',
    occurred_on: daysAgo(2), created_at: daysAgo(2), photo_url: null, tags: [], days_held: 2,
  },
  {
    id: 3, reference_no: 'LF-2026-0003', kind: 'found', status: 'open',
    title: 'Black folding umbrella',
    description: 'Black umbrella with a Nike swoosh, turned in at CCS faculty room.',
    category_id: 4, category_name: 'Umbrellas & Raincoats',
    location_id: 2, location_name: 'CCS - 2nd Floor Hallway',
    occurred_on: daysAgo(1), created_at: daysAgo(1), photo_url: null, tags: [], days_held: 1,
  },
  {
    id: 4, reference_no: 'LF-2026-0004', kind: 'lost', status: 'open',
    title: 'Stainless tumbler with CCS sticker',
    description: 'Silver tumbler left at the canteen. Has a College of Computer Studies sticker.',
    category_id: 5, category_name: 'Bottles, Tumblers & Lunch Boxes',
    location_id: 5, location_name: 'Canteen / Food Court',
    occurred_on: daysAgo(4), created_at: daysAgo(3), photo_url: null, tags: [], days_held: 4,
  },
  {
    id: 5, reference_no: 'LF-2026-0005', kind: 'found', status: 'matched',
    title: 'Wireless earbuds case',
    description: 'White earbuds charging case found at the gym bleachers.',
    category_id: 2, category_name: 'Gadgets',
    location_id: 4, location_name: 'Gymnasium',
    occurred_on: daysAgo(6), created_at: daysAgo(5), photo_url: null, tags: [], days_held: 6,
  },
  {
    id: 6, reference_no: 'LF-2026-0006', kind: 'lost', status: 'returned',
    title: 'Maroon tote bag',
    description: 'Canvas tote returned to the owner at the main gate.',
    category_id: 1, category_name: 'Bags',
    location_id: 6, location_name: 'Main Gate',
    occurred_on: daysAgo(12), created_at: daysAgo(12), returned_at: daysAgo(2),
    photo_url: null, tags: [], days_held: 12,
  },
];

const zones = [
  { zone: 'College of Computer Studies', lost: 1, found: 1, locations: [{ id: 2, name: 'CCS - 2nd Floor Hallway', lost: 1, found: 1 }] },
  { zone: 'Academic', lost: 0, found: 1, locations: [{ id: 3, name: 'Library', lost: 0, found: 1 }] },
  { zone: 'Sports', lost: 0, found: 1, locations: [{ id: 4, name: 'Gymnasium', lost: 0, found: 1 }] },
  { zone: 'Amenities', lost: 1, found: 0, locations: [{ id: 5, name: 'Canteen / Food Court', lost: 1, found: 0 }] },
  { zone: 'Entrance & Grounds', lost: 0, found: 0, locations: [{ id: 6, name: 'Main Gate', lost: 0, found: 0 }] },
];

function publicReport(row) {
  return {
    reference_no: row.reference_no,
    title: row.title,
    kind: row.kind,
    status: row.status,
    category_name: row.category_name,
    location_name: row.location_name,
    occurred_on: row.occurred_on,
    photo_url: row.photo_url,
    created_at: row.created_at,
  };
}

app.get('/', (req, res) => {
  res.render('home', {
    title: 'CSPC WhereITis - Lost & Found',
    counts: { openLost: 2, openFound: 3, returnedThisMonth: 1, agingOver60: 0 },
    latestReports: reports.filter((r) => r.status !== 'returned'),
    recentlyReturned: reports.filter((r) => r.status === 'returned'),
    categories,
  });
});

app.get('/nexus', (req, res) => {
  res.render('nexus/index', {
    title: 'Nexus',
    description: 'CSPC WhereITis Nexus — campus radar, match scanner, and live pulse.',
    zones,
    latest: reports.slice(0, 6),
    categories,
    locations,
    counts: { open: 4, matched: 1, claimed: 0, returned: 1, openLost: 2, openFound: 3 },
    scannedAt: phTime.fmtDateTime(now),
  });
});

app.get('/api/nexus/pulse', (req, res) => {
  res.json({ ok: true, generated_at: new Date().toISOString(), items: reports.map(publicReport) });
});

app.get('/api/nexus/radar', (req, res) => {
  res.json({ ok: true, zones });
});

app.post('/api/nexus/scan', (req, res) => {
  const q = String((req.body && req.body.q) || '').trim();
  if (q.length < 3) return res.status(400).json({ error: 'Describe the item in at least 3 characters.' });
  const kind = req.body.kind === 'lost' || req.body.kind === 'found' ? req.body.kind : null;
  const probe = {
    title: q, description: q, kind,
    category_id: Number.parseInt(req.body.category_id, 10) || null,
    location_id: Number.parseInt(req.body.location_id, 10) || null,
    occurred_on: new Date(),
  };
  const matches = reports
    .filter((row) => row.status !== 'returned' && (!kind || row.kind !== kind))
    .map((row) => {
      const { score, reasons } = matching.scanProbe(probe, row);
      return { report: publicReport(row), score, reasons };
    })
    .filter((entry) => entry.score >= 15 && entry.reasons.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  res.json({ ok: true, query: q, corpus: reports.length, matches });
});

app.get('/help', (req, res) => res.render('pages/help', { title: 'User guide' }));
app.get('/about', (req, res) => res.render('pages/about', { title: 'About' }));
app.get('/privacy', (req, res) => res.render('pages/privacy', { title: 'Privacy Notice' }));
app.get('/terms', (req, res) => res.render('pages/terms', { title: 'Terms of Use' }));
app.get('/cookies', (req, res) => res.render('pages/cookies', { title: 'Cookie Notice' }));
app.get('/accessibility', (req, res) => res.render('pages/accessibility', { title: 'Accessibility Statement' }));

app.get('/reports/:reference', (req, res) => {
  const report = reports.find((r) => r.reference_no === req.params.reference);
  if (!report) return res.status(404).render('errors/404', { title: 'Not found' });
  res.render('reports/detail', {
    title: report.title + ' - ' + report.reference_no,
    report,
    comments: [],
    possibleMatches: [],
    bookmarked: false,
  });
});

app.get('/reports', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const rows = reports.filter((r) => !q || (r.title + ' ' + r.description).toLowerCase().includes(q));
  res.render('home', {
    title: 'Reports (preview)',
    counts: { openLost: 2, openFound: 3, returnedThisMonth: 1, agingOver60: 0 },
    latestReports: rows,
    recentlyReturned: [],
    categories,
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: 'ui-preview', note: 'Sample data only — MySQL is not connected.' });
});

app.use((req, res) => {
  if (String(req.originalUrl || '').startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).render('errors/404', { title: 'Not found' });
});

app.listen(PORT, HOST, () => {
  console.log(`UI preview (sample data) on http://${HOST}:${PORT}`);
});
