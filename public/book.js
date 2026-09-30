const $ = (id) => document.getElementById(id);
const resourceEl = $('resource'), dateEl = $('date'), slotsEl = $('slots'), errorEl = $('error'), mineEl = $('mine');
let resources = [];

async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  });
  if (res.status === 401) location.href = '/login.html';
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { status: res.status });
  return data;
}

const timeOf = (iso) => iso.slice(11, 16);
const dayOf = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

let slotsRequest = 0;
async function loadSlots() {
  const request = ++slotsRequest;
  $('desc').textContent = (resources.find((r) => String(r.id) === resourceEl.value) || {}).description || '';
  if (!resourceEl.value || !dateEl.value) return slotsEl.replaceChildren();
  const slots = await api('GET', `/resources/${resourceEl.value}/slots?date=${dateEl.value}`);
  if (request !== slotsRequest) return; // a newer load superseded this one
  const now = new Date().toISOString();
  slotsEl.replaceChildren(...(slots.length ? slots.map((s) => el('button', {
    type: 'button', title: s.taken ? 'Already booked' : '', ...((s.taken || s.starts_at <= now) && { disabled: '' }),
    onclick: () => book(s.starts_at),
  }, timeOf(s.starts_at))) : [el('p', { class: 'hint' }, 'Nothing available on this day.')]));
}

async function book(startsAt) {
  errorEl.textContent = '';
  try {
    await api('POST', '/bookings', { resourceId: Number(resourceEl.value), startsAt });
  } catch (e) {
    errorEl.textContent = e.message;
  }
  await Promise.all([loadSlots(), loadMine()]);
}

async function loadMine() {
  const bookings = await api('GET', '/bookings');
  const now = new Date().toISOString();
  mineEl.replaceChildren(...(bookings.length ? bookings.reverse().map((b) => {
    const label = `${b.resource_name} · ${dayOf(b.starts_at)} ${timeOf(b.starts_at)}–${timeOf(b.ends_at)}`;
    const canCancel = b.status === 'confirmed' && b.starts_at > now;
    return el('li', {},
      el('span', { class: b.status === 'cancelled' ? 'cancelled' : '' }, label, b.status === 'cancelled' ? el('span', { class: 'badge' }, 'Cancelled') : ''),
      canCancel ? el('button', { type: 'button', class: 'danger', onclick: async () => {
        await api('DELETE', `/bookings/${b.id}`); await Promise.all([loadSlots(), loadMine()]);
      } }, 'Cancel') : '');
  }) : [el('li', { class: 'hint' }, 'No bookings yet.')]));
}

resourceEl.addEventListener('change', loadSlots);
dateEl.addEventListener('change', loadSlots);
$('logout').addEventListener('click', async () => { await api('POST', '/auth/logout'); location.href = '/login.html'; });

(async () => {
  const me = await api('GET', '/auth/me');
  $('who').textContent = me.email;
  const today = new Date().toISOString().slice(0, 10);
  dateEl.value = today; dateEl.min = today;
  resources = await api('GET', '/resources');
  resourceEl.replaceChildren(...resources.map((r) => el('option', { value: r.id }, `${r.name} (${r.slot_minutes} min)`)));
  if (!resources.length) $('desc').textContent = 'No resources are available to book yet.';
  await Promise.all([loadSlots(), loadMine()]);
})();
