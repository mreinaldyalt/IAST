/**
 * Wujudul Hilal rule (Muhammadiyah criterion).
 *
 * A) Conjunction occurs before sunset on local date D
 * B) At sunset D, Moon's topocentric altitude > 0°
 *
 * If A & B fulfilled:
 *   ramadan1LocalDate = D
 *   ramadanStartLocalDateTime = sunset(D) + 1 second
 * If not: check D+1..D+3
 */

export interface WujudulHilalInput {
  conjunctionUTC: Date;
  sunsetUTC: Date;
  moonAltAtSunsetDeg: number;
  candidateDate: string; // YYYY-MM-DD
}

export interface WujudulHilalResult {
  ruleA: boolean; // conjunction before sunset
  ruleB: boolean; // moon alt > 0 at sunset
  fulfilled: boolean;
  candidateDate: string;
  moonAltAtSunsetDeg: number;
  isBorderline: boolean;
}

export function checkWujudulHilal(input: WujudulHilalInput): WujudulHilalResult {
  const ruleA = input.conjunctionUTC.getTime() < input.sunsetUTC.getTime();
  const ruleB = input.moonAltAtSunsetDeg > 0;
  const fulfilled = ruleA && ruleB;
  const isBorderline = Math.abs(input.moonAltAtSunsetDeg) <= 0.2;

  return {
    ruleA,
    ruleB,
    fulfilled,
    candidateDate: input.candidateDate,
    moonAltAtSunsetDeg: input.moonAltAtSunsetDeg,
    isBorderline,
  };
}
