/**
 * Shared formula text, field labels, and the 17-stage (Bab III) mapping used by
 * the audit UI (/evaluasi-konjungsi "Jejak 17 Tahapan" / "Contoh Perhitungan
 * Lengkap" tabs) and the "Export Paket Bab IV" bundle.
 *
 * Pure presentation/documentation content — no computation happens here, and
 * nothing in this file is imported by the core Newton-Raphson engine. Changing
 * this file cannot change any computed conjunction/KHGT/WH result.
 */

export interface FormulaSpec {
  id: string;
  title: string;
  formula: string;
  variables: string;
  interpretation: string;
}

export const FORMULAS: FormulaSpec[] = [
  {
    id: 'delta-lambda',
    title: 'Selisih bujur ekliptika',
    formula: 'Δλ(t) = λ_Bulan(t) − λ_Matahari(t)',
    variables: 'λ_Bulan, λ_Matahari = bujur ekliptika geosentris Bulan dan Matahari (derajat) dari NASA/JPL Horizons pada epoch t.',
    interpretation: 'Δλ = 0° secara eksak menandai konjungsi (ijtimak) — bujur ekliptika Bulan dan Matahari berimpit.',
  },
  {
    id: 'wrap-to-180',
    title: 'Normalisasi sudut wrapTo180',
    formula: 'f(t) = wrapTo180(Δλ(t))',
    variables: 'wrapTo180(x) memetakan x ke rentang (−180°, 180°] dengan menambah/mengurangi kelipatan 360°.',
    interpretation: 'Tanpa normalisasi ini, selisih di sekitar 0°/360° bisa salah dibaca sebagai ~360° alih-alih ~0°, merusak deteksi sign change.',
  },
  {
    id: 'sign-change',
    title: 'Deteksi sign change (akar fungsi)',
    formula: 'f(t1) × f(t2) < 0',
    variables: 't1, t2 = dua epoch pemindaian berurutan (interval 6 jam).',
    interpretation: 'Jika hasil kali bertanda negatif, f(t) berubah tanda antara t1 dan t2 — oleh Teorema Nilai Antara terdapat akar f(t)=0 (konjungsi) di rentang tersebut.',
  },
  {
    id: 'opposition-filter',
    title: 'Penyaringan bracket oposisi (purnama)',
    formula: '|f(t1)| > 90° atau |f(t2)| > 90° ⇒ bracket dibuang',
    variables: 'Nilai f mendekati ±180° menandai oposisi (bulan purnama), bukan konjungsi.',
    interpretation: 'Sign change juga terjadi di sekitar oposisi (wrap dari +180° ke −180°) — kriteria ini memastikan hanya bracket di sekitar konjungsi (f≈0°) yang diproses Newton-Raphson.',
  },
  {
    id: 'initial-guess',
    title: 'Titik tengah bracket sebagai tebakan awal',
    formula: 't0 = (t1 + t2) / 2',
    variables: 't1, t2 = batas bracket hasil pemindaian 6 jam yang lolos filter oposisi.',
    interpretation: 'Titik tengah adalah tebakan awal paling netral sebelum iterasi Newton-Raphson dimulai.',
  },
  {
    id: 'central-difference',
    title: 'Turunan numerik (central difference)',
    formula: "f'(t) = [f(t+δ) − f(t−δ)] / 2δ,  δ = 60 detik",
    variables: 'f(t+δ), f(t−δ) = nilai fungsi 60 detik setelah/sebelum t.',
    interpretation: "f'(t) mengaproksimasi laju perubahan selisih bujur ekliptika (≈ kecepatan sudut relatif Bulan-Matahari) tanpa turunan analitik.",
  },
  {
    id: 'newton-raphson',
    title: 'Pembaruan Newton-Raphson',
    formula: "t_(n+1) = t_n − f(t_n) / f'(t_n)",
    variables: 't_n = tebakan waktu pada iterasi ke-n.',
    interpretation: 'Newton-Raphson memakai garis singgung f di t_n untuk menaksir letak akar f(t)=0 secara lebih dekat pada iterasi berikutnya.',
  },
  {
    id: 'step-sec',
    title: 'Koreksi waktu per iterasi',
    formula: "stepSec = − f(t_n) / f'(t_n)",
    variables: 'stepSec = besar koreksi waktu (detik) yang ditambahkan ke t_n.',
    interpretation: 'stepSec besar berarti tebakan masih jauh dari akar; stepSec kecil (mendekati 0) menandai iterasi mendekati konvergen.',
  },
  {
    id: 'convergence',
    title: 'Kriteria konvergensi',
    formula: '|f(t_n)| ≤ epsAngle  ATAU  (|stepSec| ≤ epsTime DAN |f(t_n)| < 0,01°)',
    variables: 'epsAngle = 1×10⁻⁶ derajat, epsTime = 0,2 detik.',
    interpretation: 'Dua jalur konvergensi: residual sudut sudah sangat kecil, atau koreksi waktu sudah sangat kecil sekaligus residual sudah cukup kecil (<0,01°).',
  },
  {
    id: 'bisection-fallback',
    title: 'Fallback bisection',
    formula: 'mid = (lo + hi) / 2;  jika f(lo)×f(mid) < 0 maka hi=mid, selain itu lo=mid',
    variables: 'Diulang hingga (hi − lo) ≤ 2 detik.',
    interpretation: 'Jika Newton-Raphson tidak konvergen dalam 30 iterasi (mis. turunan numerik mendekati nol), bisection membagi dua bracket berulang kali sebagai metode pencarian akar yang lebih lambat namun selalu konvergen pada fungsi kontinu dengan sign change valid.',
  },
  {
    id: 'dedup',
    title: 'Deduplikasi hasil konjungsi',
    formula: '|t_i − t_(i−1)| ≤ 12 jam ⇒ t_i dianggap duplikat',
    variables: 't_i = waktu konjungsi konvergen ke-i (setelah diurutkan menaik).',
    interpretation: 'Dua bracket bertetangga kadang konvergen ke waktu konjungsi yang (hampir) sama — duplikat ini dibuang agar satu peristiwa konjungsi tidak dihitung dua kali.',
  },
  {
    id: 'rule-a',
    title: 'Wujudul Hilal — Rule A',
    formula: 't_konjungsi < t_sunset(D)',
    variables: 't_sunset(D) = waktu matahari terbenam pada tanggal kandidat D di lokasi pengamatan.',
    interpretation: 'Konjungsi harus terjadi sebelum matahari terbenam pada hari yang sama agar bulan baru mungkin teramati/wujud saat itu.',
  },
  {
    id: 'rule-b',
    title: 'Wujudul Hilal — Rule B',
    formula: 'altitude_topocentric(Bulan, t_sunset) > 0°',
    variables: 'altitude_topocentric = tinggi Bulan di atas ufuk dari lokasi pengamatan (bukan geosentris) saat matahari terbenam.',
    interpretation: 'Bulan harus sudah berada di atas ufuk (secara topocentric) saat matahari terbenam agar hilal wujud di lokasi tersebut.',
  },
];

