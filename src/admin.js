const express = require('express');
const { requireAdmin } = require('./auth');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function parseResource(body, { partial = false } = {}) {
  const out = {};
  const { name, description, slot_minutes, active } = body || {};
  if (name !== undefined || !partial) {
    if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'Name required');
    out.name = name.trim();
  }
  if (description !== undefined) {
    if (typeof description !== 'string') throw new HttpError(400, 'Description must be text');
    out.description = description.trim();
  }
  if (slot_minutes !== undefined || !partial) {
    if (!Number.isInteger(slot_minutes) || slot_minutes < 5 || slot_minutes > 1440) {
      throw new HttpError(400, 'slot_minutes must be a whole number from 5 to 1440');
    }
    out.slot_minutes = slot_minutes;
  }
  if (active !== undefined) {
    if (typeof active !== 'boolean') throw new HttpError(400, 'active must be true or false');
    out.active = active ? 1 : 0;
  }
  return out;
}

function parseRules(body) {
  const rules = body && body.rules;
  if (!Array.isArray(rules)) throw new HttpError(400, 'rules must be an array');
  const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
  for (const r of rules) {
    if (!r || !isInt(r.weekday, 0, 6) || !isInt(r.start_minute, 0, 1439) || !isInt(r.end_minute, 1, 1440) || r.end_minute <= r.start_minute) {
      throw new HttpError(400, 'Each rule needs weekday 0-6, start_minute 0-1439 and end_minute after start (max 1440)');
    }
  }
  // Overlapping hours on the same day would produce duplicate slots.
  const byDay = {};
  for (const r of rules) (byDay[r.weekday] ||= []).push(r);
  for (const day of Object.values(byDay)) {
    day.sort((a, b) => a.start_minute - b.start_minute);
    for (let i = 1; i < day.length; i++) {
      if (day[i].start_minute < day[i - 1].end_minute) throw new HttpError(400, 'Availability rules on the same weekday must not overlap');
    }
  }
  return rules;
}

function adminRouter(db) {
  const router = express.Router();
  router.use(requireAdmin(db));
  const wrap = (fn) => (req, res, next) => {
    try { fn(req, res); } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  };
  const getResource = (id) => {
    const r = db.prepare('SELECT * FROM resources WHERE id = ?').get(id);
    if (!r) throw new HttpError(404, 'Resource not found');
    return r;
  };
  const withRules = (r) => ({
    ...r, active: !!r.active,
    availability: db.prepare('SELECT weekday, start_minute, end_minute FROM availability_rules WHERE resource_id = ? ORDER BY weekday, start_minute').all(r.id),
  });

  router.get('/resources', wrap((req, res) => {
    res.json(db.prepare('SELECT * FROM resources ORDER BY name').all().map(withRules));
  }));

  router.post('/resources', wrap((req, res) => {
    const r = parseResource(req.body);
    const info = db.prepare('INSERT INTO resources (name, description, slot_minutes) VALUES (?, ?, ?)')
      .run(r.name, r.description || '', r.slot_minutes);
    res.status(201).json(withRules(getResource(info.lastInsertRowid)));
  }));

  router.patch('/resources/:id', wrap((req, res) => {
    const current = getResource(req.params.id);
    const changes = parseResource(req.body, { partial: true });
    const next = { ...current, ...changes };
    db.prepare('UPDATE resources SET name = ?, description = ?, slot_minutes = ?, active = ? WHERE id = ?')
      .run(next.name, next.description, next.slot_minutes, next.active, current.id);
    res.json(withRules(getResource(current.id)));
  }));

  // Deactivates rather than deletes, so existing bookings keep their resource.
  router.delete('/resources/:id', wrap((req, res) => {
    db.prepare('UPDATE resources SET active = 0 WHERE id = ?').run(getResource(req.params.id).id);
    res.status(204).end();
  }));

  // Replaces the whole weekly schedule. Existing bookings are left alone.
  router.put('/resources/:id/availability', wrap((req, res) => {
    const resource = getResource(req.params.id);
    const rules = parseRules(req.body);
    db.transaction(() => {
      db.prepare('DELETE FROM availability_rules WHERE resource_id = ?').run(resource.id);
      const ins = db.prepare('INSERT INTO availability_rules (resource_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, ?)');
      for (const r of rules) ins.run(resource.id, r.weekday, r.start_minute, r.end_minute);
    })();
    res.json(withRules(resource));
  }));

  return router;
}

module.exports = { adminRouter };
