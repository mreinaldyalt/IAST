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
import { dateToJD } from './horizonsClient';
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
  // Audit-detail fields (always populated by tryNROnBracket, additive/non-breaking) ─
  jd?: number;
  eclMoonDeg?: number;
  eclSunDeg?: number;
  deltaRawDeg?: number; // eclMoon - eclSun before wrapTo180
  tMinusUTC?: string;
  fAtTMinus?: number;
  tPlusUTC?: string;
  fAtTPlus?: number;
  epsAngleUsed?: number;
  epsTimeUsed?: number;
  convergedThisStep?: boolean;
  convergenceReason?: 'angle' | 'time_and_angle' | 'bisection_fallback' | null;
}

/** One 6-hour scan pair where f(t) changed sign, whether or not it was kept as a bracket. */
export interface SignChangeEvent {
  index: number;
  t1: string;
  t2: string;
  eclMoon1: number;
  eclSun1: number;
  deltaRaw1: number;
  f1: number;
  eclMoon2: number;
  eclSun2: number;
  deltaRaw2: number;
  f2: number;
  isOpposition: boolean; // |f1|>90 or |f2|>90 — filtered out as full-moon opposition
  keptAsBracket: boolean;
}

export interface ScanResult {
  brackets: Array<{ t1: Date; t2: Date; f1: number; f2: number }>;
  scanEpochCount: number;
  scanBatchCount: number;
  signChangeEvents: SignChangeEvent[];
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

interface FBatchDetail {
  jd: number;
  eclMoonDeg: number;
  eclSunDeg: number;
  deltaRawDeg: number;
  fDeg: number;
}

/**
 * Evaluate f(t) = wrapTo180(moonEcLon - sunEcLon) at one or more times, also
 * returning the raw components (JD, eclMoon, eclSun, pre-wrap delta) for audit purposes.
 * Batches all epochs into 2 HORIZONS requests (Moon + Sun).
 */
async function evalFBatchDetailed(epochs: Date[]): Promise<FBatchDetail[]> {
  const [moonRes, sunRes] = await Promise.all([
    getEclipticLon("'301'", epochs),
    getEclipticLon("'10'", epochs),
  ]);
  return epochs.map((_, i) => {
    const eclMoonDeg = moonRes.results[i].ecLon;
    const eclSunDeg = sunRes.results[i].ecLon;
    const deltaRawDeg = eclMoonDeg - eclSunDeg;
    return {
      jd: dateToJD(epochs[i]),
      eclMoonDeg,
      eclSunDeg,
      deltaRawDeg,
      fDeg: wrapTo180(deltaRawDeg),
    };
  });
}

/**
 * Evaluate f(t) = wrapTo180(moonEcLon - sunEcLon) at one or more times.
 * Batches all epochs into 2 HORIZONS requests (Moon + Sun).
 */
async function evalFBatch(epochs: Date[]): Promise<number[]> {
  const detail = await evalFBatchDetailed(epochs);
  return detail.map((d) => d.fDeg);
}

/** Single-epoch convenience wrapper */
async function evalF(t: Date): Promise<number> {
  return (await evalFBatch([t]))[0];
}

interface FAndPrimeDetail {
  jd: number;
  eclMoonDeg: number;
  eclSunDeg: number;
  deltaRawDeg: number;
  tMinusUTC: string;
  fAtTMinus: number;
  tPlusUTC: string;
  fAtTPlus: number;
}

/**
 * Evaluate f and f' via central difference at time t.
 * Batches t-δ, t, t+δ into 2 requests (Moon + Sun) instead of 6.
 * Also returns raw component detail (for audit trail) — the returned f/fPrime
 * are computed identically to before; nothing about the NR math changes.
 */
async function evalFAndPrime(
  t: Date
): Promise<{ f: number; fPrime: number; detail: FAndPrimeDetail }> {
  const tMinus = new Date(t.getTime() - DELTA_S * 1000);
  const tPlus = new Date(t.getTime() + DELTA_S * 1000);

  const [dMinus, dMid, dPlus] = await evalFBatchDetailed([tMinus, t, tPlus]);
  const fPrime = (dPlus.fDeg - dMinus.fDeg) / (2 * DELTA_S);
  return {
    f: dMid.fDeg,
    fPrime,
    detail: {
      jd: dMid.jd,
      eclMoonDeg: dMid.eclMoonDeg,
      eclSunDeg: dMid.eclSunDeg,
      deltaRawDeg: dMid.deltaRawDeg,
      tMinusUTC: tMinus.toISOString(),
      fAtTMinus: dMinus.fDeg,
      tPlusUTC: tPlus.toISOString(),
      fAtTPlus: dPlus.fDeg,
    },
  };
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
): Promise<ScanResult> {
  // Collect all scan epochs first
  const scanEpochs: Date[] = [];
  let tCurr = startUTC.getTime();
  const tEnd = endUTC.getTime();
  while (tCurr <= tEnd) {
    scanEpochs.push(new Date(tCurr));
    tCurr += SCAN_STEP_MS;
  }

  // Evaluate f in batches. Each batch is an independent HORIZONS query over a
  // disjoint epoch range — run them concurrently (order preserved by Promise.all)
  // instead of waiting for each batch before starting the next.
  const scanBatches: Date[][] = [];
  for (let i = 0; i < scanEpochs.length; i += BATCH_SIZE) {
    scanBatches.push(scanEpochs.slice(i, i + BATCH_SIZE));
  }
  const detailBatches = await Promise.all(scanBatches.map((batch) => evalFBatchDetailed(batch)));
  const allDetail: FBatchDetail[] = detailBatches.flat();
  const allF: number[] = allDetail.map((d) => d.fDeg);

  // Find sign changes, filtering out opposition brackets (|f1|>90 && |f2|>90).
  // Every sign change is recorded in signChangeEvents (kept or filtered) so the
  // audit trail can show exactly which transitions were rejected as opposition.
  const brackets: Array<{ t1: Date; t2: Date; f1: number; f2: number }> = [];
  const signChangeEvents: SignChangeEvent[] = [];
  for (let i = 1; i < allF.length; i++) {
    if (allF[i - 1] * allF[i] < 0) {
      const isOpposition = Math.abs(allF[i - 1]) > 90 || Math.abs(allF[i]) > 90;
      signChangeEvents.push({
        index: signChangeEvents.length,
        t1: scanEpochs[i - 1].toISOString(),
        t2: scanEpochs[i].toISOString(),
        eclMoon1: allDetail[i - 1].eclMoonDeg,
        eclSun1: allDetail[i - 1].eclSunDeg,
        deltaRaw1: allDetail[i - 1].deltaRawDeg,
        f1: allF[i - 1],
        eclMoon2: allDetail[i].eclMoonDeg,
        eclSun2: allDetail[i].eclSunDeg,
        deltaRaw2: allDetail[i].deltaRawDeg,
        f2: allF[i],
        isOpposition,
        keptAsBracket: !isOpposition,
      });
      if (isOpposition) continue; // SKIP bracket if either endpoint is near opposition (±180°)
      brackets.push({
        t1: scanEpochs[i - 1],
        t2: scanEpochs[i],
        f1: allF[i - 1],
        f2: allF[i],
      });
    }
  }

  return {
    brackets,
    scanEpochCount: scanEpochs.length,
    scanBatchCount: scanBatches.length,
    signChangeEvents,
  };
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

export interface BisectionDetail {
  triggered: boolean;
  resultEpochUTC: string | null;
  fAtResult: number | null;
  deltaSec: number | null;
  accepted: boolean; // |fAtResult| < 1 → accepted as near-conjunction
}

interface TryNRResult {
  t: Date;
  iterations: NRIteration[];
  converged: boolean;
  usedBisection: boolean;
  bisectionDetail: BisectionDetail | null;
}

/**
 * Attempt NR convergence on a single bracket. Returns result or null.
 */
async function tryNROnBracket(
  bracket: { t1: Date; t2: Date; f1: number; f2: number },
  windowStartUTC: Date,
  windowEndUTC: Date
): Promise<TryNRResult | null> {
  let t = new Date((bracket.t1.getTime() + bracket.t2.getTime()) / 2);
  const iterations: NRIteration[] = [];
  let converged = false;

  for (let i = 0; i < MAX_ITER; i++) {
    const { f, fPrime, detail } = await evalFAndPrime(t);

    let stepSec: number;
    if (Math.abs(fPrime) < 1e-15) {
      stepSec = 3600;
    } else {
      stepSec = -(f / fPrime);
    }

    const convergedByAngle = Math.abs(f) < EPS_ANGLE;
    const convergedByTimeAndAngle = Math.abs(stepSec) < EPS_TIME && Math.abs(f) < 0.01;
    const convergedThisStep = convergedByAngle || convergedByTimeAndAngle;

    iterations.push({
      iteration: i + 1,
      epochUTC: t.toISOString(),
      fDeg: f,
      fPrimeDegPerSec: fPrime,
      stepSec,
      jd: detail.jd,
      eclMoonDeg: detail.eclMoonDeg,
      eclSunDeg: detail.eclSunDeg,
      deltaRawDeg: detail.deltaRawDeg,
      tMinusUTC: detail.tMinusUTC,
      fAtTMinus: detail.fAtTMinus,
      tPlusUTC: detail.tPlusUTC,
      fAtTPlus: detail.fAtTPlus,
      epsAngleUsed: EPS_ANGLE,
      epsTimeUsed: EPS_TIME,
      convergedThisStep,
      convergenceReason: convergedByAngle ? 'angle' : convergedByTimeAndAngle ? 'time_and_angle' : null,
    });

    if (convergedThisStep) {
      converged = true;
      break;
    }

    t = new Date(t.getTime() + stepSec * 1000);

    // Clamp to window
    if (t.getTime() < windowStartUTC.getTime()) t = new Date(windowStartUTC.getTime() + 3600000);
    if (t.getTime() > windowEndUTC.getTime()) t = new Date(windowEndUTC.getTime() - 3600000);
  }

  // If NR did not converge, fall back to bisection on this bracket
  if (!converged) {
    try {
      const bisResult = await bisection(bracket.t1, bracket.t2, bracket.f1, bracket.f2);
      const fBis = await evalF(bisResult.t);
      const accepted = Math.abs(fBis) < 1;
      const bisectionDetail: BisectionDetail = {
        triggered: true,
        resultEpochUTC: bisResult.t.toISOString(),
        fAtResult: fBis,
        deltaSec: bisResult.deltaSec,
        accepted,
      };
      if (accepted) {
        // Bisection found a near-conjunction
        iterations.push({
          iteration: iterations.length + 1,
          epochUTC: bisResult.t.toISOString(),
          fDeg: fBis,
          fPrimeDegPerSec: 0,
          stepSec: 0,
          convergenceReason: 'bisection_fallback',
          convergedThisStep: true,
        });
        return { t: bisResult.t, iterations, converged: true, usedBisection: true, bisectionDetail };
      }
      return null; // this bracket failed even after bisection
    } catch {
      /* bisection failed — bracket is likely opposition */
      return null; // this bracket failed
    }
  }

  return { t, iterations, converged, usedBisection: false, bisectionDetail: null };
}

/* ================================================================== */
/*  Multi-conjunction finder for KHGT                                   */
/* ================================================================== */

export interface SimpleConjunction {
  t: Date;
  iso: string;
  converged: boolean;
}

/**
 * Find ALL conjunctions in a time window.
 * Returns them sorted by time ascending.
 */
export async function findConjunctionsInRange(
  startUTC: Date,
  endUTC: Date
): Promise<SimpleConjunction[]> {
  const { brackets } = await scanForBrackets(startUTC, endUTC);
  if (brackets.length === 0) return [];

  // Each bracket's Newton-Raphson refinement is independent (own t1/t2/f1/f2, no
  // shared mutable state) — refine them concurrently instead of one at a time.
  // horizonsClient's semaphore (MAX_CONCURRENCY=4) still caps actual NASA request
  // concurrency, so this only removes idle waiting between brackets, not the
  // per-request rate. Same NR math per bracket — result is bit-for-bit identical.
  const nrResults = await Promise.all(
    brackets.map((bracket) => tryNROnBracket(bracket, startUTC, endUTC))
  );

  const results: SimpleConjunction[] = [];
  for (const nr of nrResults) {
    if (nr && nr.converged) {
      results.push({ t: nr.t, iso: nr.t.toISOString(), converged: true });
    }
  }

  results.sort((a, b) => a.t.getTime() - b.t.getTime());
  return results;
}

/**
 * Find conjunction in a time window using NR.
 */
export async function findConjunction(
  windowStartUTC: Date,
  windowEndUTC: Date
): Promise<ConjunctionResult> {
  // Scan for brackets
  const { brackets } = await scanForBrackets(windowStartUTC, windowEndUTC);

  if (brackets.length === 0) {
    throw new Error(
      `No conjunction found in window ${windowStartUTC.toISOString()} to ${windowEndUTC.toISOString()}`
    );
  }

  // Sort brackets by time ascending (earliest first)
  const sorted = [...brackets].sort((a, b) => {
    const midA = (a.t1.getTime() + a.t2.getTime()) / 2;
    const midB = (b.t1.getTime() + b.t2.getTime()) / 2;
    return midA - midB;
  });

  // Converge ALL brackets, collect successful results. Independent per bracket (no
  // shared state) — refine concurrently instead of one at a time (see
  // findConjunctionsInRange above for the same change/rationale).
  const bracketResults = await Promise.all(
    sorted.map((bracket) => tryNROnBracket(bracket, windowStartUTC, windowEndUTC))
  );
  const convergedResults: Array<{ t: Date; iterations: NRIteration[]; converged: boolean; bracket: typeof sorted[0] }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const result = bracketResults[i];
    if (result && result.converged) {
      convergedResults.push({ ...result, bracket: sorted[i] });
    }
  }

  // Pick the EARLIEST converged conjunction by time
  let bestResult: { t: Date; iterations: NRIteration[]; converged: boolean; bracket: typeof sorted[0] } | null = null;

  if (convergedResults.length > 0) {
    convergedResults.sort((a, b) => a.t.getTime() - b.t.getTime());
    bestResult = convergedResults[0];
  }

  // If no bracket converged, use the first bracket's raw NR attempt
  if (!bestResult) {
    const fallbackBracket = sorted[0];
    let t = new Date((fallbackBracket.t1.getTime() + fallbackBracket.t2.getTime()) / 2);
    const iterations: NRIteration[] = [{
      iteration: 1,
      epochUTC: t.toISOString(),
      fDeg: (fallbackBracket.f1 + fallbackBracket.f2) / 2,
      fPrimeDegPerSec: 0,
      stepSec: 0,
    }];
    bestResult = { t, iterations, converged: false, bracket: fallbackBracket };
  }

  const { t, iterations, converged, bracket } = bestResult;

  // Bisection validation
  let bisectionDeltaSec: number | null = null;
  let bisectionWarning = false;

  try {
    const bisResult = await bisection(bracket.t1, bracket.t2, bracket.f1, bracket.f2);
    bisectionDeltaSec = Math.abs(t.getTime() - bisResult.t.getTime()) / 1000;
    if (bisectionDeltaSec > 2) {
      bisectionWarning = true;
    }
  } catch { /* non-critical */ }

  // Capture last request params for audit
  const moonQ = await getEclipticLon("'301'", [t]);
  const lastParams = moonQ.params;

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

/* ================================================================== */
/*  Audit-trail variant — same scan/bracket/NR math as above, but keeps  */
/*  every intermediate value instead of discarding it. Used only by the  */
/*  /api/audit/* endpoints for thesis Bab IV transparency; does not      */
/*  affect findConjunctionsInRange / findConjunction or any of their      */
/*  callers (KHGT pipeline, local WH prediction, konjungsi-periode API). */
/* ================================================================== */

export interface BracketAuditEntry {
  index: number;
  t1: string;
  t2: string;
  f1: number;
  f2: number;
  midpointInitialGuessUTC: string;
}

export interface NRTraceEntry {
  bracketIndex: number;
  t1: string;
  t2: string;
  initialGuessUTC: string;
  iterations: NRIteration[];
  totalIterations: number;
  converged: boolean;
  usedBisection: boolean;
  bisectionDetail: BisectionDetail | null;
  finalConjunctionISO: string | null;
}

export interface DuplicateRemovedEntry {
  keptISO: string;
  removedISO: string;
  diffHours: number;
}

export interface ConjunctionsAuditResult {
  scanEpochCount: number;
  scanBatchCount: number;
  signChangeEvents: SignChangeEvent[];
  brackets: BracketAuditEntry[];
  nrTraces: NRTraceEntry[];
  /** Converged conjunctions before the 12-hour dedup pass, sorted ascending. */
  rawConjunctions: SimpleConjunction[];
  /** Same conjunctions the ordinary (non-audited) API returns after dedup. */
  conjunctions: SimpleConjunction[];
  duplicatesRemoved: DuplicateRemovedEntry[];
}

/** Same 12-hour threshold used by /api/konjungsi-periode's dedup step. */
const DEDUP_THRESHOLD_MS = 12 * 3600 * 1000;

export async function findConjunctionsInRangeAudited(
  startUTC: Date,
  endUTC: Date
): Promise<ConjunctionsAuditResult> {
  const { brackets, scanEpochCount, scanBatchCount, signChangeEvents } =
    await scanForBrackets(startUTC, endUTC);

  const nrResults = await Promise.all(
    brackets.map((bracket) => tryNROnBracket(bracket, startUTC, endUTC))
  );

  const nrTraces: NRTraceEntry[] = brackets.map((bracket, i) => {
    const nr = nrResults[i];
    const initialGuessUTC = new Date((bracket.t1.getTime() + bracket.t2.getTime()) / 2).toISOString();
    return {
      bracketIndex: i,
      t1: bracket.t1.toISOString(),
      t2: bracket.t2.toISOString(),
      initialGuessUTC,
      iterations: nr?.iterations ?? [],
      totalIterations: nr?.iterations.length ?? 0,
      converged: !!nr?.converged,
      usedBisection: !!nr?.usedBisection,
      bisectionDetail: nr?.bisectionDetail ?? null,
      finalConjunctionISO: nr?.converged ? nr.t.toISOString() : null,
    };
  });

  const rawConjunctions: SimpleConjunction[] = [];
  for (const nr of nrResults) {
    if (nr && nr.converged) {
      rawConjunctions.push({ t: nr.t, iso: nr.t.toISOString(), converged: true });
    }
  }
  rawConjunctions.sort((a, b) => a.t.getTime() - b.t.getTime());

  const conjunctions: SimpleConjunction[] = [];
  const duplicatesRemoved: DuplicateRemovedEntry[] = [];
  for (let i = 0; i < rawConjunctions.length; i++) {
    if (i === 0) {
      conjunctions.push(rawConjunctions[i]);
      continue;
    }
    const diffMs = rawConjunctions[i].t.getTime() - rawConjunctions[i - 1].t.getTime();
    if (diffMs > DEDUP_THRESHOLD_MS) {
      conjunctions.push(rawConjunctions[i]);
    } else {
      duplicatesRemoved.push({
        keptISO: rawConjunctions[i - 1].iso,
        removedISO: rawConjunctions[i].iso,
        diffHours: diffMs / 3600000,
      });
    }
  }

  const bracketEntries: BracketAuditEntry[] = brackets.map((b, i) => ({
    index: i,
    t1: b.t1.toISOString(),
    t2: b.t2.toISOString(),
    f1: b.f1,
    f2: b.f2,
    midpointInitialGuessUTC: new Date((b.t1.getTime() + b.t2.getTime()) / 2).toISOString(),
  }));

  return {
    scanEpochCount,
    scanBatchCount,
    signChangeEvents,
    brackets: bracketEntries,
    nrTraces,
    rawConjunctions,
    conjunctions,
    duplicatesRemoved,
  };
}
