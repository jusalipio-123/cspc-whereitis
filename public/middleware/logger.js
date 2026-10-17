// middleware/logger.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Custom request logger (Week 5). Records how long each request took and
// logs one line per request once the response has actually finished, so
// the logged status code and duration are the real ones, not guesses.
// -----------------------------------------------------------------------

module.exports = function logger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  // 'finish' fires after the response has been sent to the client, which
  // is the only point at which res.statusCode is final — logging before
  // this (e.g. right after the route handler returns) could log a status
  // code that later middleware or an error handler still changes.
  res.on('finish', () => {
    try {
      const endedAt = process.hrtime.bigint();
      const durationMs = Number(endedAt - startedAt) / 1e6;
      const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(0)}ms`;

      // 5xx responses are server faults, not routine traffic — route them
      // to console.error so they stand out in the terminal / are easy to
      // grep separately from normal 2xx/3xx/4xx access logs.
      if (res.statusCode >= 500) {
        console.error(line);
      } else {
        console.log(line);
      }
    } catch (err) {
      // A logging failure must never take down or affect the actual
      // request/response cycle — swallow it, request already finished.
    }
  });

  next();
};