// server.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Entry point. Loads environment variables, verifies the database is
// reachable, then starts listening. Kept separate from app.js so app.js
// can be required (e.g. by a future test suite) without opening a port
// or requiring a live database connection.
// -----------------------------------------------------------------------

require('dotenv').config();

const app = require('./app');
const db = require('./db');

const PORT = process.env.PORT || 3000;

async function start() {
  // Fail fast: if MySQL is unreachable at boot, we want a clear error in
  // the terminal immediately, not a server that "looks" up but 500s on
  // every request that touches the database.
  await db.ping();

  app.listen(PORT, () => {
    console.log(
      `CSPC WhereITis listening on http://localhost:${PORT}  [${process.env.NODE_ENV || 'development'}]`
    );
  });
}

start().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});