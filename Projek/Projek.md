# Projek.md — Catatan Induk Sistem

> **Prinsip dokumen ini**: hanya memuat fakta yang bisa diverifikasi langsung
> dari kode/repo/percakapan kerja nyata — bukan asumsi atau tebakan. Setiap
> klaim yang tidak bisa diverifikasi ditandai eksplisit
> `[PERLU VALIDASI PENELITI]` atau `[TIDAK DITEMUKAN DI CODEBASE]`. Dokumen ini
> dimaksudkan untuk terus di-update setiap ada progres baru — jangan biarkan
> basi seperti catatan lama di `Catatan Komputasi/` (lihat Bagian 11).
>
> **Terakhir diverifikasi:** 2026-08-12, sesi kerja bersama Claude (lihat
> Bagian 10 untuk riwayat perbaikan yang mendasari status hari ini).

---

## 1. Identitas & Kepemilikan Proyek

- **Judul skripsi (resmi, dari `Skripsi.pdf`):** "Komputasi Hisab Prediksi Awal
  Ramadan Berbasis Data Ephemeris NASA JPL Horizons Menggunakan Algoritma
  Newton-Raphson"
- **Judul Inggris:** "Computational Hisab for Predicting the Start of Ramadan
  Based on NASA JPL Horizons Ephemeris Data Using the Newton-Raphson
  Algorithm"
- **Penulis:** Muhammad Reinaldy Santoso Alaratte — NIM 202210715004
- **Program studi:** Informatika / Ilmu Komputer
- **Institusi:** Fakultas Ilmu Komputer, Universitas Bhayangkara Jakarta Raya
- **Lokasi acuan lokal (Wujudul Hilal):** Kota Bekasi, Jawa Barat
  (lat -6.2349, lon 107.0000 — default di `konjungsi-periode/route.ts`)
- **Tanggal lulus ujian tugas akhir (dari `Skripsi.pdf`):** 23 Juli 2026
- **Periode data pengujian skripsi:** 2017–2026 (Ramadan 1438 H – 1447 H)
- **Nama proyek (package.json):** `international-astronomical-studies`
- **Repositori GitHub (tujuan, untuk dipakai ke depan):**
  https://github.com/mreinaldyalt/IAST.git
  — *catatan: remote git lokal saat ini belum diset (`git remote -v` kosong per
  2026-08-12); ini alamat target yang akan dipakai, belum tersambung.*
- **Branch kerja aktif saat ini:** `fix/restore-ui-and-core-bugs`

---

## 2. Latar Belakang & Tujuan

Dari `Skripsi.pdf` (Bab I) dan `Catatan Komputasi/00_RINGKASAN_SISTEM.md`:

- **Masalah yang diangkat:** penentuan awal Ramadan sering disampaikan sebagai
  tanggal akhir tanpa menunjukkan proses astronomis yang menghasilkannya —
  minim alur yang bisa ditelusuri (*traceable*).
- **Tujuan sistem:** menyediakan alat bantu komputasi hisab berbasis data
  ephemeris terverifikasi (NASA/JPL Horizons), menghasilkan prediksi awal
  Ramadan secara komputasi dengan jejak numerik lengkap (bukan kotak hitam),
  dan bukan sebagai otoritas penetapan hukum awal Ramadan.
- **Pendekatan penelitian:** Data Sains non-implementatif analitik dengan
  kerangka **CRISP-DM** (lihat Bagian 6).
- **Cakupan data pengujian skripsi:** 29.216 nilai bujur ekliptika geosentris
  Bulan dan Matahari, diperoleh pada 14.608 titik waktu (epoch) selama
  2017–2026, plus data parameter astronomi pasca-konjungsi untuk Kota Bekasi.
- **Posisi terhadap otoritas keagamaan:** sistem eksplisit memposisikan diri
  sebagai alat bantu komputasi/riset, bukan pengganti Sidang Isbat atau
  otoritas keagamaan resmi manapun. `[PERLU VALIDASI PENELITI]` — kalimat ini
  perlu dikonfirmasi ulang kata-per-katanya di naskah skripsi final.

---

## 3. Arsitektur Teknis (Framework, Mesin, Library)

Diverifikasi langsung dari `package.json` per 2026-08-12:

