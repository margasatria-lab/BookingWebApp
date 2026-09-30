const crypto = require('crypto');
const bcrypt = require('bcrypt');
const express = require('express');
const { adminEmails } = require('./db');

const COOKIE = 'sid';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function authRouter(db) {
  const router = express.Router();

  const cookieOpts = () => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MS,
  });

  function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), userId, Date.now() + SESSION_MS);
    res.cookie(COOKIE, token, cookieOpts());
  }

  const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, is_admin: !!u.is_admin });

  router.post('/signup', async (req, res) => {
    const { email, name, password } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Valid email required' });
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Name required' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: 'Password must be 8-72 characters' });
    }
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    try {
      const isAdmin = adminEmails().includes(email.trim().toLowerCase()) ? 1 : 0;
      const info = db.prepare('INSERT INTO users (email, name, password_hash, is_admin) VALUES (?, ?, ?, ?)')
        .run(email.trim(), name.trim(), hash, isAdmin);
      startSession(res, info.lastInsertRowid);
      res.status(201).json({ id: info.lastInsertRowid, email: email.trim(), name: name.trim(), is_admin: !!isAdmin });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Email already registered' });
      throw e;
    }
  });

  // Compared against when the email is unknown, so timing doesn't reveal which emails exist.
  const dummyHash = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

  router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());
    const ok = await bcrypt.compare(password, user ? user.password_hash : dummyHash);
    if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password' });
    startSession(res, user.id);
    res.json(publicUser(user));
  });

  router.post('/logout', (req, res) => {
    const token = req.cookies[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });
    res.status(204).end();
  });

  router.get('/me', requireAuth(db), (req, res) => res.json(publicUser(req.user)));

  return router;
}

// Loads req.user from the session cookie or responds 401.
function requireAuth(db) {
  return (req, res, next) => {
    const token = req.cookies[COOKIE];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const row = db.prepare(`
      SELECT u.id, u.email, u.name, u.is_admin, s.expires_at FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(hashToken(token));
    if (!row || row.expires_at < Date.now()) {
      if (row) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
      return res.status(401).json({ error: 'Not authenticated' });
    }
    req.user = row;
    next();
  };
}

function requireAdmin(db) {
  const auth = requireAuth(db);
  return (req, res, next) => auth(req, res, () => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Admin only' });
    next();
  });
}

module.exports = { authRouter, requireAuth, requireAdmin };
