// lib/antispam.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Spam safeguards for GUEST reports. Layered on purpose - no single check is
// trusted on its own, and the last line of defence is a human (staff review):
//   1. honeypot field        - a hidden input real people never fill in
//   2. signed time token     - rejects instant bot posts and stale/forged forms
//   3. per-source rate limit - stored in the DB, keyed by an HMAC of the IP
//   4. duplicate + link check- cheap content heuristics
//   5. staff approval        - nothing a guest posts is public until approved
// Layers 1-4 only raise the cost of abuse. Layer 5 is what actually stops it.
// -----------------------------------------------------------------------

const hmac = require('./hmac');

const MIN_FILL_MS = 4 * 1000;            // a human cannot fill the form faster
const MAX_AGE_MS = 2 * 60 * 60 * 1000;   // an open tab older than this must reload
const HONEYPOT_FIELD = 'website';

const MAX_PER_SOURCE_PER_DAY = Number(process.env.GUEST_REPORTS_PER_DAY) || 3;

// issueFormToken: "<issuedAtMs>.<signature>" - signed with PROCESS_SECRET so a
// bot cannot invent a token with a convincing old timestamp.
function issueFormToken() {
  const ts = String(Date.now());
  return ts + '.' + hmac.sign('guestform.' + ts);
}

function checkFormToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !/^\d+$/.test(parts[0])) return { ok: false, reason: 'missing' };
  if (!hmac.verify('guestform.' + parts[0], parts[1])) return { ok: false, reason: 'forged' };
  const age = Date.now() - Number(parts[0]);
  if (age < MIN_FILL_MS) return { ok: false, reason: 'too-fast' };
  if (age > MAX_AGE_MS) return { ok: false, reason: 'expired' };
  return { ok: true };
}

// hashSource: HMAC of the client IP. Not reversible, but stable, so the same
// connection always maps to the same value. (Behind a proxy, set
// app.set('trust proxy', 1) so req.ip is the visitor and not the proxy.)
function hashSource(ip) {
  return hmac.sign('src.' + String(ip || 'unknown'));
}

const LINK_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|ph|xyz|ru|info|biz)\b)/i;
function containsLink(text) {
  return LINK_RE.test(String(text || ''));
}

module.exports = {
  HONEYPOT_FIELD, MAX_PER_SOURCE_PER_DAY,
  issueFormToken, checkFormToken, hashSource, containsLink,
};