| Kategori | Teknologi | Versi |
|---|---|---|
| Framework web | Next.js (App Router, API routes) | ^16.1.6 |
| UI | React + React DOM | ^19.2.4 |
| Bahasa | TypeScript | ^5.9.3 |
| Styling | Tailwind CSS | ^4.2.1 |
| Testing | Vitest | ^4.0.18 |
| Tanggal/waktu/zona waktu | Luxon | ^3.7.2 |
| Sunset/sunrise | SunCalc | ^1.9.0 |
| Zona waktu dari koordinat | tz-lookup | ^6.1.25 |
| Peta lokasi (UI) | Leaflet | ^1.9.4 |
| Render 3D Tata Surya | Three.js + @react-three/fiber + @react-three/drei | ^0.185.1 / ^9.7.0 / ^10.7.8 |
| Model 3D (viewer) | @google/model-viewer | ^4.1.0 |
| Propagasi orbit satelit | satellite.js | 6.0.2 (**dikunci ke versi ini** — 7.x memicu Turbopack hang saat build, lihat Bagian 10) |
| Visualisasi langit | Stellarium Web Engine (WASM, AGPL) — divendor di `public/vendor/stellarium/` | — |
| Package manager | pnpm (`pnpm-lock.yaml`, `pnpm-workspace.yaml`) | — |
| Node minimum | `engines.node` | >=20.0.0 |

**Sumber data astronomi utama:** NASA/JPL Horizons API
(`https://ssd.jpl.nasa.gov/api/horizons.api`) — publik, gratis, **tanpa API
key** (dikonfirmasi langsung dari dokumentasi resmi mereka; API key
`api.nasa.gov`/`api.data.gov` adalah sistem **terpisah total**, tidak berlaku
untuk Horizons). Client HORIZONS punya mode `live` (default) dan `mock`
(offline, dikontrol env `HORIZONS_MODE`).

**Env var yang dikenal sistem** (dari `.env.local` lokal, bukan di-commit):
- `HORIZONS_MODE` — `live` atau `mock`.
- `ADMIN_HISTORY_SECRET` — secret untuk endpoint admin
  `/api/admin/official-history` (fail-closed kalau tidak diset).

---

## 4. Struktur Kode (peta lokasi, terverifikasi langsung dari direktori)

```
src/app/                    Halaman UI (App Router) + API routes
  ├── page.tsx                  Dasbor utama (daftar 9 modul, lihat Bagian 5)
  ├── prediksi-ramadan/          Menu "Prediksi Ramadan" (mode KHGT global)
  ├── evaluasi-konjungsi/        Menu "Evaluasi Konjungsi" (scan periode + academic data policy)
  ├── evaluasi/                  Menu "Evaluasi Riwayat" (KHGT vs Lokal vs Resmi pemerintah)
  ├── astronomy-event/           Menu "Kalender Astronomi" (kalender gabungan semua kategori)
  ├── parade-planet/             Menu "Parade Planet"
  ├── gerhana/                   Menu "Gerhana" (matahari & bulan)
  ├── solar-system/               Menu "Tata Surya" (visualisasi 3D)
  ├── stellarium/                 Menu "Stellarium View"
  ├── about/                      Halaman "Tentang Sistem"
  └── api/                        14 route.ts — lihat Bagian 5 per fitur

src/lib/                    Inti komputasi & utilitas
  ├── horizonsClient.ts          Client HTTP HORIZONS: cache, retry, circuit breaker, mock fallback
  ├── horizonsQueries.ts         Builder query Matahari/Bulan (eclLon, RA/Dec, topo Alt/Az)
  ├── precessionNutation.ts      [BARU 2026-08-12] Reduksi VECTORS->apparent (presesi/nutasi/topocentric)
  ├── newMoonNR.ts                Newton-Raphson pencari waktu konjungsi
  ├── ramadanFromSyaban.ts        Pipeline Wujudul Hilal lokal (Bekasi)
  ├── wujudulHilalRule.ts         Rule A/B Wujudul Hilal
  ├── khgtPipeline.ts              Pipeline KHGT global (grid saksi, PKG1/PKG2)
  ├── khgtRule.ts                  Ambang KHGT (alt>=5°, elong>=8°)
  ├── geoCalc.ts                   GMST/LST/geocentric alt/elongation
  ├── sunset.ts                    Sunset + NZ fajar (dipakai PKG2)
  ├── mathAngle.ts                  Util derajat/radian/wrap sudut
  ├── evaluation.ts                 Evaluasi vs ground truth
  ├── astronomyEvents.ts            Katalog statis event terverifikasi (RAMADAN_CYCLES, ECLIPSE_EVENTS, PARADE_EVENTS)
  ├── auditFormulas.ts               Formula untuk panel audit UI
  ├── i18n.ts                        Terjemahan ID/EN
  ├── parade/                       Pipeline Parade Planet (5 file — lihat Bagian 5.4)
  ├── eclipse/                      Pipeline Gerhana (geometry, VECTORS fetch, pipeline)
  ├── solar-system/                 Ephemeris & elemen orbital untuk visualisasi 3D
  ├── skyOverlay/                   Overlay bintang/konstelasi/DSO/satelit di Stellarium
  └── officialHistory/               [BARU, belum ada di catatan lama] Penyimpanan tanggal resmi pemerintah per negara (lihat Bagian 5.3)

data/                       anchors (sudah dihapus, lihat Bagian 10), ground_truth, mock_horizons/
public/data/                stars.json, constellations.json, dso.json, satellites.json (sky overlay)
scripts/                    generator data, validator (lihat Bagian 5.6)
Catatan Komputasi/          Catatan lama per-topik (SEBAGIAN BESAR SUDAH BASI — lihat Bagian 11)
Google Colab/                Notebook Python paralel (lihat Bagian 5.7)
evaluasi.xlsx, Skripsi.pdf  Ground-truth hasil tervalidasi (dipakai sebagai referensi kebenaran 2017-2026)
```

