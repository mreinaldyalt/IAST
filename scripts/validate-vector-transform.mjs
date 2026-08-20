/**
 * Validates the from-scratch VECTORS -> apparent-RA/Dec/EcLon/topo-AltAz
 * reduction (src/lib/precessionNutation.ts) against known-correct values
 * already captured in evaluasi.xlsx (originally produced by HORIZONS'
 * OBSERVER table with APPARENT='AIRLESS'). Read-only against the app;
 * only talks to NASA directly for the handful of test epochs below.
 */
import * as PN from '../src/lib/precessionNutation.ts';
// Node's loader loses named exports here (no "type":"module" in package.json,
// which is intentional — this is a Next.js app, not touching that); grab them
// off .default instead.
const {
  julianCenturiesJ2000, meanObliquityDeg, nutationDeg, precessJ2000ToDate,
  applyNutation, cartesianToRaDec, cartesianToEclipticLon,
  observerGeocentricVec, gmstDeg, gastDeg, raDecToAltAz,
} = PN.default ?? PN;

const BEKASI_LAT = -6.2349;
const BEKASI_LON = 107.0000;

const LEAP_SECOND_EFFECTIVE = [
  ['1972-01-01', 10], ['1972-07-01', 11], ['1973-01-01', 12], ['1974-01-01', 13],
  ['1975-01-01', 14], ['1976-01-01', 15], ['1977-01-01', 16], ['1978-01-01', 17],
  ['1979-01-01', 18], ['1980-01-01', 19], ['1981-07-01', 20], ['1982-07-01', 21],
  ['1983-07-01', 22], ['1985-07-01', 23], ['1988-01-01', 24], ['1990-01-01', 25],
  ['1991-01-01', 26], ['1992-07-01', 27], ['1993-07-01', 28], ['1994-07-01', 29],
  ['1996-01-01', 30], ['1997-07-01', 31], ['1999-01-01', 32], ['2006-01-01', 33],
  ['2009-01-01', 34], ['2012-07-01', 35], ['2015-07-01', 36], ['2017-01-01', 37],
];
function tdbMinusUtcSeconds(date) {
  let taiMinusUtc = 10;
  for (const [effective, value] of LEAP_SECOND_EFFECTIVE) {
    if (date.getTime() >= Date.parse(`${effective}T00:00:00Z`)) taiMinusUtc = value;
    else break;
  }
  return taiMinusUtc + 32.184;
}

function dateToJD(date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate() + date.getUTCHours() / 24 + date.getUTCMinutes() / 1440 +
    date.getUTCSeconds() / 86400 + date.getUTCMilliseconds() / 86400000;
  let yr = y, mo = m;
  if (mo <= 2) { yr -= 1; mo += 12; }
  const A = Math.floor(yr / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (yr + 4716)) + Math.floor(30.6001 * (mo + 1)) + d + B - 1524.5;
}

async function fetchVectorLTS(command, date) {
  const jdUt = dateToJD(date);
  const jdTdb = jdUt + tdbMinusUtcSeconds(date) / 86400;
  const url = new URL('https://ssd.jpl.nasa.gov/api/horizons.api');
  url.searchParams.set('format', 'json');
  const params = {
    COMMAND: `'${command}'`, EPHEM_TYPE: "'VECTORS'", VEC_CORR: "'LT+S'",
    CENTER: "'500@399'", TLIST: `'${jdTdb.toFixed(9)}'`, REF_PLANE: "'FRAME'",
    REF_SYSTEM: "'ICRF'", OUT_UNITS: "'KM-S'", VEC_TABLE: "'1'", CSV_FORMAT: "'YES'",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), { headers: { 'User-Agent': 'InternationalAstronomicalStudies/1.0 (academic research)' } });
  const j = await r.json();
  const res = j.result || '';
  const soe = res.indexOf('$$SOE');
  const eoe = res.indexOf('$$EOE');
  if (soe < 0 || eoe < 0) throw new Error('No $$SOE/$$EOE in response: ' + res.slice(-300));
  const line = res.slice(soe + 5, eoe).trim().split('\n')[0];
  const parts = line.split(',').map((s) => s.trim());
  // CSV format: JDTDB, Calendar Date, X, Y, Z,
  const x = parseFloat(parts[2]), y = parseFloat(parts[3]), z = parseFloat(parts[4]);
  return { x, y, z, jdUt };
}

function reduce(vec, jdUt) {
  const T = julianCenturiesJ2000(jdUt);
  const eps0 = meanObliquityDeg(T);
  const nut = nutationDeg(T);
  const precessed = precessJ2000ToDate(vec, T);
  const trueOfDate = applyNutation(precessed, eps0, nut);
  const trueObliquity = eps0 + nut.dEpsDeg;
  return { trueOfDate, trueObliquity, nut, eps0, T };
}

