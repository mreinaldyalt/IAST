// Parse skyculture barat (western/index.json) -> JSON ringkas garis rasi
// (referensi nomor HIP). Juga cross-check semua HIP yg dirujuk garis rasi
// sudah tercakup di stars.json (Vmag<=6.5) — kalau ada yg lebih redup,
// tambahkan agar garis rasi tidak putus.
const fs = require('fs');

const src = JSON.parse(fs.readFileSync('public/stellarium-skycultures-master/western/index.json', 'utf8'));

const constellations = (src.constellations || []).map((c) => ({
  id: c.iau || c.id,
  name: c.common_name?.english || c.common_name?.native || c.id,
  lines: c.lines || [],
}));

const referencedHip = new Set();
for (const c of constellations) {
  for (const seg of c.lines) {
    for (const hip of seg) referencedHip.add(hip);
  }
}

const starsData = JSON.parse(fs.readFileSync('public/data/stars.json', 'utf8'));
const knownHip = new Set(starsData.stars.map((s) => s[0]));
const missing = [...referencedHip].filter((h) => !knownHip.has(h));

console.log(`Rasi: ${constellations.length}, HIP dirujuk: ${referencedHip.size}, belum ada di stars.json: ${missing.length}`);

// Tambahkan HIP yg hilang dari katalog penuh (walau lebih redup dari 6.5,
// tetap perlu ditampilkan sbg titik sambung garis rasi).
if (missing.length > 0) {
  const missingSet = new Set(missing);
  const raw = fs.readFileSync('.rawdata/hip_main.dat', 'utf8').split('\n');
  const extra = [];
  for (const line of raw) {
    if (!line.trim()) continue;
    const f = line.split('|');
    if (f.length < 10) continue;
    const hip = parseInt(f[1].trim(), 10);
    if (!missingSet.has(hip)) continue;
    const vmagStr = f[5].trim(), raStr = f[8].trim(), decStr = f[9].trim();
    if (!raStr || !decStr) continue;
    const vmag = vmagStr ? parseFloat(vmagStr) : 6.5;
    const ra = parseFloat(raStr), dec = parseFloat(decStr);
    if (!isFinite(ra) || !isFinite(dec)) continue;
    extra.push([hip, Math.round(ra * 1e5) / 1e5, Math.round(dec * 1e5) / 1e5, isFinite(vmag) ? Math.round(vmag * 100) / 100 : 6.5]);
  }
  starsData.stars.push(...extra);
  starsData.stars.sort((a, b) => a[3] - b[3]);
  starsData.count = starsData.stars.length;
  fs.writeFileSync('public/data/stars.json', JSON.stringify(starsData));
  console.log(`  -> ditambahkan ${extra.length} bintang redup (utk sambungan garis rasi), total kini ${starsData.count}`);
}

fs.writeFileSync('public/data/constellations.json', JSON.stringify({ count: constellations.length, constellations }));
console.log(`wrote ${constellations.length} rasi -> public/data/constellations.json`);
