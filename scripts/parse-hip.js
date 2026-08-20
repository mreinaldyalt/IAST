// Parse Hipparcos katalog (hip_main.dat, format CDS I/239) -> JSON ringkas
// bintang terang (Vmag <= 6.5, batas mata telanjang). Field pipe-delimited
// sesuai ReadMe: [0]=H [1]=HIP [5]=Vmag [8]=RAdeg [9]=DEdeg
const fs = require('fs');

const raw = fs.readFileSync('.rawdata/hip_main.dat', 'utf8').split('\n');
const stars = [];
for (const line of raw) {
  if (!line.trim()) continue;
  const f = line.split('|');
  if (f.length < 10) continue;
  const hip = parseInt(f[1].trim(), 10);
  const vmagStr = f[5].trim();
  const raStr = f[8].trim();
  const decStr = f[9].trim();
  if (!hip || !vmagStr || !raStr || !decStr) continue;
  const vmag = parseFloat(vmagStr);
  const ra = parseFloat(raStr);
  const dec = parseFloat(decStr);
  if (!isFinite(vmag) || !isFinite(ra) || !isFinite(dec)) continue;
  if (vmag > 6.5) continue; // batas mata telanjang (langit gelap)
  stars.push([hip, Math.round(ra * 1e5) / 1e5, Math.round(dec * 1e5) / 1e5, Math.round(vmag * 100) / 100]);
}
stars.sort((a, b) => a[3] - b[3]); // urut terang -> redup

const out = { format: '[hip, raDeg, decDeg, vmag]', count: stars.length, stars };
fs.writeFileSync('public/data/stars.json', JSON.stringify(out));
console.log(`wrote ${stars.length} bintang (Vmag<=6.5) -> public/data/stars.json`);
