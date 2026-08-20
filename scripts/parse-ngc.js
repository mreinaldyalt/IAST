// Parse OpenNGC (NGC.csv, semicolon-delimited) -> JSON ringkas.
// Filter: harus punya RA/Dec valid, DAN (bernomor Messier ATAU punya nama umum
// ATAU magnitudo terang <= 12) — supaya hasil relevan utk "populate the sky",
// bukan seluruh 13.971 entri (banyak yg sangat redup/tak dikenal).
const fs = require('fs');

function sexaToDeg(str, isRA) {
  const m = str.trim().match(/^([+-]?\d+):(\d+):([\d.]+)$/);
  if (!m) return null;
  const sign = str.trim().startsWith('-') ? -1 : 1;
  const h = Math.abs(parseInt(m[1], 10));
  const min = parseInt(m[2], 10);
  const sec = parseFloat(m[3]);
  const val = h + min / 60 + sec / 3600;
  return isRA ? val * 15 : sign * val;
}

const lines = fs.readFileSync('public/NGC.csv', 'utf8').split('\n');
const header = lines[0].split(';');
const idx = (name) => header.indexOf(name);
const iName = idx('Name'), iType = idx('Type'), iRA = idx('RA'), iDec = idx('Dec'),
  iVMag = idx('V-Mag'), iBMag = idx('B-Mag'), iM = idx('M'), iCommon = idx('Common names');

const TYPE_LABEL = {
  '*': 'star', '**': 'double-star', '*Ass': 'star-association', 'OCl': 'open-cluster',
  'GCl': 'globular-cluster', 'Cl+N': 'cluster-nebulosity', 'G': 'galaxy', 'GPair': 'galaxy-pair',
  'GTrpl': 'galaxy-triplet', 'GGroup': 'galaxy-group', 'PN': 'planetary-nebula', 'HII': 'hii-region',
  'DrkN': 'dark-nebula', 'EmN': 'emission-nebula', 'Neb': 'nebula', 'RfN': 'reflection-nebula',
  'SNR': 'supernova-remnant', 'Nova': 'nova', 'NonEx': 'nonexistent', 'Other': 'other',
};

const out = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const f = line.split(';');
  if (f.length <= iCommon) continue;
  const raDeg = sexaToDeg(f[iRA], true);
  const decDeg = sexaToDeg(f[iDec], false);
  if (raDeg === null || decDeg === null) continue;

  const messier = f[iM]?.trim();
  const common = f[iCommon]?.trim();
  const vmag = parseFloat(f[iVMag]);
  const bmag = parseFloat(f[iBMag]);
  const mag = isFinite(vmag) ? vmag : (isFinite(bmag) ? bmag : null);

  const notable = !!messier || !!common || (mag !== null && mag <= 10);
  if (!notable) continue;

  const name = f[iName].trim();
  const type = TYPE_LABEL[f[iType]?.trim()] || 'other';
  out.push({
    name,
    messier: messier ? `M${parseInt(messier, 10)}` : null,
    common: common || null,
    type,
    ra: Math.round(raDeg * 1e5) / 1e5,
    dec: Math.round(decDeg * 1e5) / 1e5,
    mag: mag !== null ? Math.round(mag * 100) / 100 : null,
  });
}

out.sort((a, b) => (a.mag ?? 99) - (b.mag ?? 99));
fs.writeFileSync('public/data/dso.json', JSON.stringify({ count: out.length, objects: out }));
console.log(`wrote ${out.length} objek DSO -> public/data/dso.json`);
