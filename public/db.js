// db.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// mysql2/promise connection pool.
//
// WHY A POOL INSTEAD OF A SINGLE CONNECTION:
// - Concurrency: Express handles many requests in parallel (Node's event
//   loop). A single MySQL connection can only run one query at a time, so
//   concurrent requests would queue up behind each other. A pool hands out
//   a free connection per query and returns it when done, so requests can
//   genuinely run in parallel against MySQL.
// - Automatic reconnect: mysql2's pool transparently opens a fresh
//   connection to replace one that was closed/dropped (idle timeout,
//   network blip, MySQL restart) — a bare single connection just dies and
//   every subsequent query throws until the process is restarted.
// - Per-request checkout: each route handler calls pool.query()/execute()
//   (or pool.getConnection() for transactions like nextReference() and
//   claim approval), uses a connection for the lifetime of that one
//   request, then releases it back to the pool — no connection is ever
//   shared or held across unrelated requests.
// -----------------------------------------------------------------------

require('dotenv').config();

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'whereitis',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Return JS Date objects (not strings) for DATE/DATETIME/TIMESTAMP
  // columns — every model in this project expects real Date objects.
  dateStrings: false,
});

// -------------------------------------------------------------------
// ping()
// Runs a trivial, parameter-free query to confirm the pool can reach
// MySQL. Used by server.js at startup (fail fast if DB is unreachable)
// and by GET /health for a lightweight liveness check.
//
// Not called at module load on purpose: requiring this file must never
// have a side effect that hits the network — the caller (server.js)
// decides when to actually check connectivity.
// -------------------------------------------------------------------
async function ping() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    throw new Error(`DB connection failed: ${err.message}`);
  }
}

module.exports = { pool, ping };