---

## 5. Fitur yang Sudah Diimplementasikan (per 2026-08-12)

Dasbor (`src/app/page.tsx`) mendaftar 9 modul: Kalender Astronomi, Parade
Planet, Gerhana, Prediksi Ramadan, Evaluasi Konjungsi, Evaluasi Riwayat,
Stellarium View, Tata Surya, Tentang Sistem.

### 5.1 Prediksi Ramadan (`/prediksi-ramadan`, API `/api/predict`)
- Menghitung **1 Ramadan & 1 Syawal** untuk tahun Masehi manapun (1972–2100)
  memakai kriteria **KHGT Muhammadiyah** (global): saksi grid ~90 titik darat
  dunia, geocentric altitude Bulan ≥5°, elongasi ≥8° saat maghrib sebelum
  tengah malam UTC (PKG1), atau — bila gagal — konjungsi harus sebelum fajar
  Selandia Baru lalu scan titik Amerika setelah tengah malam UTC (PKG2); bila
  keduanya gagal → istikmal (D+2).
- Route `/api/predict` sebenarnya punya **dua mode**: mode lokal (Wujudul
  Hilal, aktif kalau `lat`/`lon`/`tz` dikirim di query string) dan mode global
  KHGT (default, dipakai oleh halaman ini karena tidak mengirim lat/lon).
  **Halaman UI ini secara khusus memakai mode KHGT**, bukan Wujudul Hilal.
- Menampilkan lokasi saksi terbaik (peta read-only Leaflet), detail PKG,
  tombol buka Stellarium pada waktu maghrib saksi tersebut.
- Peringatan data mock/estimasi (lihat Bagian 5.9) muncul otomatis kalau
  >5% kueri NASA gagal saat komputasi berjalan.

### 5.2 Evaluasi Konjungsi (`/evaluasi-konjungsi`, API `/api/konjungsi-periode`
   dan `/api/audit/konjungsi-periode`)
- Pemindaian dua fase: **Fase 1** (cepat) — semua konjungsi dalam rentang
  tahun + klasifikasi kandidat awal Ramadan; **Fase 2** (on-demand) —
  pengayaan penuh (bujur ekliptika, RA/Dec, Alt/Az topocentric, KHGT,
  Wujudul Hilal) per baris.
- **Kebijakan data akademik eksplisit**: Fase 2 **menolak** menulis data
  mock/fallback ke kolom akademik — kalau HORIZONS gagal, kolom tetap `null`
  dan sistem menandai `usedMock`/`mockRequestCount`/`phase1AcademicWarning`
  secara jujur. Ini pola paling ketat di seluruh sistem soal kejujuran data.

