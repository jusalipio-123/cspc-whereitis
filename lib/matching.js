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

  const [candidateRows] = await pool.execute(
    `SELECT * FROM reports
     WHERE kind = ?
       AND category_id = ?
       AND id <> ?
       AND status NOT IN ('archived')
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

module.exports = { STOP_WORDS, tokenize, scoreMatch, suggestMatches };