const express = require('express');
const { requireAuth } = require('./auth');

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

class BookingError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// All slots of `resource` on the UTC date `dateStr` (YYYY-MM-DD), each with a `taken` flag.
function slotsForDate(db, resource, dateStr) {
  const dayStart = Date.parse(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(dayStart)) throw new BookingError(400, 'date must be YYYY-MM-DD');
  const weekday = new Date(dayStart).getUTCDay();
  const rules = db.prepare('SELECT start_minute, end_minute FROM availability_rules WHERE resource_id = ? AND weekday = ?')
    .all(resource.id, weekday);
  const taken = new Set(db.prepare(
    "SELECT starts_at FROM bookings WHERE resource_id = ? AND status = 'confirmed' AND starts_at >= ? AND starts_at < ?"
  ).all(resource.id, new Date(dayStart).toISOString(), new Date(dayStart + DAY).toISOString()).map(r => r.starts_at));

  const slots = [];
  for (const { start_minute, end_minute } of rules) {
    for (let m = start_minute; m + resource.slot_minutes <= end_minute; m += resource.slot_minutes) {
      const starts_at = new Date(dayStart + m * MIN).toISOString();
      slots.push({ starts_at, ends_at: new Date(dayStart + (m + resource.slot_minutes) * MIN).toISOString(), taken: taken.has(starts_at) });
    }
  }
  return slots.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

function createBooking(db, { userId, resourceId, startsAt }) {
  const resource = db.prepare('SELECT * FROM resources WHERE id = ? AND active = 1').get(resourceId);
  if (!resource) throw new BookingError(404, 'Resource not found');
  const t = typeof startsAt === 'string' ? Date.parse(startsAt) : NaN;
  if (Number.isNaN(t)) throw new BookingError(400, 'startsAt must be an ISO date-time');
  const starts_at = new Date(t).toISOString();
  if (t <= Date.now()) throw new BookingError(400, 'Cannot book a time in the past');

  const slot = slotsForDate(db, resource, starts_at.slice(0, 10)).find(s => s.starts_at === starts_at);
  if (!slot) throw new BookingError(400, 'That time is not an available slot');
  try {
    const info = db.prepare('INSERT INTO bookings (resource_id, user_id, starts_at, ends_at) VALUES (?, ?, ?, ?)')
      .run(resource.id, userId, slot.starts_at, slot.ends_at);
    return { id: Number(info.lastInsertRowid), resource_id: resource.id, starts_at: slot.starts_at, ends_at: slot.ends_at, status: 'confirmed' };
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new BookingError(409, 'That slot is already booked');
    throw e;
  }
}

function cancelBooking(db, { userId, bookingId }) {
  const info = db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'confirmed'")
    .run(bookingId, userId);
  if (!info.changes) throw new BookingError(404, 'Booking not found');
}

function bookingRouter(db) {
  const router = express.Router();
  const guard = requireAuth(db);
  const wrap = (fn) => (req, res, next) => {
    try { fn(req, res); } catch (e) {
      if (e instanceof BookingError) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  };

  router.get('/resources', wrap((req, res) => {
    res.json(db.prepare('SELECT id, name, description, slot_minutes FROM resources WHERE active = 1 ORDER BY name').all());
  }));

  router.get('/resources/:id/slots', wrap((req, res) => {
    const resource = db.prepare('SELECT * FROM resources WHERE id = ? AND active = 1').get(req.params.id);
    if (!resource) throw new BookingError(404, 'Resource not found');
    res.json(slotsForDate(db, resource, String(req.query.date || '')));
  }));

  router.post('/bookings', guard, wrap((req, res) => {
    const { resourceId, startsAt } = req.body || {};
    res.status(201).json(createBooking(db, { userId: req.user.id, resourceId, startsAt }));
  }));

  router.get('/bookings', guard, wrap((req, res) => {
    res.json(db.prepare(`
      SELECT b.id, b.resource_id, r.name AS resource_name, b.starts_at, b.ends_at, b.status
      FROM bookings b JOIN resources r ON r.id = b.resource_id
      WHERE b.user_id = ? ORDER BY b.starts_at`).all(req.user.id));
  }));

  router.delete('/bookings/:id', guard, wrap((req, res) => {
    cancelBooking(db, { userId: req.user.id, bookingId: req.params.id });
    res.status(204).end();
  }));

  return router;
}

module.exports = { bookingRouter, createBooking, cancelBooking, slotsForDate, BookingError };
