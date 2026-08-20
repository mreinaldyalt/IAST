// Konversi TLE 3-baris (public/gp.txt, CelesTrak visual group) -> JSON.
const fs = require('fs');
const raw = fs.readFileSync('public/gp.txt', 'utf8').split('\n').map((l) => l.replace(/\r$/, ''));
const sats = [];
for (let i = 0; i + 2 < raw.length; i += 3) {
  const name = raw[i]?.trim();
  const l1 = raw[i + 1];
  const l2 = raw[i + 2];
  if (!name || !l1 || !l2 || !l1.startsWith('1 ') || !l2.startsWith('2 ')) continue;
  sats.push({ name, l1, l2 });
}
fs.writeFileSync('public/data/satellites.json', JSON.stringify({ count: sats.length, sats }));
console.log(`wrote ${sats.length} satelit -> public/data/satellites.json`);
