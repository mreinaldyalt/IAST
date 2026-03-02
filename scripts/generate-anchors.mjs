/**
 * generate-anchors.mjs
 * 
 * Generates Sya'ban 1 anchor dates for year range using pure arithmetic
 * (based on known Ramadan 1 seed from Muhammadiyah).
 * 
 * Usage: node scripts/generate-anchors.mjs [fromYear] [toYear]
 * Default: node scripts/generate-anchors.mjs 2010 2045
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

// Known seed: 2025 Ramadan 1 = 2025-03-01 (Muhammadiyah official)
const SEED_YEAR = 2025;
const SEED_RAMADAN1 = new Date('2025-03-01T00:00:00Z');
const ISLAMIC_YEAR_DAYS = 354.36667;

function estimateRamadan1(year) {
  const yearDiff = year - SEED_YEAR;
  const daysFromSeed = yearDiff * ISLAMIC_YEAR_DAYS;
  const estimated = new Date(SEED_RAMADAN1.getTime() + daysFromSeed * 86400000);

  // Adjust to be in the target Gregorian year (or year-1 for late-year Ramadans)
  while (estimated.getUTCFullYear() < year - 1) {
    estimated.setUTCDate(estimated.getUTCDate() + Math.round(ISLAMIC_YEAR_DAYS));
  }
  while (estimated.getUTCFullYear() > year) {
    estimated.setUTCDate(estimated.getUTCDate() - Math.round(ISLAMIC_YEAR_DAYS));
  }

  return estimated;
}

function deriveSyaban1(ramadan1Est) {
  const syaban1 = new Date(ramadan1Est.getTime());
  syaban1.setUTCDate(syaban1.getUTCDate() - 30);
  return syaban1.toISOString().slice(0, 10);
}

const fromYear = parseInt(process.argv[2] || '2010', 10);
const toYear = parseInt(process.argv[3] || '2045', 10);

console.log(`Generating Sya'ban anchors for ${fromYear}–${toYear}...`);

// Load existing anchors
const filePath = path.join(dataDir, 'anchors_syaban.json');
let existing = [];
if (fs.existsSync(filePath)) {
  existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`Loaded ${existing.length} existing anchors.`);
}

const existingMap = new Map(existing.map(a => [a.gregorianYear, a]));
let added = 0;
let skipped = 0;

for (let y = fromYear; y <= toYear; y++) {
  if (existingMap.has(y)) {
    skipped++;
    continue;
  }

  const ramadan1Est = estimateRamadan1(y);
  const syaban1 = deriveSyaban1(ramadan1Est);

  existingMap.set(y, {
    gregorianYear: y,
    syaban1LocalDate: syaban1,
    generatedBy: 'generate-anchors-horizons',
  });
  added++;

  console.log(`  ${y}: est. Ramadan 1 ≈ ${ramadan1Est.toISOString().slice(0, 10)}, Sya'ban 1 ≈ ${syaban1}`);
}

// Sort by year and write
const result = Array.from(existingMap.values()).sort((a, b) => a.gregorianYear - b.gregorianYear);
fs.writeFileSync(filePath, JSON.stringify(result, null, 2) + '\n');

console.log(`\nDone. Added ${added}, skipped ${skipped} (already existed).`);
console.log(`Total anchors: ${result.length} → ${filePath}`);
