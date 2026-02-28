/**
 * Newton–Raphson conjunction finder using HORIZONS ecliptic longitude.
 * f(t) = wrapTo180(ObsEcLon_moon(t) - ObsEcLon_sun(t))  target = 0
 * Central difference: f'(t) ≈ (f(t+δ) - f(t-δ)) / (2δ)
 * δ = 60 seconds
 * epsAngle = 1e-6 degrees
 * epsTime = 0.2 seconds
 * maxIter = 30
 * Scan step = 6 hours for initial guess
 */
import { getEclipticLon } from './horizonsQueries';
import { wrapTo180 } from './mathAngle';

const DELTA_S = 60; // seconds for central difference
const EPS_ANGLE = 1e-6; // degrees
const EPS_TIME = 0.2; // seconds
const MAX_ITER = 30;
const SCAN_STEP_MS = 6 * 3600 * 1000; // 6 hours

export interface NRIteration {
  iteration: number;
  epochUTC: string;
  fDeg: number;
  fPrimeDegPerSec: number;
  stepSec: number;
}

export interface ConjunctionResult {
  conjunctionUTC: Date;
  conjunctionISO: string;
  nrIterations: NRIteration[];
  converged: boolean;
  totalIterations: number;
  bisectionDeltaSec: number | null;
  bisectionWarning: boolean;
  scanBracket: { t1: Date; t2: Date; f1: number; f2: number } | null;
  requestParams: Record<string, string>;
}

/**
 * Evaluate f(t) = wrapTo180(moonEcLon - sunEcLon) at one or more times.
 * Batches all epochs into 2 HORIZONS requests (Moon + Sun).
 */
async function evalFBatch(epochs: Date[]): Promise<number[]> {
  const [moonRes, sunRes] = await Promise.all([
    getEclipticLon("'301'", epochs),
    getEclipticLon("'10'", epochs),
  ]);
  return epochs.map((_, i) =>
    wrapTo180(moonRes.results[i].ecLon - sunRes.results[i].ecLon)
  );
}

/** Single-epoch convenience wrapper */
async function evalF(t: Date): Promise<number> {
  return (await evalFBatch([t]))[0];
}

/**
 * Evaluate f and f' via central difference at time t.
 * Batches t-δ, t, t+δ into 2 requests (Moon + Sun) instead of 6.
 */
async function evalFAndPrime(
  t: Date
): Promise<{ f: number; fPrime: number }> {
  const tMinus = new Date(t.getTime() - DELTA_S * 1000);
  const tPlus = new Date(t.getTime() + DELTA_S * 1000);

  const fVals = await evalFBatch([tMinus, t, tPlus]);
  const fPrime = (fVals[2] - fVals[0]) / (2 * DELTA_S);
  return { f: fVals[1], fPrime };
}

/** Maximum epochs per batch to avoid URL length limits */
const BATCH_SIZE = 40;

/**
 * Scan window for sign changes in f(t), returning initial guess epochs.
 * Batches all scan epochs into a few HORIZONS requests.
 */
async function scanForBrackets(
  startUTC: Date,
  endUTC: Date
): Promise<Array<{ t1: Date; t2: Date; f1: number; f2: number }>> {
  // Collect all scan epochs first
  const scanEpochs: Date[] = [];
  let tCurr = startUTC.getTime();
  const tEnd = endUTC.getTime();
  while (tCurr <= tEnd) {
    scanEpochs.push(new Date(tCurr));
    tCurr += SCAN_STEP_MS;
  }

  // Evaluate f in batches
  const allF: number[] = [];
  for (let i = 0; i < scanEpochs.length; i += BATCH_SIZE) {
    const batch = scanEpochs.slice(i, i + BATCH_SIZE);
    const fBatch = await evalFBatch(batch);
    allF.push(...fBatch);
  }

  // Find sign changes
  const brackets: Array<{ t1: Date; t2: Date; f1: number; f2: number }> = [];
  for (let i = 1; i < allF.length; i++) {
    if (allF[i - 1] * allF[i] < 0) {
      brackets.push({
        t1: scanEpochs[i - 1],
        t2: scanEpochs[i],
        f1: allF[i - 1],
        f2: allF[i],
      });
    }
  }

  return brackets;
}

/**
 * Bisection to refine bracket to ~2 seconds precision.
 */
async function bisection(
  t1: Date,
  t2: Date,
  f1: number,
  _f2: number
): Promise<{ t: Date; deltaSec: number }> {
  let lo = t1.getTime();
  let hi = t2.getTime();
  let fLo = f1;

  while (hi - lo > 2000) {
    // 2 seconds
    const mid = (lo + hi) / 2;
    const fMid = await evalF(new Date(mid));
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  return {
    t: new Date((lo + hi) / 2),
    deltaSec: (hi - lo) / 1000,
  };
}

/**
 * Find conjunction in a time window using NR.
 */
export async function findConjunction(
  windowStartUTC: Date,
  windowEndUTC: Date
): Promise<ConjunctionResult> {
  // Scan for brackets
  const brackets = await scanForBrackets(windowStartUTC, windowEndUTC);

  if (brackets.length === 0) {
    throw new Error(
      `No conjunction found in window ${windowStartUTC.toISOString()} to ${windowEndUTC.toISOString()}`
    );
  }

  // Use first bracket's midpoint as initial guess
  const bracket = brackets[0];
  let t = new Date((bracket.t1.getTime() + bracket.t2.getTime()) / 2);

  const iterations: NRIteration[] = [];
  let converged = false;
  let lastParams: Record<string, string> = {};

  for (let i = 0; i < MAX_ITER; i++) {
    const { f, fPrime } = await evalFAndPrime(t);

    let stepSec: number;
    if (Math.abs(fPrime) < 1e-15) {
      // Derivative near zero — use small fixed step toward bracket center
      stepSec = 3600; // 1 hour
    } else {
      stepSec = -(f / fPrime);
    }

    iterations.push({
      iteration: i + 1,
      epochUTC: t.toISOString(),
      fDeg: f,
      fPrimeDegPerSec: fPrime,
      stepSec,
    });

    if (Math.abs(f) < EPS_ANGLE) {
      converged = true;
      break;
    }

    if (Math.abs(stepSec) < EPS_TIME && Math.abs(f) < 0.01) {
      converged = true;
      break;
    }

    t = new Date(t.getTime() + stepSec * 1000);

    // Clamp to window
    if (t.getTime() < windowStartUTC.getTime()) t = new Date(windowStartUTC.getTime() + 3600000);
    if (t.getTime() > windowEndUTC.getTime()) t = new Date(windowEndUTC.getTime() - 3600000);
  }

  // Bisection validation
  let bisectionDeltaSec: number | null = null;
  let bisectionWarning = false;

  if (brackets.length > 0) {
    const bisResult = await bisection(bracket.t1, bracket.t2, bracket.f1, bracket.f2);
    bisectionDeltaSec = Math.abs(t.getTime() - bisResult.t.getTime()) / 1000;
    if (bisectionDeltaSec > 2) {
      bisectionWarning = true;
    }
  }

  // Capture last request params for audit
  const moonQ = await getEclipticLon("'301'", [t]);
  lastParams = moonQ.params;

  return {
    conjunctionUTC: t,
    conjunctionISO: t.toISOString(),
    nrIterations: iterations,
    converged,
    totalIterations: iterations.length,
    bisectionDeltaSec,
    bisectionWarning,
    scanBracket: bracket,
    requestParams: lastParams,
  };
}