### 5.3 Evaluasi Riwayat (`/evaluasi`, API `/api/evaluate` dan
   `/api/audit/history-comparison`)
- Membandingkan **tiga variabel independen** per tahun: (A) tanggal KHGT
  global, (B) tanggal lokal Wujudul Hilal (lokasi bisa dipilih via peta/city
  search), (C) tanggal resmi pemerintah (`officialHistory/` — saat ini hanya
  Indonesia/Kemenag yang terisi, lihat `providers/indonesia.ts`).
- Kolom "resmi" **hanya** diisi kalau statusnya `verified` dari sumber
  terdaftar — tanggal prediksi tidak pernah ditulis ke kolom itu (disclaimer
  eksplisit di response API).
- Tab "Audit & Jejak Perhitungan" (`HistoryAuditPanel.tsx`) menampilkan jejak
  iterasi Newton-Raphson penuh + export CSV/JSON untuk lampiran Bab IV.
- Sejak 2026-08-12: baris dengan `dataSource` bukan `live` ditandai (‡) +
  banner peringatan (lihat Bagian 5.9).

### 5.4 Parade Planet (`/parade-planet`, API `/api/parade`,
   `src/lib/parade/*`)
- Definisi operasional sendiri (bukan istilah IAU baku) — lihat
  `Catatan Komputasi/PARADE_PLANET.md` untuk rumus lengkap (GMST/LST/Hour
  Angle/Alt-Az, kriteria visibilitas per planet, klasifikasi optik
  mata-telanjang vs butuh-alat, algoritma span bujur ekliptika).
- `annualCandidate.ts` memindai satu tahun penuh (5 hari per sampel) untuk
  mendeteksi kandidat parade 4/5/6/7 planet secara otomatis — **bukan cuma
  daftar statis**. Tanggal 2026-08-12 (Parade 6 Planet) adalah entri yang
  sudah diverifikasi lewat komputasi, dijadikan patokan kebenaran.
- `paradePipeline.ts` menghitung verifikasi penuh (topocentric) untuk satu
  tanggal spesifik, dengan lokasi terbaik global + opsional lokasi user.

### 5.5 Gerhana (`/gerhana`, API `/api/eclipse`, `src/lib/eclipse/*`)
- Menghitung gerhana Matahari & Bulan dari **state VECTORS** (posisi 3D
  Matahari/Bulan, terkoreksi cahaya+aberasi) + geometri bayangan sendiri
  (`geometry.ts`) — **tidak** memakai Observer Table NASA sama sekali.
  Ini pendekatan yang sudah ada SEBELUM migrasi VECTORS untuk fitur lain
  hari ini (lihat Bagian 10) — kemungkinan alasan kenapa fitur ini paling
  jarang gagal dibanding fitur lain selama insiden kemarin.
- Prinsip eksplisit: **tidak memakai data simulasi pengganti** — kalau NASA
  gagal, hasil tidak dibuat sama sekali (bukan menampilkan tebakan).

### 5.6 Stellarium View (`/stellarium`, API `/api/sky`)
- Engine Stellarium Web (WASM) untuk visualisasi langit interaktif.
- Overlay kustom (`src/lib/skyOverlay/`) di atas engine: bintang (katalog
  Hipparcos, 7917 bintang), konstelasi (88, dari stellarium-skycultures),
  objek langit-dalam/DSO (629, OpenNGC), satelit (157, CelesTrak TLE +
  satellite.js SGP4) — dibangun karena data native Stellarium Web Engine
  untuk kategori ini terkunci/tidak bisa diakses dari server mereka (403).
- Proyeksi stereografik kustom (bukan gnomonic/perspective) supaya cocok
  dengan FOV lebar (sampai 185°) seperti stellarium-web.org asli.
- Deep-link dari fitur lain (Prediksi Ramadan, Parade Planet) membuka
  Stellarium pada lokasi+waktu spesifik hasil komputasi mereka.

### 5.7 Tata Surya (`/solar-system`, `src/lib/solar-system/*`)
- Visualisasi 3D planet dengan elemen orbital Kepler (Standish/JPL),
  mode "Ilmiah" (skala fisik akurat 100%, tanpa hack ukuran minimum).
- Kontrol waktu simulasi dengan tombol tekan-tahan (auto-repeat berakselerasi)
  dan scrubber waktu relatif/tak terbatas mengikuti kecepatan yang dipilih.

