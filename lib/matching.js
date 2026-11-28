// lib/matching.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// FR-09 — the "Possible matches" matching engine.
//
// This is a DETERMINISTIC, EXPLAINABLE scorer — a fixed point rubric
// evaluated with plain conditionals — NOT machine learning. AI-based /
// image-recognition matching is deliberately excluded from this project
// (see the WON'T list and Week 8's "AI limits" discussion): every point
// awarded here traces back to one named, human-readable reason. The
// `reasons` array returned by scoreMatch/suggestMatches must always be
// shown to staff/students on the report detail page — nobody should
// ever have to trust an opaque number with no explanation attached.
// -----------------------------------------------------------------------

const { pool } = require('../db');

const STOP_WORDS = new Set([
  'the', 'and', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'is',
  'was', 'with', 'this', 'that', 'it', 'its', 'be', 'been', 'are',
  'were', 'from', 'by', 'as', 'or', 'but', 'not', 'my', 'i', 'me',
  'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'his',
  'her', 'their', 'will', 'would', 'can', 'could', 'has', 'have',
  'had', 'do', 'does', 'did', 'so', 'if', 'then', 'than', 'too',
  'also', 'just', 'near', 'around', 'some', 'any', 'there', 'here',
]);

// tokenize: lowercases, strips punctuation down to plain word
// characters, splits on whitespace, then drops both stop words and very
// short tokens (< 3 chars) since those (like "it", "of", "no") carry
// almost no distinguishing signal for matching two item descriptions.
function tokenize(text) {
  const cleaned = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');

  return cleaned
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function daysBetween(dateA, dateB) {
  const msPerDay = 1000 * 60 * 60 * 24;
  const a = new Date(dateA).setHours(0, 0, 0, 0);
  const b = new Date(dateB).setHours(0, 0, 0, 0);
  return Math.abs(a - b) / msPerDay;
}

// scoreMatch: compares two reports (expected to already be opposite
// kind and same category, as filtered by suggestMatches) and returns a
// score plus the human-readable reasons behind every point awarded.
function scoreMatch(reportA, reportB) {
  let score = 0;
  const reasons = [];

  if (reportA.category_id === reportB.category_id) {
    score += 40;
    reasons.push('Same category');
  }

  if (reportA.location_id === reportB.location_id) {
    score += 25;
    reasons.push('Same location');
  }

  const dayGap = daysBetween(reportA.occurred_on, reportB.occurred_on);
  if (dayGap <= 3) {
    score += 15;
    reasons.push('Within 3 days');
  } else if (dayGap <= 7) {
    score += 10;
    reasons.push('Within 7 days');
  }

  const titleTokensA = new Set(tokenize(reportA.title));
  const titleTokensB = new Set(tokenize(reportB.title));
  const overlappingTitleWords = [...titleTokensA].filter((w) => titleTokensB.has(w));
  if (overlappingTitleWords.length >= 2) {
    score += 20;
    reasons.push(`Title words overlap: ${overlappingTitleWords.slice(0, 2).join(', ')}`);
  }

  const descTokensB = new Set(tokenize(reportB.description));
  const mentionedInDescription = [...titleTokensA].find((w) => descTokensB.has(w));
  if (mentionedInDescription) {
    score += 15;
    reasons.push(`Description mentions: ${mentionedInDescription}`);
  }

  return { score, reasons };
}

// suggestMatches: loads reportId, finds opposite-kind candidates in the
// same category within windowDays of its occurred_on date, scores each
// with scoreMatch, and returns the top 5 candidates scoring >= 40 (the
// "same category" floor — anything below that is not worth surfacing).
async function suggestMatches(reportId, windowDays = 30) {
  const [reportRows] = await pool.execute(
    'SELECT * FROM reports WHERE id = ?',
    [reportId]
  );

  if (reportRows.length === 0) {
    return [];
  }

  const report = reportRows[0];
  const oppositeKind = report.kind === 'lost' ? 'found' : 'lost';

  // Never surface an unreviewed guest report as a "Possible match" — the
  // detail page hides pending/rejected reports from non-staff, so the match
  // cards must obey the same rule or they would leak the title, photo,
  // location and date through the back door.
  const [candidateRows] = await pool.execute(
    `SELECT * FROM reports
     WHERE kind = ?
       AND category_id = ?
       AND id <> ?
       AND status NOT IN ('archived')
       AND moderation_status = 'approved'
       AND ABS(DATEDIFF(occurred_on, ?)) <= ?`,
    [oppositeKind, report.category_id, report.id, report.occurred_on, windowDays]
  );

  const scored = candidateRows
    .map((candidate) => {
      const { score, reasons } = scoreMatch(report, candidate);
      return { report: candidate, score, reasons };
    })
    .filter((entry) => entry.score >= 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored;
}

// -----------------------------------------------------------------------
// Nexus scanner relevance.
//
// The scanner used to hand out points for things that say nothing about the
// item being searched (opposite kind, "within 3 days" of *today*), so any
// recent report of the opposite kind scraped past the score floor even with
// zero words in common. A result is now only returned when it passes a
// RELEVANCE GATE first; points are awarded afterwards, purely to rank.
//
//   1. Hard filters: a category / location / kind the visitor picked must
//      match exactly.
//   2. The visitor's words (minus filler like "lost", "item", "floor") must
//      appear in the report's title, description, category or location, and
//      at least one of them in the title, description or category — a hit
//      on the location name alone never counts.
//   3. Coverage: with 1-2 words ALL must be found; with more, at least
//      SCAN_COVERAGE of them.
// -----------------------------------------------------------------------
const SCAN_COVERAGE = 0.5;

// Words that describe the *situation*, not the item. They would otherwise
// "match" half the board ("lost black wallet" vs "lost ID card").
const SCAN_NOISE = new Set([
  'lost', 'lose', 'losing', 'found', 'find', 'missing', 'misplaced', 'left',
  'item', 'items', 'thing', 'things', 'something', 'stuff', 'please', 'help',
  'looking', 'look', 'campus', 'cspc', 'nabua', 'floor', 'room', 'building',
  'hallway', 'corridor', 'area', 'side', 'yesterday', 'today', 'tomorrow',
  'morning', 'afternoon', 'evening', 'night', 'ago', 'day', 'week', 'last',
  'somewhere', 'anywhere', 'who', 'what', 'where', 'when', 'how', 'about',
  'after', 'before', 'while', 'got', 'get', 'one', 'two', 'few', 'very',
]);

// Light plural folding so "umbrellas" matches "umbrella". Applied to both
// sides, so the folded form never needs to be a real word ("lens" -> "len").
function stem(token) {
  const t = String(token || '');
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 4 && /(ss|sh|ch|x|z)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) return t.slice(0, -1);
  return t;
}

function stemSet(text) {
  return new Set(tokenize(text).map(stem));
}

// scanTerms: the distinctive words in what the visitor typed, as
// { stem, word } pairs (stem is compared, word is what we show back).
function scanTerms(text) {
  const out = [];
  const seen = new Set();
  tokenize(text).forEach((word) => {
    if (SCAN_NOISE.has(word)) return;
    const s = stem(word);
    if (SCAN_NOISE.has(s) || seen.has(s)) return;
    seen.add(s);
    out.push({ stem: s, word });
  });
  return out;
}

// scanProbe: scores an ad-hoc description (typed or spoken) against a real
// report. Returns { score: 0, reasons: [], matched: [] } when the report is
// not a genuine match for the description; callers keep only score > 0.
function scanProbe(probe, candidate) {
  const none = { score: 0, reasons: [], matched: [] };

  // 1. Hard filters.
  if (probe.category_id && candidate.category_id !== probe.category_id) return none;
  if (probe.location_id && candidate.location_id !== probe.location_id) return none;
  if (probe.kind && candidate.kind && probe.kind === candidate.kind) return none;

  // 2 + 3. Relevance gate on the words themselves.
  const terms = scanTerms([probe.title, probe.description].filter(Boolean).join(' '));
  if (!terms.length) return none;

  const titleSet = stemSet(candidate.title);
  const descSet = stemSet(candidate.description);
  const catSet = stemSet(candidate.category_name);
  const locSet = stemSet(candidate.location_name);

  const inTitle = terms.filter((t) => titleSet.has(t.stem));
  const inDesc = terms.filter((t) => descSet.has(t.stem));
  const inCat = terms.filter((t) => catSet.has(t.stem));
  const inLoc = terms.filter((t) => locSet.has(t.stem));

  const matched = terms.filter((t) => (
    titleSet.has(t.stem) || descSet.has(t.stem) || catSet.has(t.stem) || locSet.has(t.stem)
  ));
  const itemHits = terms.filter((t) => (
    titleSet.has(t.stem) || descSet.has(t.stem) || catSet.has(t.stem)
  ));

  const required = terms.length <= 2 ? terms.length : Math.ceil(terms.length * SCAN_COVERAGE);
  if (itemHits.length === 0 || matched.length < required) return none;

  // Passed the gate: now award points, only to rank the genuine matches.
  let score = 0;
  const reasons = [];
  const words = (list) => list.slice(0, 3).map((t) => t.word).join(', ');

  reasons.push('Matches your words: ' + words(matched)
    + ' (' + matched.length + ' of ' + terms.length + ')');

  if (probe.category_id && candidate.category_id === probe.category_id) {
    score += 40;
    reasons.push('Same category');
  } else if (inCat.length) {
    score += 10;
    reasons.push('Category matches: ' + words(inCat));
  }

  if (probe.location_id && candidate.location_id === probe.location_id) {
    score += 25;
    reasons.push('Same location');
  } else if (inLoc.length) {
    score += 5;
    reasons.push('Location matches: ' + words(inLoc));
  }

  if (probe.kind && candidate.kind && probe.kind !== candidate.kind) {
    score += 10;
    reasons.push('Opposite kind (lost ↔ found)');
  }

  if (probe.occurred_on && candidate.occurred_on) {
    const dayGap = daysBetween(probe.occurred_on, candidate.occurred_on);
    if (dayGap <= 3) {
      score += 15;
      reasons.push('Within 3 days');
    } else if (dayGap <= 7) {
      score += 10;
      reasons.push('Within 7 days');
    } else if (dayGap <= 14) {
      score += 5;
      reasons.push('Within 14 days');
    }
  }

  if (inTitle.length >= 2) {
    score += 20;
    reasons.push('Title words overlap: ' + words(inTitle));
  } else if (inTitle.length === 1) {
    score += 10;
    reasons.push('Title mentions: ' + inTitle[0].word);
  }

  if (inDesc.length >= 2) {
    score += 15;
    reasons.push('Description overlap: ' + words(inDesc));
  } else if (inDesc.length === 1) {
    score += 8;
    reasons.push('Description mentions: ' + inDesc[0].word);
  }

  // Never exceed 125 — the score meter in public/js/app.js and nexus.js
  // treats 125 as full.
  return { score: Math.min(score, 125), reasons, matched: matched.map((t) => t.word) };
}

module.exports = { STOP_WORDS, tokenize, scoreMatch, suggestMatches, scanProbe, scanTerms };