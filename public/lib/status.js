// lib/status.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Single source of truth for which report status transitions are legal.
// Frozen so nothing at runtime can accidentally mutate the allowed
// transition map.
//
// Any POST route that attempts a transition NOT listed here must respond
// 422 with the message "That status change is not allowed from
// <current>." — it must never silently ignore the request or apply it
// anyway. This is the Week 4 exception-path discipline applied to report
// state.
// -----------------------------------------------------------------------

const TRANSITIONS = Object.freeze({
  open: Object.freeze(['matched', 'claimed', 'returned', 'archived']),
  matched: Object.freeze(['open', 'claimed', 'returned', 'archived']),
  claimed: Object.freeze(['returned', 'open', 'archived']),
  returned: Object.freeze(['archived']),
  archived: Object.freeze([]),
});

function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

// Human-readable summary of a status's legal next moves, for staff-facing UI hints.
function describe(from) {
  const allowed = TRANSITIONS[from];
  if (!Array.isArray(allowed) || allowed.length === 0) {
    return `${from} is a final status — no further changes are allowed.`;
  }
  return `From ${from}, this report can move to: ${allowed.join(', ')}.`;
}

module.exports = { TRANSITIONS, canTransition, describe };