// lib/refs.js
// CSPC WhereITis — Lost & Found Management System
// -----------------------------------------------------------------------
// Generates the public reference number for a report: LF-YYYY-NNNN,
// zero-padded to four digits, resetting each calendar year (FR-03).
//
// WHY NOT Date.now().toString().slice(-8) (the Week 6 handout shortcut):
//   - Not sequential: two reports created seconds apart get unrelated
//     digit strings, so nobody can glance at two reference numbers and
//     tell which came first — useless for a physical claim-ticket system.
//   - Not human-friendly: a raw millisecond-timestamp slice looks like a
//     phone number, not a ticket a student can read aloud at a counter.
//   - Collides under load: two requests arriving in the same millisecond
//     (or close enough that slice(-8) matches) would produce the SAME
//     "unique" reference, silently violating the UNIQUE constraint on
//     reports.reference_no and crashing one of the two inserts.
//
// The only correct way to hand out gap-free sequential numbers under
// concurrent writers in MySQL (no native CREATE SEQUENCE) is a dedicated
// counter row locked with SELECT ... FOR UPDATE inside a transaction:
// the row lock forces a second concurrent transaction to wait until the
// first commits, so it can never read the same last_value twice.
// -----------------------------------------------------------------------

const { pool } = require('../db');

async function nextReference(kind) {
  const year = new Date().getFullYear();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Ensure a row exists for this year without erroring if it already
    // does — ON DUPLICATE KEY UPDATE year = year is a harmless no-op
    // update used purely to make this an idempotent "insert if missing".
    await conn.execute(
      'INSERT INTO counter_sequence (year, last_value) VALUES (?, 0) ON DUPLICATE KEY UPDATE year = year',
      [year]
    );

    // Row lock: any other transaction trying to read/update this same
    // year row now blocks until this transaction commits or rolls back.
    const [rows] = await conn.execute(
      'SELECT last_value FROM counter_sequence WHERE year = ? FOR UPDATE',
      [year]
    );
    const currentValue = rows[0].last_value;
    const newValue = currentValue + 1;

    await conn.execute(
      'UPDATE counter_sequence SET last_value = ? WHERE year = ?',
      [newValue, year]
    );

    await conn.commit();

    return `LF-${year}-${String(newValue).padStart(4, '0')}`;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { nextReference };