### 5.8 Kalender Astronomi (`/astronomy-event`, API `/api/astronomy-events`)
- Kalender gabungan 3 kategori (ramadan+syawal, eclipse, parade) per tahun
  Masehi (1972–2100), masing-masing dihitung sekuensial (bukan paralel —
  sengaja, untuk hindari burst besar ke HORIZONS) dan di-cache in-memory per
  kategori per tahun (`categoryCache`, hilang saat restart server).

### 5.9 Kejujuran Sumber Data (lintas-fitur, dibangun 2026-08-12)
- Setiap hasil KHGT/Wujudul Hilal membawa field `dataSource`
  (`live`/`cache`/`mock`/`mixed`) dan `warnings[]`. Warning
  "PERINGATAN DATA" hanya muncul kalau **>5%** kueri NASA yang mendasari
  hasil itu jatuh ke estimasi mock — ambang ini sengaja dinaikkan dari
  awalnya >0% karena noise transient normal (network blip sesekali)
  membuat peringatan terlalu sering muncul untuk hal yang tidak signifikan.
- `Catatan Komputasi/06_RUMUS_DAN_PARAMETER_ASTRONOMI.md` (lama) mencatat
  "tidak ada modul koreksi refraksi/paralaks eksplisit — transformasi
  dilakukan implicit oleh HORIZONS" — **ini sudah tidak berlaku sejak
  2026-08-12** (lihat Bagian 10, `precessionNutation.ts`).

---

## 6. Metodologi Komputasi Inti (tetap berlaku, diverifikasi ulang dari kode)

### 6.1 Newton-Raphson (pencarian waktu konjungsi)
- File: `src/lib/newMoonNR.ts`.
- `f(t) = wrapTo180(ObsEcLon_Bulan(t) - ObsEcLon_Matahari(t))`, target `f(t)=0`.
- `f'(t)` didekati central difference, delta 60 detik.
- Scan bracket setiap 6 jam (`SCAN_STEP_MS`), filter `|f|<=90°` untuk hindari
  oposisi/purnama.
- Toleransi konvergensi: `|f| < 1e-6°` ATAU (`|stepSec| < 0.2s` DAN `|f| <
  0.01°`). Maks 30 iterasi. Fallback bisection ke resolusi 2 detik bila NR
  gagal.
- Rumus: `t_{n+1} = t_n - f(t_n)/f'(t_n)`.

### 6.2 Kriteria Wujudul Hilal (lokal, `wujudulHilalRule.ts`)
- Rule A: konjungsi terjadi sebelum sunset lokal.
- Rule B: altitude topocentric Bulan saat sunset > 0°.
- Terpenuhi = Rule A DAN Rule B. Borderline kalau `|altitude| <= 0.2°`.
- Kalau terpenuhi pada tanggal kandidat D → 1 Ramadan = D+1.

### 6.3 Kriteria KHGT (global, `khgtRule.ts` + `khgtPipeline.ts`)
- Geocentric altitude Bulan ≥5° DAN elongasi geosentris ≥8°, dievaluasi di
  ~90 titik saksi darat dunia saat maghrib.
- PKG1: saksi lolos dengan maghrib sebelum tengah malam UTC.
- PKG2 (kalau PKG1 gagal semua): syarat tambahan konjungsi sebelum fajar
  astronomis Wellington, lalu scan ulang titik-titik Amerika setelah tengah
  malam UTC.
- Istikmal (D+2) kalau PKG1 dan PKG2 keduanya gagal.

### 6.4 Kerangka Penelitian: CRISP-DM
Business Understanding → Data Understanding → Data Preparation → Modeling →
Evaluation → Deployment. Pemetaan detail: lihat
`Catatan Komputasi/10_PIPELINE_CRISP_DM_UNTUK_SKRIPSI.md` (bagian ini masih
akurat secara konsep, hanya daftar file pendukungnya yang perlu dibaca
bersama Bagian 4 dokumen ini karena sudah berkembang banyak).

### 6.5 Kriteria yang secara eksplisit TIDAK ada di sistem
- **MABIMS** (kriteria resmi Kemenag RI/negara ASEAN untuk Sidang Isbat,
  altitude≥3°, elongasi≥6.4°) — `[TIDAK DITEMUKAN DI CODEBASE]`. Sistem hanya
  punya Wujudul Hilal dan KHGT; kolom "resmi" di Evaluasi Riwayat memakai
  data hasil pengumuman pemerintah yang sudah terjadi (`officialHistory`),
  BUKAN menghitung ulang MABIMS sendiri.

