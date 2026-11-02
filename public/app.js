// Frontend Luas Bangun: tab, validasi input, dan pemanggilan API Express (/api/*).
// Browser tidak pernah memanggil faasd langsung; semua lewat Express.

const numberFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 });

const statusEl = document.getElementById('status');
const mockBanner = document.getElementById('mock-banner');

const STATUS_TEXT = {
  checking: 'Memeriksa service…',
  online: 'faasd online',
  offline: 'faasd offline',
  mock: 'MOCK MODE',
};

function setStatus(state) {
  statusEl.dataset.state = state;
  statusEl.querySelector('.status-text').textContent = STATUS_TEXT[state];
  mockBanner.hidden = state !== 'mock';
}

// Terima "5", "2.5", atau "2,5" (desimal koma). Kembalikan angka > 0 atau null.
function parseInput(raw) {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------- Indikator status service ----------

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (!data.faasUrlSet) setStatus('mock');
    else setStatus(data.faasOnline ? 'online' : 'offline');
  } catch {
    setStatus('offline');
  }
}

// ---------- Tabs (klik + panah kiri/kanan, Home, End) ----------

const tabs = Array.from(document.querySelectorAll('[role="tab"]'));

function activateTab(tab, focus = true) {
  tabs.forEach((t) => {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
  });
  if (focus) tab.focus();
}

tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => activateTab(tab));
  tab.addEventListener('keydown', (e) => {
    const keys = {
      ArrowRight: (i + 1) % tabs.length,
      ArrowLeft: (i - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    if (e.key in keys) {
      e.preventDefault();
      activateTab(tabs[keys[e.key]]);
    }
  });
});

// ---------- Panggil API Express ----------

async function requestHitung(endpoint, field, value) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ---------- Satu panel = satu menu ----------

function setupPanel(panel) {
  const { endpoint, field } = panel.dataset;
  const form = panel.querySelector('form');
  const input = form.querySelector('input');
  const fieldBox = form.querySelector('.field');
  const errorEl = form.querySelector('.error');
  const button = form.querySelector('.btn');
  const buttonLabel = button.querySelector('.btn-label');
  const idleLabel = buttonLabel.textContent;
  const screen = panel.querySelector('.screen');
  const route = panel.querySelector('.route');
  const out = {
    input: screen.querySelector('[data-out="input"]'),
    result: screen.querySelector('[data-out="result"]'),
    source: screen.querySelector('[data-out="source"]'),
    luasSisi: screen.querySelectorAll('[data-out="luasSisi"]'), // hanya ada di panel kubus
  };
  const nama = field === 'sisi' ? 'sisi' : 'rusuk';

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
    if (message) {
      fieldBox.dataset.invalid = '';
      input.setAttribute('aria-invalid', 'true');
    } else {
      delete fieldBox.dataset.invalid;
      input.removeAttribute('aria-invalid');
    }
  }

  function setBusy(busy) {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
    buttonLabel.textContent = busy ? 'Menghitung…' : idleLabel;
  }

  function showResult(value, { result, luasSisi, source }) {
    const formatted = numberFormat.format(result);
    out.input.textContent = numberFormat.format(value);
    // Kubus: luas sisi dari service luas-persegi, diteruskan apa adanya oleh service kubus
    out.luasSisi.forEach((el) => { el.textContent = numberFormat.format(luasSisi); });
    out.result.textContent = formatted;
    out.result.classList.toggle('is-long', formatted.length > 9 && formatted.length <= 14);
    out.result.classList.toggle('is-xlong', formatted.length > 14);
    out.source.textContent = source === 'faasd'
      ? 'Dihitung oleh faasd'
      : 'Mock: dihitung lokal oleh server, bukan faasd';

    screen.dataset.state = 'result';
    route.dataset.state = source === 'faasd' ? 'done' : 'mock';

    // Ulangi animasi glitch setiap ada hasil baru
    out.result.classList.remove('is-fresh');
    void out.result.offsetWidth;
    out.result.classList.add('is-fresh');
  }

  function showNoSignal(sourceText) {
    screen.dataset.state = 'error';
    route.dataset.state = 'error';
    out.source.textContent = sourceText;
  }

  input.addEventListener('input', () => {
    if (!errorEl.hidden) showError('');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validasi di frontend (backend juga memvalidasi ulang)
    const value = parseInput(input.value);
    if (value === null) {
      showError(`Masukkan panjang ${nama} berupa angka lebih dari 0.`);
      input.focus();
      return;
    }

    showError('');
    setBusy(true);
    screen.dataset.state = 'loading';
    route.dataset.state = 'loading';
    out.source.textContent = 'Menghubungi service…';

    try {
      const { ok, status, data } = await requestHitung(endpoint, field, value);

      if (ok) {
        showResult(value, data);
        if (data.source === 'faasd') setStatus('online');
      } else if (status === 400) {
        screen.dataset.state = 'idle';
        route.dataset.state = 'idle';
        out.source.textContent = '';
        showError(`Input ditolak server: ${data.error || 'angka tidak valid'}.`);
      } else {
        showNoSignal('Service faasd tidak menjawab');
        showError('Service faasd tidak bisa dihubungi. Pastikan faasd menyala dan FAAS_URL di server benar, lalu coba lagi.');
        setStatus('offline');
      }
    } catch {
      showNoSignal('Server frontend tidak menjawab');
      showError('Server frontend tidak bisa dihubungi. Periksa koneksi, lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  });
}

document.querySelectorAll('[role="tabpanel"]').forEach(setupPanel);
checkHealth();
