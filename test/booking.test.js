const test = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { createBooking, cancelBooking, slotsForDate, BookingError } = require('../src/booking');

// Next Monday (UTC), so slots are always in the future.
function nextMonday() {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

function setup() {
  const db = openDb(':memory:');
  const u = db.prepare("INSERT INTO users (email, name, password_hash) VALUES (?, 'U', 'x')");
  const alice = Number(u.run('a@x.co').lastInsertRowid);
  const bob = Number(u.run('b@x.co').lastInsertRowid);
  const resourceId = Number(db.prepare("INSERT INTO resources (name, slot_minutes) VALUES ('Room', 60)").run().lastInsertRowid);
  db.prepare('INSERT INTO availability_rules (resource_id, weekday, start_minute, end_minute) VALUES (?, 1, 540, 720)').run(resourceId); // Mon 09:00-12:00
  return { db, alice, bob, resourceId, day: nextMonday() };
}
const status = (fn) => { try { fn(); } catch (e) { assert(e instanceof BookingError); return e.status; } };

test('lists grid-aligned slots inside opening hours', () => {
  const { db, resourceId, day } = setup();
  const slots = slotsForDate(db, db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId), day);
  assert.deepEqual(slots.map(s => s.starts_at.slice(11, 16)), ['09:00', '10:00', '11:00']);
  assert.equal(slotsForDate(db, { id: resourceId, slot_minutes: 60 }, '2099-01-02').length, 0); // a Friday
});

test('booking takes a slot; double-booking and off-grid times are rejected', () => {
  const { db, alice, bob, resourceId, day } = setup();
  const startsAt = `${day}T10:00:00.000Z`;
  const b = createBooking(db, { userId: alice, resourceId, startsAt });
  assert.equal(b.ends_at, `${day}T11:00:00.000Z`);
  assert.equal(status(() => createBooking(db, { userId: bob, resourceId, startsAt })), 409);
  assert.equal(status(() => createBooking(db, { userId: bob, resourceId, startsAt: `${day}T10:30:00.000Z` })), 400);
  assert.equal(status(() => createBooking(db, { userId: bob, resourceId, startsAt: `${day}T13:00:00.000Z` })), 400);
  assert.equal(status(() => createBooking(db, { userId: bob, resourceId: 999, startsAt })), 404);
  assert.equal(status(() => createBooking(db, { userId: bob, resourceId, startsAt: 'nope' })), 400);
  assert.equal(status(() => createBooking(db, { userId: bob, resourceId, startsAt: '2020-01-06T10:00:00.000Z' })), 400);
});

test('cancelling frees the slot and only the owner can cancel', () => {
  const { db, alice, bob, resourceId, day } = setup();
  const startsAt = `${day}T09:00:00.000Z`;
  const b = createBooking(db, { userId: alice, resourceId, startsAt });
  assert.equal(status(() => cancelBooking(db, { userId: bob, bookingId: b.id })), 404);
  cancelBooking(db, { userId: alice, bookingId: b.id });
  assert.equal(createBooking(db, { userId: bob, resourceId, startsAt }).status, 'confirmed');
});