---

## 7. Ground Truth & Referensi Kebenaran

Tiga sumber independen yang **harus selalu dicocokkan** setiap ada perubahan
pada pipeline komputasi inti (Wujudul Hilal / KHGT):

1. **`evaluasi.xlsx`** (root proyek) — hasil live tervalidasi 2017–2026, 2
   sheet: "Fase 1 - Konjungsi" (waktu konjungsi + eclLon/RA-Dec/topo per
   tahun) dan "Fase 2 - History Global Local" (tanggal KHGT vs lokal vs
   resmi).
2. **`Skripsi.pdf`** (root proyek) — Bab IV, Tabel 4.7/4.8 (jejak Newton-
   Raphson lengkap untuk 2026), Tabel 4.11/4.12 (evaluasi kondisi astronomis
   + tanggal lokal final).
3. **`src/lib/astronomyEvents.ts`** → `RAMADAN_CYCLES` — tabel statis
   terverifikasi 2017–2026 dipakai untuk kalender & sebagai patokan cepat
   di kode (bukan hasil hitung ulang tiap request).

Contoh titik cocok terverifikasi 2026-08-12: konjungsi Ramadan 1447H =
`2026-02-17T12:01:09` UTC (cocok persis, ke milidetik, di ketiga sumber);
1 Ramadan lokal = 2026-02-19; 1 Ramadan KHGT = 2026-02-18 dengan saksi lolos
PKG (bukan istikmal).

**Google Colab paralel** (`Google Colab/Wujudul_Hilal_Evaluasi_Konjungsi_dan_History.ipynb`)
adalah implementasi Python independen (dibuat sesi Claude sebelumnya) yang
mereplikasi persis logika sistem Node.js ini — dipakai untuk didemokan ke
dosen penguji. **Jangan diubah tanpa diminta eksplisit** — statusnya sebagai
referensi/pembanding independen, bukan bagian dari sistem produksi.

---

## 8. Fitur yang Direncanakan / Disebutkan Sebagai Tujuan Tapi BELUM
    Diimplementasikan

Ditandai berdasarkan tujuan yang pernah disampaikan eksplisit dalam sesi
kerja, dicek silang terhadap kode saat ini:

1. **Publikasi/deploy publik** — belum ada konfigurasi deployment (tidak ada
   `vercel.json`, tidak ada CI/CD pipeline terdeteksi). Disebut sebagai
   rencana ("kalau saya publish nanti") tapi belum dieksekusi.
2. **Rate-limiting per-pengunjung di level aplikasi** — direkomendasikan
   (supaya satu pengunjung publik tidak bisa memicu banyak komputasi berat
   sekaligus) tapi belum diimplementasikan; saat ini hanya ada semaphore
   global `MAX_CONCURRENCY=4` yang melindungi NASA, bukan melindungi server
   sendiri dari beban banyak pengguna simultan.
3. **Pre-compute / cache persisten untuk hasil tahun-tahun umum** —
   direkomendasikan supaya pengunjung publik tidak memicu query NASA baru
   tiap request; saat ini cache HORIZONS mentah ada di disk
   (`.cache/horizons/`, lokal saja) dan cache kategori kalender hanya
   in-memory (`categoryCache`, hilang tiap restart). Belum ada strategi
   precompute terjadwal.
4. **Migrasi cache/HORIZONS ke storage persisten (bukan disk lokal)** — perlu
   kalau nanti hosting-nya (mis. Vercel) me-reset filesystem tiap deploy;
   belum dikerjakan, baru sebatas rekomendasi.
5. **Kriteria MABIMS sebagai variabel ke-4** — lihat Bagian 6.5; belum ada
   rencana implementasi eksplisit dari pengguna, dicatat di sini sebagai
   observasi gap saja `[PERLU VALIDASI PENELITI]` apakah ini benar-benar
   diperlukan untuk skripsi.
