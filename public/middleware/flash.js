// middleware/flash.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Query-string flash messages — NOT session-based. Sessions arrive in
// Week 11 (express-session); until then, Post/Redirect/Get routes pass a
// short flash message through the redirect URL's query string
// (e.g. POST /reports -> redirect 303 to /reports/LF-2026-0001?flash=ok:Report%20created).
//
// This middleware reads that one query param on the GET that follows,
// exposes it as res.locals.flash for the view to render, and then it is
// gone — reloading or bookmarking the page without the query string
// shows nothing, so a flash is read exactly once by design (there is no
// server-side store to "clear" the way a session flash would need).
// -----------------------------------------------------------------------

module.exports = function flash(req, res, next) {
  const raw = req.query.flash;

  if (typeof raw !== 'string' || raw.length === 0) {
    res.locals.flash = null;
    return next();
  }

  // Convention: "<type>:<message>", type is one of ok | err | info.
  // indexOf (not split on every ':') so a message containing a colon
  // (e.g. a time "3:00 PM") is not truncated.
  const sepIndex = raw.indexOf(':');
  if (sepIndex === -1) {
    res.locals.flash = null;
    return next();
  }

  const type = raw.slice(0, sepIndex);
  const message = raw.slice(sepIndex + 1);
  const allowedTypes = ['ok', 'err', 'info'];

  if (!allowedTypes.includes(type) || message.trim() === '') {
    res.locals.flash = null;
    return next();
  }

  res.locals.flash = { type, message };
  next();
};