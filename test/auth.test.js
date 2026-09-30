const test = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

async function setup() {
  const server = createApp(openDb(':memory:')).listen(0);
  const base = `http://localhost:${server.address().port}/api/auth`;
  let cookie = '';
  const call = async (path, body, method = body ? 'POST' : 'GET') => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
      body: body && JSON.stringify(body),
    });
    const set = res.headers.getSetCookie()[0];
    if (set) cookie = set.split(';')[0];
    return { res, json: res.status === 204 ? null : await res.json() };
  };
  return { server, call, clearCookie: () => (cookie = '') };
}

const user = { email: 'a@b.co', name: 'Ann', password: 'password123' };

test('signup, me, logout, login flow', async () => {
  const { server, call, clearCookie } = await setup();
  try {
    let r = await call('/signup', user);
    assert.equal(r.res.status, 201);
    assert.equal(r.json.password_hash, undefined);
    assert.equal((await call('/me')).json.email, 'a@b.co');

    assert.equal((await call('/logout', {})).res.status, 204);
    assert.equal((await call('/me')).res.status, 401);
    clearCookie();

    assert.equal((await call('/login', { ...user, password: 'wrongpass1' })).res.status, 401);
    assert.equal((await call('/login', { email: 'A@B.CO', password: user.password })).res.status, 200);
    assert.equal((await call('/me')).res.status, 200);
  } finally { server.close(); }
});

test('rejects duplicates and bad input', async () => {
  const { server, call } = await setup();
  try {
    await call('/signup', user);
    assert.equal((await call('/signup', { ...user, email: 'A@b.co' })).res.status, 409);
    assert.equal((await call('/signup', { ...user, email: 'nope' })).res.status, 400);
    assert.equal((await call('/signup', { ...user, email: 'x@y.co', password: 'short' })).res.status, 400);
    assert.equal((await call('/login', { email: 'ghost@y.co', password: 'password123' })).res.status, 401);
  } finally { server.close(); }
});
