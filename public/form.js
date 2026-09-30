const form = document.querySelector('form');
const errorEl = document.querySelector('.error');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('button');
  btn.disabled = true;
  errorEl.textContent = '';
  try {
    const res = await fetch(form.action, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    if (res.ok) return (location.href = '/');
    errorEl.textContent = (await res.json()).error || 'Something went wrong';
  } catch {
    errorEl.textContent = 'Network error, please try again';
  }
  btn.disabled = false;
});