6. **Perhitungan Alt/Az/RA-Dec mandiri untuk planet lain di luar Bulan/
   Matahari/parade** (mis. kalau Tata Surya 3D butuh posisi apparent presisi
   tinggi, bukan cuma elemen orbital Kepler) — sempat disebut sebagai opsi
   arsitektur ("hitung sendiri dari VECTORS") saat mendiagnosis masalah
   Observer Table, sudah dieksekusi untuk Ramadan/KHGT/Parade, **belum**
   untuk modul lain yang mungkin masih pakai jalur berbeda `[PERLU
   VALIDASI PENELITI — cek solar-system/jplHorizons.ts]`.
7. **Remote git belum tersambung** ke
   `https://github.com/mreinaldyalt/IAST.git` — repo tujuan sudah diketahui
   (Bagian 1), tapi `git remote add origin ...` belum dijalankan.

---

## 9. Keterbatasan & Catatan Jujur Lain (dari catatan lama, masih relevan)

- Tidak ada penanganan moon age, moonset, lag time, ARCL/ARCV/DAZ secara
  eksplisit di kode inti hisab — hanya altitude, azimuth, elongasi,
  illumination. `[TIDAK DITEMUKAN DI CODEBASE]`
- Evaluasi terhadap ground truth (`src/lib/evaluation.ts`) memakai exact-match
  tanggal, tidak ada toleransi statistik/margin error otomatis.
- Data anchor `data/anchors_syaban.json` **sudah dihapus** dari repo (status
  sebelumnya: wajib ada, kalau tidak ada sistem throw error). Sekarang
  `ramadanFromSyaban.ts` punya estimator aritmetik sebagai fallback kalau
  anchor tidak ditemukan — bukan lagi hard requirement.

---

## 10. Riwayat Insiden & Perbaikan Penting (kronologis, ringkas)

Untuk detail penuh, transkrip percakapan kerja adalah sumber kebenaran;
ringkasan berikut untuk konteks cepat progres berikutnya.

1. **Bug asal (sebelum sesi ini): `$$SOE/$$EOE markers` error** muncul di
   Prediksi Ramadan. Sistem lain (Codex/GPT) diminta memperbaiki.
2. **Perbaikan Codex ternyata memperparah**: menambahkan `OBJ_DATA='NO'` ke
   query Observer Table untuk Matahari/Bulan — dibuktikan lewat A/B test
   terkontrol bahwa kombinasi ini memicu error 500 permanen di server NASA
   (bug sempit NASA, tapi kita yang memicunya). Dikonfirmasi lewat git
   history: kode asli (sebelum Codex) tidak pernah set `OBJ_DATA` sama
   sekali.
3. **Root cause lebih dalam ditemukan**: `EPHEM_TYPE=OBSERVER` untuk
   Matahari/Bulan terbukti tidak stabil di bawah beban (500/502/503, atau
   200 tapi tabel kosong) — sementara `EPHEM_TYPE=VECTORS` untuk body yang
   sama tetap stabil (dibuktikan lewat isolasi langsung, dan lewat fakta
   fitur Gerhana yang dari awal sudah pakai VECTORS tidak pernah bermasalah).
4. **Solusi permanen dibangun**: `src/lib/precessionNutation.ts` — reduksi
   manual dari VECTORS (posisi ICRF terkoreksi cahaya+aberasi) ke RA/Dec
   apparent, bujur ekliptika, dan Alt/Az topocentric (presesi IAU 1976 +
   nutasi IAU 1980 + paralaks diurnal Bumi oblate), menggantikan
   ketergantungan pada Observer Table NASA. `horizonsQueries.ts` (Ramadan/
   KHGT/Evaluasi Konjungsi) dan `src/lib/parade/horizonsPlanets.ts` (Parade
   Planet) dimigrasikan ke pendekatan ini.
5. **Validasi ketat**: hasil transformasi baru diuji terhadap
   `evaluasi.xlsx` (14 titik data independen, presisi <0.01°) — **cocok
   100%** untuk seluruh 10 tahun (2017–2026), baik tanggal KHGT maupun
   tanggal lokal Wujudul Hilal, sumber data `live` (bukan cache/mock).
   Script validasi disimpan: `scripts/validate-vector-transform.mjs`.
