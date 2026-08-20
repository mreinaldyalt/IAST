/**
 * Validates the actual wired-up horizonsQueries.ts functions (not the raw
 * transform math) against evaluasi.xlsx ground truth, including multi-epoch
 * batching in one call — the earlier validation script only ever tested one
 * epoch per HORIZONS request.
 */
import * as HQ from '../src/lib/horizonsQueries.ts';
const { getEclipticLon, getGeocentricApparentRADec, getTopoAzEl } = HQ.default ?? HQ;

function check(label, got, expected, tol = 0.01) {
  const diff = Math.abs(got - expected);
  console.log(`  ${label}: got=${got.toFixed(6)} expected=${expected.toFixed(6)} diff=${diff.toFixed(6)} ${diff < tol ? 'OK' : '*** MISMATCH ***'}`);
}

console.log('=== Multi-epoch batch: ecliptic longitude, 3 different years in ONE call ===');
const eclEpochs = [
  new Date('2017-05-25T19:44:27.222033Z'),
  new Date('2020-04-23T02:25:51.345133Z'),
  new Date('2024-03-10T09:00:26.283706Z'),
];
const eclRes = await getEclipticLon("'301'", eclEpochs);
console.log('source:', eclRes.results.map(r => r.source));
check('2017 Moon eclLon', eclRes.results[0].ecLon, 64.777044);
check('2020 Moon eclLon', eclRes.results[1].ecLon, 33.402504);
check('2024 Moon eclLon', eclRes.results[2].ecLon, 350.279843);

console.log('\n=== Multi-epoch batch: geocentric RA/Dec, 3 different sunsets in ONE call ===');
const raDecEpochs = [
  new Date('2017-05-25T10:44:23.302258Z'),
  new Date('2020-04-23T10:49:17.366927Z'),
  new Date('2024-03-10T11:08:51.237526Z'),
];
const raDecRes = await getGeocentricApparentRADec("'301'", raDecEpochs);
console.log('source:', raDecRes.results.map(r => r.source));
check('2017 Moon RA', raDecRes.results[0].ra, 57.9432);
check('2017 Moon Dec', raDecRes.results[0].dec, 15.0482);
check('2020 Moon RA', raDecRes.results[1].ra, 36.5709);
check('2020 Moon Dec', raDecRes.results[1].dec, 10.2054);
check('2024 Moon RA', raDecRes.results[2].ra, 353.1697);
check('2024 Moon Dec', raDecRes.results[2].dec, -5.2841);

console.log('\n=== Multi-epoch batch: topocentric Alt/Az @ Bekasi, 3 sunsets in ONE call ===');
const topoRes = await getTopoAzEl("'301'", raDecEpochs, -6.2349, 107.0000);
console.log('source:', topoRes.results.map(r => r.source));
check('2017 Moon topo Alt', topoRes.results[0].el, -5.8667, 0.02);
check('2017 Moon topo Az', topoRes.results[0].az, 284.6452, 0.02);
check('2020 Moon topo Alt', topoRes.results[1].el, 3.1853, 0.02);
check('2024 Moon topo Alt', topoRes.results[2].el, -0.1170, 0.02);

console.log('\nDone.');