export function getFormula(id: string): FormulaSpec | undefined {
  return FORMULAS.find((f) => f.id === id);
}

/** Technical field name → academic label shown alongside it in tables/exports. */
export const FIELD_LABELS: Record<string, string> = {
  eclMoonDeg: 'Bujur Ekliptika Bulan (λ Bulan)',
  eclSunDeg: 'Bujur Ekliptika Matahari (λ Matahari)',
  deltaRawDeg: 'Selisih Bujur Ekliptika Mentah (Δλ)',
  deltaRaw1: 'Selisih Bujur Ekliptika Mentah di t1 (Δλ)',
  deltaRaw2: 'Selisih Bujur Ekliptika Mentah di t2 (Δλ)',
  fDeg: 'Hasil wrapTo180 / f(t)',
  f1: 'f(t1) — hasil wrapTo180 di t1',
  f2: 'f(t2) — hasil wrapTo180 di t2',
  wrappedDeltaDeg: 'Hasil wrapTo180 (f(t))',
  fPrimeDegPerSec: "Turunan Numerik f'(t) (derajat/detik)",
  stepSec: 'Koreksi Waktu Newton-Raphson (stepSec, detik)',
  midpointInitialGuessUTC: 'Titik Tengah Bracket / Tebakan Awal (t0)',
  keptAsBracket: 'Lolos sebagai Bracket Konjungsi',
  isOpposition: 'Tersaring sebagai Oposisi/Purnama',
  converged: 'Status Konvergensi',
  convergedThisStep: 'Konvergen pada Iterasi Ini',
  convergenceReason: 'Alasan Konvergensi',
  usedBisection: 'Fallback Bisection Dipakai',
  jd: 'Julian Date (JD)',
  tMinusUTC: 't − 60 detik (UTC)',
  tPlusUTC: 't + 60 detik (UTC)',
  fAtTMinus: 'f(t − 60 detik)',
  fAtTPlus: 'f(t + 60 detik)',
  epsAngleUsed: 'Toleransi Sudut (epsAngle, derajat)',
  epsTimeUsed: 'Toleransi Waktu (epsTime, detik)',
  epochUTC: 'Waktu Tebakan (UTC)',
  iteration: 'Iterasi ke-',
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/* ================================================================== */
/*  17-stage (Bab III) → system-evidence mapping                       */
/* ================================================================== */

export interface StageMappingEntry {
  stage: number;
  name: string;
  systemProcess: string;
  evidence: string;
  evidenceForm: string;
  output: string;
  codeRef: string;
  status: 'lengkap' | 'perlu_data_tambahan';
  note: string;
}

export interface StageMappingNumbers {
  fromYear: number;
  toYear: number;
  scanEpochCount: number;
  scanBatchCount: number;
  horizonsCallsPhase1Scan: number;
  totalSignChanges: number;
  keptAsBracket: number;
  filteredAsOpposition: number;
  totalNRIterations: number;
  avgIterationsPerConjunction: number;
  bisectionFallbackCount: number;
  totalConjunctions: number;
  rawCount: number;
  dedupedCount: number;
  dedupRemovedCount: number;
  totalCandidates: number;
}

export function buildStageMapping(n: StageMappingNumbers): StageMappingEntry[] {
  return [
    {
      stage: 1, name: 'Menentukan periode pencarian konjungsi',
      systemProcess: `Jendela pencarian dibentuk dari parameter fromYear/toYear (saat ini ${n.fromYear}–${n.toYear}) menjadi rentang UTC 1 Jan ${n.fromYear} 00:00 s.d. 31 Des ${n.toYear} 23:59.`,
      evidence: 'metadata.windowStartUTC, metadata.windowEndUTC pada respons audit.',
      evidenceForm: 'narasi + tabel metadata',
      output: 'Rentang waktu pencarian (windowStart, windowEnd)',
      codeRef: 'src/app/api/audit/konjungsi-periode/route.ts (windowStart/windowEnd); src/lib/newMoonNR.ts:findConjunctionsInRangeAudited',
      status: 'lengkap', note: 'Rentang default skripsi 2017–2026; dapat diubah via form utama halaman.',
    },
    {
      stage: 2, name: 'Menentukan objek data dan lokasi pengamatan',
      systemProcess: 'Objek: Bulan (kode HORIZONS \'301\') dan Matahari (\'10\'), keduanya geosentris untuk pencarian konjungsi. Lokasi pengamatan default: Kota Bekasi (-6.2349, 107.0000, Asia/Jakarta) untuk evaluasi pasca-konjungsi.',
      evidence: 'Parameter COMMAND pada query HORIZONS; metadata.lat/lon/tz pada respons audit.',
      evidenceForm: 'narasi + tabel metadata',
      output: 'Kode objek (301, 10) dan koordinat lokasi',
      codeRef: 'src/lib/horizonsQueries.ts:getEclipticLon; src/app/api/audit/konjungsi-periode/route.ts (default lat/lon/tz)',
      status: 'lengkap', note: '',
    },
    {
      stage: 3, name: 'Menyusun daftar epoch pemindaian interval 6 jam',
      systemProcess: `Epoch scan dibentuk dari windowStart hingga windowEnd dengan langkah tetap 6 jam, menghasilkan ${n.scanEpochCount} titik waktu.`,
      evidence: `dataPreparation.scanEpochCount = ${n.scanEpochCount}; metadata.scanStepHours = 6.`,
      evidenceForm: 'tabel ringkasan + narasi',
      output: 'Daftar epoch scan (jumlah titik waktu)',
      codeRef: 'src/lib/newMoonNR.ts:scanForBrackets (SCAN_STEP_MS = 6*3600*1000)',
      status: 'lengkap', note: '',
    },
    {
      stage: 4, name: 'Mengambil data bujur ekliptika dari NASA/JPL Horizons',
      systemProcess: `Setiap epoch di-batch (maksimal 40 epoch/batch) menjadi ${n.scanBatchCount} batch, masing-masing menghasilkan 2 permintaan HORIZONS (Bulan + Matahari) = ${n.horizonsCallsPhase1Scan} permintaan total pada tahap pemindaian.`,
      evidence: 'dataPreparation.scanBatchCount, horizonsCallsPhase1Scan, liveCount/cacheCount/mockCount/failedCount.',
      evidenceForm: 'tabel + narasi',
      output: 'Nilai bujur ekliptika Bulan dan Matahari per epoch',
      codeRef: 'src/lib/newMoonNR.ts:evalFBatchDetailed; src/lib/horizonsQueries.ts:getEclipticLon; src/lib/horizonsClient.ts:queryHorizons',
      status: 'lengkap', note: 'liveCount/cacheCount/mockCount membuktikan data berasal dari NASA/JPL Horizons (live atau cache), bukan simulasi, selama mockCount=0.',
    },
    {
      stage: 5, name: 'Membentuk fungsi selisih bujur ekliptika',
      systemProcess: 'Δλ(t) = λ_Bulan(t) − λ_Matahari(t) dihitung untuk setiap epoch sebelum dinormalisasi.',
      evidence: 'Rumus delta-lambda; kolom deltaRawDeg pada setiap event scan/iterasi; contoh substitusi pada tab Contoh Perhitungan Lengkap.',
      evidenceForm: 'rumus + substitusi angka + tabel',
      output: 'Δλ(t) mentah (sebelum wrapTo180)',
      codeRef: 'src/lib/newMoonNR.ts:evalFBatchDetailed (deltaRawDeg = eclMoonDeg - eclSunDeg)',
      status: 'lengkap', note: '',
    },
    {
      stage: 6, name: 'Normalisasi wrapTo180',
      systemProcess: 'Δλ(t) mentah dipetakan ke rentang (−180°,180°] melalui wrapTo180 agar konsisten dipakai sebagai f(t) pada deteksi sign change dan Newton-Raphson.',
      evidence: 'Rumus wrap-to-180; pasangan deltaRawDeg → fDeg pada tab wrapTo180 dan Contoh Perhitungan Lengkap.',
      evidenceForm: 'rumus + substitusi angka + tabel',
      output: 'f(t) = wrapTo180(Δλ(t))',
      codeRef: 'src/lib/mathAngle.ts:wrapTo180; src/lib/newMoonNR.ts:evalFBatchDetailed',
      status: 'lengkap', note: '',
    },
    {
      stage: 7, name: 'Mendeteksi sign change pada f(t)',
      systemProcess: `Setiap pasangan epoch berurutan diperiksa f(t_i-1)*f(t_i); ditemukan ${n.totalSignChanges} transisi tanda pada rentang ini.`,
      evidence: `scanResults.totalSignChanges = ${n.totalSignChanges}; tabel scanResults.events.`,
      evidenceForm: 'rumus + tabel',
      output: 'Daftar pasangan epoch dengan sign change',
      codeRef: 'src/lib/newMoonNR.ts:scanForBrackets (allF[i-1]*allF[i] < 0)',
      status: 'lengkap', note: '',
    },
    {
      stage: 8, name: 'Menyaring bracket agar mengarah ke konjungsi (bukan oposisi)',
      systemProcess: `Dari ${n.totalSignChanges} transisi tanda, ${n.filteredAsOpposition} dibuang karena |f|>90° (oposisi/purnama), tersisa ${n.keptAsBracket} bracket konjungsi.`,
      evidence: `scanResults.keptAsBracket = ${n.keptAsBracket}, filteredAsOpposition = ${n.filteredAsOpposition}.`,
      evidenceForm: 'rumus/kriteria + tabel berstatus',
      output: 'Bracket konjungsi terpilih',
      codeRef: 'src/lib/newMoonNR.ts:scanForBrackets (isOpposition check)',
      status: 'lengkap', note: '',
    },
    {
      stage: 9, name: 'Titik tengah bracket sebagai tebakan awal (initial guess)',
      systemProcess: `Untuk tiap ${n.keptAsBracket} bracket, t0 = (t1+t2)/2 dihitung sebagai titik awal iterasi Newton-Raphson.`,
      evidence: 'brackets[].midpointInitialGuessUTC pada respons audit.',
      evidenceForm: 'rumus + tabel',
      output: 't0 per bracket',
      codeRef: "src/lib/newMoonNR.ts:tryNROnBracket (let t = new Date((bracket.t1+bracket.t2)/2))",
      status: 'lengkap', note: '',
    },
    {
      stage: 10, name: 'Menghitung f(t) dan turunan numerik central difference',
      systemProcess: 'Pada tiap iterasi, f(t) dan f\'(t) dihitung memakai central difference dengan δ=60 detik.',
      evidence: `Rumus central-difference; ${n.totalNRIterations} baris iterasi pada newtonRaphsonIterations, masing-masing memuat fDeg, fAtTMinus, fAtTPlus, fPrimeDegPerSec.`,
      evidenceForm: 'rumus + substitusi angka + tabel iterasi',
      output: "f(t_n), f'(t_n) per iterasi",
      codeRef: 'src/lib/newMoonNR.ts:evalFAndPrime',
      status: 'lengkap', note: '',
    },
    {
      stage: 11, name: 'Memeriksa konvergensi',
      systemProcess: 'Setiap iterasi diperiksa terhadap epsAngle=1e-6° dan epsTime=0.2 detik untuk menentukan status konvergen.',
      evidence: 'Rumus convergence; kolom convergedThisStep dan convergenceReason pada setiap iterasi.',
      evidenceForm: 'rumus + tabel + narasi',
      output: 'Status konvergensi per iterasi',
      codeRef: 'src/lib/newMoonNR.ts:tryNROnBracket (convergedByAngle / convergedByTimeAndAngle)',
      status: 'lengkap', note: '',
    },
    {
      stage: 12, name: 'Update waktu dan ulangi perhitungan jika belum konvergen',
      systemProcess: "Jika belum konvergen, t_(n+1) = t_n - f(t_n)/f'(t_n), lalu f(t) dan f'(t) dihitung ulang pada t_(n+1).",
      evidence: 'Rumus newton-raphson; deret iterations[] berurutan pada tiap bracket menunjukkan t bergerak mendekati akar.',
      evidenceForm: 'rumus + tabel iterasi berurutan',
      output: 't_(n+1) per iterasi sampai konvergen',
      codeRef: 'src/lib/newMoonNR.ts:tryNROnBracket (loop body)',
      status: 'lengkap', note: '',
    },
    {
      stage: 13, name: 'Mengulangi iterasi sampai konvergen atau maksimum 30 iterasi',
      systemProcess: `Rata-rata ${n.avgIterationsPerConjunction} iterasi per konjungsi pada rentang ini (batas atas: 30 iterasi/bracket).`,
      evidence: 'metadata.maxIterations = 30; totalIterations per bracket pada newtonRaphsonIterations.',
      evidenceForm: 'tabel + narasi',
      output: 'Jumlah iterasi aktual per konjungsi',
      codeRef: 'src/lib/newMoonNR.ts:tryNROnBracket (MAX_ITER = 30)',
      status: 'lengkap', note: '',
    },
    {
      stage: 14, name: 'Fallback bisection jika Newton-Raphson tidak konvergen',
      systemProcess: `Pada rentang ini, ${n.bisectionFallbackCount} dari ${n.keptAsBracket} bracket memerlukan fallback bisection.`,
      evidence: 'Rumus bisection-fallback; fallbackBisection.count dan fallbackBisection.details.',
      evidenceForm: 'rumus + tabel (kosong jika 0 kejadian, tetap dapat diekspor)',
      output: 'Waktu hasil bisection (jika dipakai)',
      codeRef: 'src/lib/newMoonNR.ts:bisection, tryNROnBracket (blok fallback)',
      status: 'lengkap', note: n.bisectionFallbackCount === 0
        ? 'Tidak ada kejadian bisection pada rentang ini — bukan berarti fitur tidak ada, murni karena semua bracket konvergen via Newton-Raphson murni.'
        : '',
    },
    {
      stage: 15, name: 'Menetapkan waktu konjungsi sebagai keluaran algoritma',
      systemProcess: `${n.rawCount} bracket menghasilkan waktu konjungsi konvergen (sebelum deduplikasi).`,
      evidence: 'deduplication.rawCount; finalConjunctionISO pada setiap entri newtonRaphsonIterations.',
      evidenceForm: 'tabel',
      output: 'Daftar waktu konjungsi (UTC)',
      codeRef: 'src/lib/newMoonNR.ts:findConjunctionsInRangeAudited',
      status: 'lengkap', note: '',
    },
    {
      stage: 16, name: 'Memeriksa dan membuang konjungsi duplikat/hampir identik',
      systemProcess: `${n.rawCount} hasil mentah → ${n.dedupedCount} setelah deduplikasi (ambang 12 jam); ${n.dedupRemovedCount} dibuang.`,
      evidence: 'Rumus dedup; deduplication.duplicatesRemoved (daftar pasangan yang dibuang, bisa kosong).',
      evidenceForm: 'rumus + tabel (kosong jika 0 duplikat, tetap dapat diekspor)',
      output: 'Daftar konjungsi final (unik)',
      codeRef: 'src/lib/newMoonNR.ts:findConjunctionsInRangeAudited (DEDUP_THRESHOLD_MS)',
      status: 'lengkap', note: n.dedupRemovedCount === 0
        ? 'Tidak ditemukan duplikat pada rentang ini — tabel tetap tersedia dan akan terisi otomatis jika suatu rentang menghasilkan duplikat.'
        : '',
    },
    {
      stage: 17, name: 'Memilah kandidat awal Ramadan dan evaluasi pasca-konjungsi Kota Bekasi',
      systemProcess: `Dari ${n.totalConjunctions} konjungsi final, ${n.totalCandidates} dipilih sebagai kandidat awal Ramadan (satu per tahun target, berdasarkan jarak terdekat ke estimasi siklus Hijriah), lalu dievaluasi sunset, umur bulan, altitude/azimut topocentric, elongasi, Rule A/B Wujudul Hilal, dan status KHGT.`,
      evidence: 'postConjunctionEvaluation (satu baris per kandidat) beserta rumus rule-a dan rule-b.',
      evidenceForm: 'rumus + tabel + narasi',
      output: 'Tanggal kandidat awal Ramadan + status Wujudul Hilal/KHGT',
      codeRef: 'src/app/api/audit/konjungsi-periode/route.ts (candidate classification + postConjunctionEvaluation); src/lib/wujudulHilalRule.ts; src/lib/khgtRule.ts',
      status: 'lengkap', note: '',
    },
  ];
}