6. **Bug performa ditemukan & diperbaiki**: sempat menurunkan
   `MAX_CONCURRENCY` (jumlah request paralel ke NASA) dari 4 ke 1 mengikuti
   kebijakan tertulis JPL ("satu request per waktu") — tapi ini membuat
   komputasi jadi sangat lambat (bermenit-menit). Dikembalikan ke 4 setelah
   dikonfirmasi dari catatan proyek sendiri (notebook Colab) bahwa nilai 4
   sudah terbukti aman bertahun-tahun; insiden sebelumnya ternyata disebabkan
   bug `OBJ_DATA` + burst tes manual >50 request, bukan concurrency normal.
7. **Bug URL-length di Parade Planet ditemukan & diperbaiki**: `annualCandidate.ts`
   memakai `BATCH_SIZE=160` (asumsi 148 epoch muat 1 request), padahal batas
   aman sesungguhnya (dibuktikan lewat binary search langsung ke NASA)
   adalah ~70-80 epoch sebelum request di-reject (502, halaman HTML generik
   dari gateway, bukan error aplikasi NASA). Diperbaiki jadi `BATCH_SIZE=60`.
   Bug ini sudah ada sejak awal fitur ini dibuat, tidak terkait Codex.
8. **Ambang peringatan data mock dinaikkan** dari >0% ke >5% kueri gagal,
   supaya noise transient normal tidak memicu peringatan berlebihan.

---

## 11. Status Catatan Lama (`Catatan Komputasi/`)

17 file `.md` lama di folder `Catatan Komputasi/` **masih berisi fakta
berharga** untuk metodologi inti (Newton-Raphson, rumus astronomi dasar,
kriteria Wujudul Hilal/KHGT — sudah diringkas ulang di Bagian 6 dokumen ini)
dan kerangka CRISP-DM (Bagian 6.4). **Namun sebagian besar strukturnya sudah
basi** karena ditulis sebelum fitur-fitur berikut ada: Parade Planet, Gerhana,
Tata Surya 3D, Sky Overlay Stellarium, Evaluasi Konjungsi (2 fase), Evaluasi
Riwayat (3 variabel + officialHistory), dan migrasi VECTORS (Bagian 10).
Folder itu **tidak dihapus** oleh dokumen ini — keputusan menghapus/
mengarsipkannya diserahkan ke pengguna.

File-file tersebut:
`00_RINGKASAN_SISTEM.md`, `01_STRUKTUR_PROJECT_DAN_PETA_KODE.md`,
`02_ALUR_DATA_NASA_JPL_HORIZONS.md`, `03_DATA_PREPARATION_DAN_PREPROCESSING.md`,
`04_MODEL_KOMPUTASI_HISAB.md`, `05_NEWTON_RAPHSON_DAN_ITERASI.md`,
`06_RUMUS_DAN_PARAMETER_ASTRONOMI.md`, `07_PENERAPAN_KRITERIA_LOKAL_GLOBAL.md`,
`08_VALIDASI_DAN_EVALUASI_HASIL.md`, `09_STELLARIUM_DAN_VISUALISASI.md`,
`10_PIPELINE_CRISP_DM_UNTUK_SKRIPSI.md`, `11_KAMUS_VARIABEL_PARAMETER_DAN_OUTPUT.md`,
`12_ALUR_EKSEKUSI_DARI_AWAL_SAMPAI_AKHIR.md`, `13_CATATAN_UNTUK_BAB_III_METODOLOGI.md`,
`14_CATATAN_UNTUK_BAB_IV_HASIL_DAN_PEMBAHASAN.md`, `PARADE_PLANET.md`, `README.md`.

---

## 12. Log Perubahan Dokumen Ini

| Tanggal | Perubahan |
|---|---|
| 2026-08-12 | Dibuat dari nol: konsolidasi 17 file `Catatan Komputasi/*.md` + verifikasi ulang langsung dari kode (package.json, struktur direktori, git remote) + riwayat perbaikan sesi hari ini (NASA Observer Table, VECTORS migration, concurrency, parade batch size). |

**Instruksi untuk update berikutnya:** setiap ada progres baru (fitur baru,
bug ditemukan/diperbaiki, keputusan arsitektur), tambahkan baris baru di
Bagian 10 (kronologis) dan/atau Bagian 12, lalu perbarui Bagian 5/8 kalau ada
fitur yang pindah status (belum→sudah diimplementasikan). Selalu verifikasi
klaim terhadap kode nyata sebelum menulis — jangan asumsi.
