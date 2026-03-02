#!/usr/bin/env npx tsx
/**
 * generate-anchors-horizons.ts
 *
 * Generates Sya'ban 1 anchor dates for a given year range by:
 * 1. For each year, estimating the approximate Ramadan start (~29-day month cycle)
 * 2. Deriving Sya'ban 1 ≈ 29 days before the estimated Ramadan start
 * 3. Writing/merging results into data/anchors_syaban.json
 *
 * Strategy (pure ephemeris, no external calendar lookup):
 *   - The Islamic calendar is ~354-355 days/year, so Ramadan moves ~11 days earlier each Gregorian year.
 *   - We use a known Ramadan 1 date (e.g. 2025-03-01 from ground truth) as seed.
 *   - For each year, estimate Ramadan 1 by subtracting ~10.63 days per year from the seed.
 *   - Derive Sya'ban 1 = estimated Ramadan 1 - 30 days (Sya'ban has 29 or 30 days).
 *   - The anchor is approximate; the prediction pipeline will find the precise conjunction
 *     within the ±20-day window around the anchor.
 *
 * This script REQUIRES HORIZONS_MODE=live for actual ephemeris-based predictions,
 * but the anchor generation itself uses arithmetic (not HORIZONS queries).
 *
 * Usage:
 *   npx tsx scripts/generate-anchors-horizons.ts [fromYear] [toYear]
 *   npx tsx scripts/generate-anchors-horizons.ts 2010 2045
 *
 * If no args: defaults to 2010–2045.
 */

import fs from 'fs';
import path from 'path';

interface AnchorEntry {
  gregorianYear: number;
  syaban1LocalDate: string;
  generatedBy?: string;
}

// Known seed: 2025 Ramadan 1 = 2025-03-01 (Muhammadiyah official)
const SEED_YEAR = 2025;
const SEED_RAMADAN1 = new Date('2025-03-01');

// Average Islamic year in Gregorian days
const ISLAMIC_YEAR_DAYS = 354.36667;
const SYNODIC_MONTH = 29.53059;

function estimateRamadan1(year: number): Date {
  const yearDiff = year - SEED_YEAR;
  // Each Islamic year is ~354.37 days, each Gregorian year is ~365.25 days
  // Ramadan moves earlier by ~(365.25 - 354.37) = ~10.88 days per Gregorian year
  // But every ~33 years it cycles back, so we use the precise cumulative shift
  const dayShift = yearDiff * (365.2425 - ISLAMIC_YEAR_DAYS);
  const est = new Date(SEED_RAMADAN1.getTime());
  est.setDate(est.getDate() - dayShift);

  // But we also need to account for the fact that years later might see
  // Ramadan late in the year and wrap. Use modular arithmetic:
  // More precisely: estimate = seed + yearDiff * 365.2425 - yearDiff * 354.37
  // = seed + yearDiff * 10.875
  // Wait, no. If we go forward 1 year, Ramadan is ~11 days earlier.
  // seedDate + (yearDiff * 365.2425) puts us in the right Gregorian year
  // but Ramadan has shifted by (yearDiff * 10.875) days earlier.
  // So: estimatedDate = seedDate + yearDiff * (365.2425 - 10.875)... no

  // Simpler: Ramadan 1 for year Y ≈ SEED_RAMADAN1 + (Y - SEED_YEAR) * 365.2425 - (Y - SEED_YEAR) * 10.875
  // = SEED_RAMADAN1 + (Y - SEED_YEAR) * 354.3675
  // This gives the date shifting by synodic months correctly.
  const daysFromSeed = yearDiff * ISLAMIC_YEAR_DAYS;
  const estimated = new Date(SEED_RAMADAN1.getTime() + daysFromSeed * 86400000);

  // Adjust to be in the target Gregorian year
  // If estimated year != target year, shift by ±354 days
  while (estimated.getFullYear() < year - 1) {
    estimated.setDate(estimated.getDate() + Math.round(ISLAMIC_YEAR_DAYS));
  }
  while (estimated.getFullYear() > year) {
    estimated.setDate(estimated.getDate() - Math.round(ISLAMIC_YEAR_DAYS));
  }

  return estimated;
}

function deriveSyaban1(ramadan1Est: Date): string {
  // Sya'ban has 29 days (most years), so Sya'ban 1 ≈ Ramadan 1 - 29 days
  // Using 30 gives a broader window for the conjunction search (covers
  // both 29 and 30 day Sya'ban months).
  const syaban1 = new Date(ramadan1Est.getTime());
  syaban1.setDate(syaban1.getDate() - 30);
  return syaban1.toISOString().slice(0, 10);
}

function main() {
  const args = process.argv.slice(2);
  const fromYear = parseInt(args[0] || '2010', 10);
  const toYear = parseInt(args[1] || '2045', 10);

  console.log(`Generating Sya'ban anchors for ${fromYear}–${toYear}...`);
  console.log(`Seed: Ramadan 1 ${SEED_YEAR} = ${SEED_RAMADAN1.toISOString().slice(0, 10)}`);

  // Load existing anchors
  const filePath = path.join(process.cwd(), 'data', 'anchors_syaban.json');
  let existing: AnchorEntry[] = [];
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

    console.log(
      `  ${y}: est. Ramadan 1 ≈ ${ramadan1Est.toISOString().slice(0, 10)}, ` +
      `Sya'ban 1 ≈ ${syaban1}`
    );
  }

  // Sort by year and write
  const result = Array.from(existingMap.values()).sort((a, b) => a.gregorianYear - b.gregorianYear);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2) + '\n');

  console.log(`\nDone. Added ${added}, skipped ${skipped} (already existed).`);
  console.log(`Total anchors: ${result.length} → ${filePath}`);
}

main();
