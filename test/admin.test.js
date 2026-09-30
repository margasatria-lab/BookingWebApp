const test = require('node:test');
const assert = require('node:assert');
const { openDb, promoteAdmins } = require('../src/db');
const { createApp } = require('../src/app');

process.env.ADMIN_EMAILS = 'boss@x.co, Other@x.co';

async function setup() {
  const db = openDb(':memory:');
  const server = createApp(db).listen(0);
  const base = `http://localhost:${server.address().port}/api`;
  const client = () => {
    let cookie = '';
    return async (method, path, body) => {
      const res = await fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
        body: body && JSON.stringify(body),
      });
      const set = res.headers.getSetCookie()[0];
      if (set) cookie = set.split(';')[0];
      return { status: res.status, json: res.status === 204 ? null : await res.json() };
    };
  };
  return { db, server, client };
}
const signup = (c, email) => c('POST', '/auth/signup', { email, name: 'N', password: 'password123' });

test('only ADMIN_EMAILS signups become admins; others get 403', async () => {
  const { server, client } = await setup();
  try {
    const admin = client(), user = client(), anon = client();
    assert.equal((await signup(admin, 'BOSS@x.co')).json.is_admin, true);
    assert.equal((await signup(user, 'joe@x.co')).json.is_admin, false);
    assert.equal((await user('GET', '/admin/resources')).status, 403);
    assert.equal((await anon('GET', '/admin/resources')).status, 401);
    assert.equal((await admin('GET', '/auth/me')).json.is_admin, true);
  } finally { server.close(); }
});

test('promoteAdmins upgrades accounts that existed before ADMIN_EMAILS listed them', async () => {
  const { db, server, client } = await setup();
  try {
    const c = client();
    await signup(c, 'late@x.co');
    assert.equal((await c('GET', '/auth/me')).json.is_admin, false);
    process.env.ADMIN_EMAILS = 'late@x.co';
    promoteAdmins(db);
    assert.equal((await c('GET', '/auth/me')).json.is_admin, true);
  } finally { process.env.ADMIN_EMAILS = 'boss@x.co, Other@x.co'; server.close(); }
});

test('admin manages resources and availability, which feed public slots', async () => {
  const { server, client } = await setup();
  try {
    const admin = client(), user = client();
    await signup(admin, 'boss@x.co');
    await signup(user, 'joe@x.co');

    assert.equal((await admin('POST', '/admin/resources', { name: '', slot_minutes: 30 })).status, 400);
    assert.equal((await admin('POST', '/admin/resources', { name: 'Court', slot_minutes: 2 })).status, 400);
    const created = await admin('POST', '/admin/resources', { name: 'Court', description: 'Indoor', slot_minutes: 30 });
    assert.equal(created.status, 201);
    const id = created.json.id;

    assert.equal((await admin('PUT', `/admin/resources/${id}/availability`, { rules: [{ weekday: 1, start_minute: 600, end_minute: 500 }] })).status, 400);
    assert.equal((await admin('PUT', `/admin/resources/${id}/availability`, { rules: [
      { weekday: 1, start_minute: 540, end_minute: 660 }, { weekday: 1, start_minute: 600, end_minute: 720 }] })).status, 400);
    const put = await admin('PUT', `/admin/resources/${id}/availability`, { rules: [{ weekday: 1, start_minute: 540, end_minute: 600 }] });
    assert.equal(put.json.availability.length, 1);

    assert.equal((await user('GET', '/resources')).json.length, 1);
    assert.equal((await admin('PATCH', `/admin/resources/${id}`, { name: 'Court A', slot_minutes: 60 })).json.name, 'Court A');
    assert.equal((await admin('PATCH', `/admin/resources/${id}`, { active: 'no' })).status, 400);
    assert.equal((await admin('PATCH', '/admin/resources/999', { name: 'x' })).status, 404);

    assert.equal((await admin('DELETE', `/admin/resources/${id}`)).status, 204);
    assert.equal((await user('GET', '/resources')).json.length, 0);
    assert.equal((await admin('GET', '/admin/resources')).json[0].active, false);
  } finally { server.close(); }
});
