# Luas Bangun: Frontend Lab 8 Microservices

Frontend untuk dua microservice di faasd:

- **luas-persegi**: menerima panjang sisi, mengembalikan `s²`
- **luas-permukaan-kubus**: memanggil `luas-persegi`, lalu mengembalikan `6 × s²`

Frontend ini (Express + HTML/CSS/JS vanilla) di-deploy ke **Dokku**. Browser hanya memanggil
Express, lalu Express meneruskan request ke faasd. Dengan cara ini tidak ada masalah CORS atau
mixed content.

```
Browser ──► POST /api/persegi ──► Express (Dokku) ──► ${FAAS_URL}/function/luas-persegi
Browser ──► POST /api/kubus   ──► Express (Dokku) ──► ${FAAS_URL}/function/luas-permukaan-kubus
```

## Menjalankan di lokal

Butuh Node.js 22 atau lebih baru.

```bash
npm install
npm start                                            # mode MOCK (tanpa faasd)
FAAS_URL=http://<ip-faasd>:8080 npm start            # pakai faasd (Linux/macOS/Git Bash)
$env:FAAS_URL="http://<ip-faasd>:8080"; npm start    # pakai faasd (PowerShell)
```

Buka http://localhost:3000.

Jika `FAAS_URL` tidak diset, server berjalan dalam **mode MOCK**: hasil dihitung lokal agar UI
tetap bisa dikembangkan. UI menampilkan badge **MOCK MODE** dan respons API berisi `"source": "mock"`.

## Environment variables

| Var | Contoh | Keterangan |
|---|---|---|
| `FAAS_URL` | `http://<ip-faasd>:8080` | Base URL gateway faasd. Kosong berarti mode MOCK. |
| `PORT` | `3000` | Diset otomatis oleh Dokku. |

## API

| Method | Path | Body | Respons sukses |
|---|---|---|---|
| POST | `/api/persegi` | `{ "sisi": 5 }` | `{ "result": 25, "source": "faasd" }` |
| POST | `/api/kubus` | `{ "rusuk": 5 }` | `{ "result": 150, "luasSisi": 25, "source": "faasd" }` |
| GET | `/api/health` | – | `{ "faasUrlSet": true, "faasOnline": true }` |

- Input bukan angka atau `<= 0`: `400 { "error": "..." }`
- faasd tidak bisa dihubungi, timeout (5 detik), membalas non-2xx, atau field yang diharapkan
  tidak ada: `502 { "error": "Service offline" }`
- `luasSisi` pada kubus berasal dari service `luas-persegi` (bukti chain kubus ke persegi).
- Mode MOCK mengembalikan bentuk respons yang sama dengan `"source": "mock"`.

### Kontrak Express ke faasd

Semua request `POST` dengan `Content-Type: application/json`, respons JSON.

| Function | Request | Respons | Field yang dibaca |
|---|---|---|---|
| `luas-persegi` | `{ "sisi": 5 }` | `{ "sisi": 5, "luas": 25 }` | `luas` |
| `luas-permukaan-kubus` | `{ "rusuk": 5 }` | `{ "rusuk": 5, "luas_sisi": 25, "luas_permukaan": 150 }` | `luas_permukaan`, `luas_sisi` |

Tes faasd langsung:

```bash
curl -X POST http://<ip-faasd>:8080/function/luas-persegi \
  -H 'Content-Type: application/json' -d '{"sisi":5}'           # {"sisi":5,"luas":25}
curl -X POST http://<ip-faasd>:8080/function/luas-permukaan-kubus \
  -H 'Content-Type: application/json' -d '{"rusuk":5}'          # {"rusuk":5,"luas_sisi":25,"luas_permukaan":150}
```

## Deploy ke Dokku

Kode di-push ke GitHub, lalu server Dokku menarik dari GitHub.

```bash
# di laptop
git push origin main

# di server Dokku
sudo dokku apps:create luas-bangun                                   # sekali saja
sudo dokku config:set luas-bangun FAAS_URL=http://<ip-faasd>:8080
sudo dokku git:sync --build luas-bangun https://github.com/<user>/<repo>.git main
```

Update kode: push ke GitHub, lalu jalankan ulang `git:sync --build`.

Jika IP faasd berubah (tanpa build ulang):

```bash
sudo dokku config:set luas-bangun FAAS_URL=http://<ip-baru>:8080
```

Jika IP EC2 Dokku berubah:

```bash
sudo dokku domains:set-global <ip-baru>.sslip.io
sudo dokku domains:rebuild luas-bangun
```

URL app: `http://luas-bangun.<ip-ec2-dokku>.sslip.io`
