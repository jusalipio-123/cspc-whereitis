// middleware/validate.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Plain-JS validation helpers (Week 6) — no express-validator (Week 11+).
// Every rule has the shape (value, fieldName) => { ok, value, error } and
// coerces with String(value || '').trim() first, so undefined/null/number
// input never throws before it can be reported as a clean 422 error.
//
// IMPORTANT: client-side `required` attributes in the EJS forms are
// convenience only — anyone can send a POST with curl and skip the form
// entirely, so every one of these rules is re-run here on the server for
// every state-changing route, regardless of what the browser already
// checked.
// -----------------------------------------------------------------------

function coerce(value) {
  return String(value || '').trim();
}

// required: the single most common rule — most fields in this system
// (title, description, category, etc.) have no sensible default, so an
// empty submission must be rejected rather than silently stored blank.
function required(label) {
  return (value) => {
    const v = coerce(value);
    if (v === '') {
      return { ok: false, value: v, error: `${label} is required.` };
    }
    return { ok: true, value: v, error: null };
  };
}

// minLen: enforces meaningful content rather than token input — e.g.
// NFR-07 requires descriptions of at least 20 characters so reports are
// actually useful to whoever is searching for a match.
function minLen(n, label) {
  return (value) => {
    const v = coerce(value);
    if (v.length < n) {
      return { ok: false, value: v, error: `${label} must be at least ${n} characters.` };
    }
    return { ok: true, value: v, error: null };
  };
}

// maxLen: protects column widths (e.g. VARCHAR(120) title) and keeps
// free-text fields from becoming unreadable walls of text on cards/lists.
function maxLen(n, label) {
  return (value) => {
    const v = coerce(value);
    if (v.length > n) {
      return { ok: false, value: v, error: `${label} must be ${n} characters or fewer.` };
    }
    return { ok: true, value: v, error: null };
  };
}

// oneOf: an ALLOW-list (never a deny-list) for fields like kind/status/
// category slug — only values the system actually understands can ever
// reach a query, which also closes off unexpected ENUM-violating inserts.
function oneOf(allowedArray, label) {
  return (value) => {
    const v = coerce(value);
    if (!allowedArray.includes(v)) {
      return { ok: false, value: v, error: `${label} must be one of: ${allowedArray.join(', ')}.` };
    }
    return { ok: true, value: v, error: null };
  };
}

// isInt: used for ids, pagination pages, PINs, etc. — guards against
// non-numeric input reaching a query or an array index and throwing a
// confusing low-level error instead of a clean validation message.
function isInt(opts, label) {
  const { min, max } = opts || {};
  return (value) => {
    const raw = coerce(value);
    const n = Number(raw);
    if (raw === '' || !Number.isInteger(n)) {
      return { ok: false, value: raw, error: `${label} must be a whole number.` };
    }
    if (typeof min === 'number' && n < min) {
      return { ok: false, value: n, error: `${label} must be at least ${min}.` };
    }
    if (typeof max === 'number' && n > max) {
      return { ok: false, value: n, error: `${label} must be at most ${max}.` };
    }
    return { ok: true, value: n, error: null };
  };
}

// isIsoDate: dates come from <input type="date"> as YYYY-MM-DD strings;
// this checks the exact shape AND that it parses to a real calendar date
// (e.g. rejects 2026-02-30), before the string ever reaches a DATE column.
function isIsoDate(label) {
  return (value) => {
    const v = coerce(value);
    const shapeOk = /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!shapeOk) {
      return { ok: false, value: v, error: `${label} must be a valid date (YYYY-MM-DD).` };
    }
    // Parse as UTC noon to avoid the timezone boundary shifting the date.
    // Using local midnight + toISOString() would silently roll the date
    // backward in UTC+ timezones (e.g. Philippines UTC+8).
    const [y, m, d] = v.split('-').map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    const isRealDate =
      parsed.getUTCFullYear() === y &&
      parsed.getUTCMonth() === m - 1 &&
      parsed.getUTCDate() === d;
    if (!isRealDate) {
      return { ok: false, value: v, error: `${label} must be a valid date (YYYY-MM-DD).` };
    }
    return { ok: true, value: v, error: null };
  };
}
// isDateNotFuture: occurred_on (date lost/found) cannot be in the future
// — a report about something that "will" go missing tomorrow is either a
// data-entry mistake or nonsensical, so this catches it at the boundary.
function isDateNotFuture(label) {
  return (value) => {
    const v = coerce(value);
    const shapeOk = /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!shapeOk) {
      return { ok: false, value: v, error: `${label} must be a valid date (YYYY-MM-DD).` };
    }
    const [y, m, d] = v.split('-').map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));

    // Compare in UTC — build "today" from the local date components so
    // a Manila user submitting today's date is never rejected as "future"
    // because UTC is a day behind.
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    if (parsed.getTime() > todayUTC.getTime()) {
      return { ok: false, value: v, error: `${label} cannot be in the future.` };
    }
    return { ok: true, value: v, error: null };
  };
}
// isEmailLoose: this system never sends email (WON'T list), so a full
// RFC 5322 parser is overkill — a loose shape check (one @, a dot in the
// domain part, no spaces) is enough to catch obvious typos without
// rejecting legitimate but unusual addresses.
function isEmailLoose(label) {
  return (value) => {
    const v = coerce(value);
    const atCount = (v.match(/@/g) || []).length;
    const hasSpaces = /\s/.test(v);
    const domain = v.split('@')[1] || '';
    const domainHasDot = domain.includes('.');
    if (atCount !== 1 || hasSpaces || !domainHasDot) {
      return { ok: false, value: v, error: `${label} must be a valid email address.` };
    }
    return { ok: true, value: v, error: null };
  };
}

// optional: wraps another rule so it only runs when a value was actually
// supplied — used for fields like contact_no that are genuinely allowed
// to be blank but must still be well-formed if the user does fill them in.
function optional(ruleFn) {
  return (value, fieldName) => {
    const v = coerce(value);
    if (v === '') {
      return { ok: true, value: v, error: null };
    }
    return ruleFn(value, fieldName);
  };
}

// atLeastOneOf: cross-field rule for cases like "give us a phone number OR
// an email" — neither field alone is required, but the pair must not both
// be empty, or staff would have no way to reach the reporter at all.
function atLeastOneOf(fieldNames, label) {
  return (formValues) => {
    const anyFilled = fieldNames.some((name) => coerce(formValues[name]) !== '');
    if (!anyFilled) {
      return { ok: false, value: null, error: `${label} — please provide at least one of: ${fieldNames.join(', ')}.` };
    }
    return { ok: true, value: null, error: null };
  };
}

// compose: runs a list of rule functions against one value in order and
// stops at the first failure — so a field never shows more than one
// error at a time, and later rules (e.g. minLen) don't run against a
// value that already failed an earlier rule (e.g. required).
function compose(...ruleFns) {
  return (value, fieldName) => {
    let current = value;
    for (const ruleFn of ruleFns) {
      const result = ruleFn(current, fieldName);
      if (!result.ok) {
        return result;
      }
      current = result.value;
    }
    return { ok: true, value: current, error: null };
  };
}

module.exports = {
  required,
  minLen,
  maxLen,
  oneOf,
  isInt,
  isIsoDate,
  isDateNotFuture,
  isEmailLoose,
  optional,
  atLeastOneOf,
  compose,
};