async function testCase(label, command, epochISO, expected) {
  const date = new Date(epochISO);
  const { x, y, z, jdUt } = await fetchVectorLTS(command, date);
  const { trueOfDate, trueObliquity } = reduce({ x, y, z }, jdUt);
  const { raDeg, decDeg } = cartesianToRaDec(trueOfDate);
  const eclLonDeg = cartesianToEclipticLon(trueOfDate, trueObliquity);

  const diffs = [];
  if (expected.raDeg !== undefined) diffs.push(['RA', raDeg, expected.raDeg]);
  if (expected.decDeg !== undefined) diffs.push(['Dec', decDeg, expected.decDeg]);
  if (expected.eclLonDeg !== undefined) diffs.push(['EclLon', eclLonDeg, expected.eclLonDeg]);

  console.log(`\n=== ${label} ===`);
  for (const [name, got, exp] of diffs) {
    const d = Math.abs(got - exp);
    const ok = d < 0.01;
    console.log(`  ${name}: got=${got.toFixed(6)} expected=${exp.toFixed(6)} diff=${d.toFixed(6)}deg ${ok ? 'OK' : '*** MISMATCH ***'}`);
  }
  return { raDeg, decDeg, eclLonDeg, jdUt };
}

async function topoTestCase(label, sunsetISO, moonExpectedAlt, moonExpectedAz) {
  const date = new Date(sunsetISO);
  const { x, y, z, jdUt } = await fetchVectorLTS('301', date);
  const { trueOfDate, trueObliquity, nut, eps0 } = reduce({ x, y, z }, jdUt);
  const gast = gastDeg(jdUt, nut, eps0);
  const obsVec = observerGeocentricVec(BEKASI_LAT, BEKASI_LON, 0, gast);
  const topoVec = {
    x: trueOfDate.x - obsVec.x,
    y: trueOfDate.y - obsVec.y,
    z: trueOfDate.z - obsVec.z,
  };
  const { raDeg: topoRa, decDeg: topoDec } = cartesianToRaDec(topoVec);
  const { altDeg, azDeg } = raDecToAltAz(topoRa, topoDec, BEKASI_LAT, BEKASI_LON, gast);

  console.log(`\n=== ${label} (topocentric @ Bekasi) ===`);
  const dAlt = Math.abs(altDeg - moonExpectedAlt);
  const dAz = Math.abs(azDeg - moonExpectedAz);
  console.log(`  Alt: got=${altDeg.toFixed(4)} expected=${moonExpectedAlt.toFixed(4)} diff=${dAlt.toFixed(4)}deg ${dAlt < 0.02 ? 'OK' : '*** MISMATCH ***'}`);
  console.log(`  Az:  got=${azDeg.toFixed(4)} expected=${moonExpectedAz.toFixed(4)} diff=${dAz.toFixed(4)}deg ${dAz < 0.02 ? 'OK' : '*** MISMATCH ***'}`);
}

// Test cases pulled directly from evaluasi.xlsx rows (already-validated OBSERVER-table
// output). NOTE per src/app/api/konjungsi-periode/route.ts: eclMoonDeg/eclSunDeg are
// evaluated AT CONJUNCTION time; raMoonDeg/decMoonDeg/raSunDeg/decSunDeg are evaluated
// AT SUNSET time (a different epoch!) — these are intentionally split below.
await testCase('2017 Moon @ conjunction (eclLon only)', '301', '2017-05-25T19:44:27.222033Z', { eclLonDeg: 64.777044 });
await testCase('2017 Sun @ conjunction (eclLon only)', '10', '2017-05-25T19:44:27.222033Z', { eclLonDeg: 64.777016 });
await testCase('2020 Moon @ conjunction (eclLon only)', '301', '2020-04-23T02:25:51.345133Z', { eclLonDeg: 33.402504 });
await testCase('2024 Moon @ conjunction (eclLon only)', '301', '2024-03-10T09:00:26.283706Z', { eclLonDeg: 350.279843 });

await testCase('2017 Moon @ sunset (RA/Dec)', '301', '2017-05-25T10:44:23.302258Z', { raDeg: 57.9432, decDeg: 15.0482 });
await testCase('2017 Sun @ sunset (RA/Dec)', '10', '2017-05-25T10:44:23.302258Z', { raDeg: 62.4443, decDeg: 21.0209 });
await testCase('2020 Moon @ sunset (RA/Dec)', '301', '2020-04-23T10:49:17.366927Z', { raDeg: 36.5709, decDeg: 10.2054 });
await testCase('2020 Sun @ sunset (RA/Dec)', '10', '2020-04-23T10:49:17.366927Z', { raDeg: 31.5041, decDeg: 12.7637 });
await testCase('2024 Moon @ sunset (RA/Dec)', '301', '2024-03-10T11:08:51.237526Z', { raDeg: 353.1697, decDeg: -5.2841 });
await testCase('2024 Sun @ sunset (RA/Dec)', '10', '2024-03-10T11:08:51.237526Z', { raDeg: 351.1506, decDeg: -3.8158 });

await topoTestCase('2017 sunset (D)', '2017-05-25T10:44:23.302258+00:00', -5.8667, 284.6452);
await topoTestCase('2020 sunset (D)', '2020-04-23T10:49:17.366927+00:00', 3.1853, 280.7477);
await topoTestCase('2024 sunset (D)', '2024-03-10T11:08:51.237526+00:00', -0.1170, 264.7825);

console.log('\nDone.');
