const Database = require('better-sqlite3');

function openDb(file = process.env.DB_FILE || 'booking.db') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      slot_minutes INTEGER NOT NULL CHECK (slot_minutes BETWEEN 5 AND 1440),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- Weekly opening hours, in minutes from 00:00 UTC. weekday: 0 = Sunday.
    CREATE TABLE IF NOT EXISTS availability_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
      end_minute INTEGER NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
      CHECK (end_minute > start_minute)
    );
    CREATE INDEX IF NOT EXISTS idx_rules_resource ON availability_rules(resource_id, weekday);
    -- starts_at / ends_at are UTC ISO strings, e.g. 2026-10-05T09:00:00.000Z.
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER NOT NULL REFERENCES resources(id),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (ends_at > starts_at)
    );
    -- Slots are fixed-length and grid-aligned, so one confirmed booking per
    -- (resource, start) is what rules out double-booking, even under races.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_no_double
      ON bookings(resource_id, starts_at) WHERE status = 'confirmed';
    CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id, starts_at);
  `);
  // Databases created before the admin flag existed.
  if (!db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'is_admin'").get()) {
    db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
  }
  return db;
}

// Emails listed in ADMIN_EMAILS (comma-separated) are admins. This is how the first admin is made.
function adminEmails() {
  return (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

function promoteAdmins(db) {
  const set = db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?');
  for (const email of adminEmails()) set.run(email);
}

module.exports = { openDb, adminEmails, promoteAdmins };
