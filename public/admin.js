const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const listEl = document.getElementById('list');

async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  });
  if (res.status === 401) location.href = '/login.html';
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

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

function rangeRow(dayEl, start = 540, end = 1020) {
  const row = el('span', { class: 'range' },
    el('input', { type: 'time', value: toTime(start), required: '', 'aria-label': 'Opens' }),
    '–',
    el('input', { type: 'time', value: toTime(end), required: '', 'aria-label': 'Closes' }),
    el('button', { type: 'button', class: 'secondary', 'aria-label': 'Remove hours', onclick: () => row.remove() }, '✕'));
  dayEl.querySelector('.add').before(row);
}

function resourceCard(r) {
  const id = `r${r.id}`;
  const name = el('input', { id: `${id}-name`, value: r.name, required: '' });
  const desc = el('input', { id: `${id}-desc`, value: r.description });
  const slot = el('input', { id: `${id}-slot`, type: 'number', min: '5', max: '1440', value: r.slot_minutes, required: '' });
  const status = el('span', { class: 'status', role: 'status' });
  const error = el('p', { class: 'error', role: 'alert' });

  const days = el('div', { class: 'days' });
  DAYS.forEach((label, weekday) => {
    const dayEl = el('div', { class: 'day' }, el('strong', {}, label),
      el('button', { type: 'button', class: 'secondary add', onclick: () => rangeRow(dayEl) }, '+ Add hours'));
    r.availability.filter((a) => a.weekday === weekday).forEach((a) => rangeRow(dayEl, a.start_minute, a.end_minute));
    dayEl.dataset.weekday = weekday;
    days.append(dayEl);
  });

  const run = async (fn, okMsg) => {
    error.textContent = ''; status.textContent = '';
    try { await fn(); status.textContent = okMsg; } catch (e) { error.textContent = e.message; }
  };

  const save = () => run(async () => {
    const rules = [];
    for (const dayEl of days.children) {
      for (const range of dayEl.querySelectorAll('.range')) {
        const [a, b] = range.querySelectorAll('input');
        rules.push({ weekday: Number(dayEl.dataset.weekday), start_minute: toMinutes(a.value), end_minute: toMinutes(b.value) });
      }
    }
    await api('PATCH', `/admin/resources/${r.id}`, { name: name.value, description: desc.value, slot_minutes: Number(slot.value) });
    await api('PUT', `/admin/resources/${r.id}/availability`, { rules });
  }, 'Saved');

  const toggle = async () => { await api('PATCH', `/admin/resources/${r.id}`, { active: !r.active }); load(); };

  return el('section', { class: `panel${r.active ? '' : ' inactive'}` },
    el('h2', {}, r.name, r.active ? '' : el('span', { class: 'badge' }, 'Inactive')),
    el('div', { class: 'row' },
      el('label', {}, 'Name ', name), el('label', {}, 'Description ', desc), el('label', {}, 'Slot length (min) ', slot)),
    days, error,
    el('div', { class: 'actions' },
      el('button', { type: 'button', onclick: save }, 'Save'),
      el('button', { type: 'button', class: r.active ? 'danger' : 'secondary', onclick: () => run(toggle, '') }, r.active ? 'Deactivate' : 'Reactivate'),
      status));
}

async function load() {
  const resources = await api('GET', '/admin/resources');
  listEl.replaceChildren(...(resources.length
    ? resources.map(resourceCard)
    : [el('p', { class: 'hint' }, 'No resources yet. Add one above.')]));
}

document.getElementById('create').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('create-error');
  errorEl.textContent = '';
  try {
    await api('POST', '/admin/resources', {
      name: document.getElementById('new-name').value,
      description: document.getElementById('new-desc').value,
      slot_minutes: Number(document.getElementById('new-slot').value),
    });
    e.target.reset();
    await load();
  } catch (err) { errorEl.textContent = err.message; }
});

document.getElementById('logout').addEventListener('click', async () => {
  await api('POST', '/auth/logout');
  location.href = '/login.html';
});

(async () => {
  const me = await api('GET', '/auth/me');
  if (!me.is_admin) return (document.body.innerHTML = '<main class="card"><h1>Admins only</h1><p class="alt"><a href="/">Back home</a></p></main>');
  document.getElementById('who').textContent = me.email;
  load();
})();
