const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Base URL gateway faasd, tanpa trailing slash. Kosong = mode MOCK.
const FAAS_URL = (process.env.FAAS_URL || '').trim().replace(/\/+$/, '');
const MOCK = FAAS_URL === '';
const FAAS_TIMEOUT_MS = 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ubah input body menjadi angka valid (> 0, finite), atau null jika tidak valid.
function toPositiveNumber(value) {
  let n = NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Ambil satu field angka dari respons faasd secara eksplisit; gagal jika tidak ada / bukan number.
function readNumber(data, key, functionName, rawBody) {
  const value = data && data[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${functionName}: field "${key}" tidak valid. Body: ${rawBody.slice(0, 200)}`);
  }
  return value;
}

// Panggil satu function di faasd: POST body JSON, respons JSON, timeout 5 detik.
async function callFaas(functionName, payload) {
  const res = await fetch(`${FAAS_URL}/function/${functionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(FAAS_TIMEOUT_MS),
  });

  const rawBody = await res.text();
  if (!res.ok) {
    throw new Error(`${functionName} membalas HTTP ${res.status}. Body: ${rawBody.slice(0, 200)}`);
  }

  try {
    return { data: JSON.parse(rawBody), rawBody };
  } catch {
    throw new Error(`${functionName} membalas bukan JSON. Body: ${rawBody.slice(0, 200)}`);
  }
}

// Konfigurasi tiap menu:
// - mockFaas: meniru body respons faasd (dipakai saat mode MOCK)
// - pick: membaca field respons faasd -> bentuk respons untuk frontend
const SERVICES = {
  persegi: {
    field: 'sisi',
    functionName: 'luas-persegi',
    mockFaas: (sisi) => ({ sisi, luas: sisi * sisi }),
    pick: (data, raw) => ({
      result: readNumber(data, 'luas', 'luas-persegi', raw),
    }),
  },
  kubus: {
    field: 'rusuk',
    functionName: 'luas-permukaan-kubus',
    mockFaas: (rusuk) => ({ rusuk, luas_sisi: rusuk * rusuk, luas_permukaan: 6 * rusuk * rusuk }),
    pick: (data, raw) => ({
      result: readNumber(data, 'luas_permukaan', 'luas-permukaan-kubus', raw),
      // luas_sisi berasal dari service luas-persegi (bukti chain kubus -> persegi)
      luasSisi: readNumber(data, 'luas_sisi', 'luas-permukaan-kubus', raw),
    }),
  },
};

// Handler bersama: validasi -> panggil faasd (atau mock) -> baca field -> respons JSON.
async function handleHitung(req, res, service) {
  const value = toPositiveNumber(req.body && req.body[service.field]);
  if (value === null) {
    return res.status(400).json({ error: `"${service.field}" harus berupa angka lebih dari 0` });
  }

  if (MOCK) {
    const data = service.mockFaas(value);
    return res.json({ ...service.pick(data, JSON.stringify(data)), source: 'mock' });
  }

  try {
    const { data, rawBody } = await callFaas(service.functionName, { [service.field]: value });
    return res.json({ ...service.pick(data, rawBody), source: 'faasd' });
  } catch (err) {
    console.error(`[faasd] ${service.functionName} gagal:`, err.message);
    return res.status(502).json({ error: 'Service offline' });
  }
}

// Menu 1: luas persegi -> function luas-persegi
app.post('/api/persegi', (req, res) => handleHitung(req, res, SERVICES.persegi));

// Menu 2: luas permukaan kubus -> function luas-permukaan-kubus (memanggil luas-persegi)
app.post('/api/kubus', (req, res) => handleHitung(req, res, SERVICES.kubus));

// Status untuk indikator UI. IP faasd tidak pernah dikirim ke client.
app.get('/api/health', async (req, res) => {
  if (MOCK) return res.json({ faasUrlSet: false, faasOnline: null });

  let faasOnline = false;
  try {
    // Gateway faasd menyediakan /healthz; respons apa pun berarti gateway bisa dihubungi.
    await fetch(`${FAAS_URL}/healthz`, { signal: AbortSignal.timeout(3000) });
    faasOnline = true;
  } catch {
    faasOnline = false;
  }
  res.json({ faasUrlSet: true, faasOnline });
});

// Body JSON rusak -> 400 dalam format JSON, bukan halaman HTML bawaan Express.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Body harus berupa JSON yang valid' });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Luas Bangun berjalan di http://localhost:${PORT}`);
  console.log(MOCK ? 'Mode MOCK: FAAS_URL belum diset, hasil dihitung lokal.' : 'Mode faasd: FAAS_URL sudah diset.');
});
