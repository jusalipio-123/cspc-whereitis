// lib/time.js
// CSPC WhereITis: one place for time zone handling.
// The whole app runs on Philippine Standard Time (PST, UTC+08:00, IANA
// "Asia/Manila"; no daylight saving). Every date shown to a user goes
// through these helpers, so the displayed time is right no matter what
// time zone the server computer itself is set to.

const TZ = 'Asia/Manila';
const OFFSET = '+08:00';
const LOCALE = 'en-PH';

function toDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x) ? null : x;
}

// "Oct 18, 2026"
function fmtDate(d, opts) {
  const x = toDate(d);
  if (!x) return '';
  return x.toLocaleDateString(LOCALE, Object.assign({ month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ }, opts || {}));
}

// "Oct 18, 2026, 8:58 AM"
function fmtDateTime(d, opts) {
  const x = toDate(d);
  if (!x) return '';
  return x.toLocaleString(LOCALE, Object.assign({ month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ }, opts || {}));
}

// Parts of "now" or of a given date, as seen in the Philippines.
function parts(d) {
  const x = toDate(d || new Date());
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const o = {};
  f.formatToParts(x).forEach((p) => { o[p.type] = p.value; });
  return o;
}

// "2026-10-18": today's date in the Philippines (for date inputs, filters).
function todayISO() {
  const p = parts();
  return p.year + '-' + p.month + '-' + p.day;
}

// "2026-10-18" for any date, as seen in the Philippines.
function isoDate(d) {
  if (!toDate(d)) return '';
  const p = parts(d);
  return p.year + '-' + p.month + '-' + p.day;
}

// "2026-10-18 08:58:00": for CSV exports.
function isoDateTime(d) {
  if (!toDate(d)) return '';
  const p = parts(d);
  return p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute + ':' + p.second;
}

module.exports = { TZ, OFFSET, fmtDate, fmtDateTime, todayISO, isoDate, isoDateTime, parts };
