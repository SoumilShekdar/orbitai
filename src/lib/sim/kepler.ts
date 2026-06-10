// Demo-grade analytic propagation: Keplerian elements from each TLE plus J2
// secular precession of RAAN/argp. The same math runs in the vertex shader
// (Satellites.tsx) and here on the CPU for picking/analysis, so rendered
// points, trails, and panel stats always agree.

export const MU = 398600.4418; // km^3/s^2
const J2 = 1.08262668e-3;
const RE_J2 = 6378.137; // km, equatorial radius used in J2 rates
const DEG = Math.PI / 180;

export interface Elements {
  aKm: number; // semi-major axis
  e: number;
  incRad: number;
  raan0: number; // at epochMs
  argp0: number;
  m0: number;
  nRadS: number; // mean motion, rad/s
  raanDot: number; // rad/s
  argpDot: number;
  epochMs: number;
}

// TLE epoch (line 1 cols 19-32): YYDDD.DDDDDDDD.
function epochMsFromLine1(line1: string): number {
  const yy = parseInt(line1.slice(18, 20), 10);
  const year = yy >= 57 ? 1900 + yy : 2000 + yy;
  const dayOfYear = parseFloat(line1.slice(20, 32));
  return Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86400000;
}

// Mean elements read straight off the TLE (fixed-column format).
export function elementsFromTle(tleLine1: string, tleLine2: string): Elements | null {
  if (!tleLine1?.startsWith("1 ") || !tleLine2?.startsWith("2 ")) return null;
  const incRad = parseFloat(tleLine2.slice(8, 16)) * DEG;
  const raan0 = parseFloat(tleLine2.slice(17, 25)) * DEG;
  const e = parseFloat(`0.${tleLine2.slice(26, 33).trim()}`);
  const argp0 = parseFloat(tleLine2.slice(34, 42)) * DEG;
  const m0 = parseFloat(tleLine2.slice(43, 51)) * DEG;
  const meanMotion = parseFloat(tleLine2.slice(52, 63)); // rev/day
  const epochMs = epochMsFromLine1(tleLine1);
  if (![incRad, raan0, e, argp0, m0, epochMs].every(isFinite) || !(meanMotion > 0)) return null;

  const nRadS = (meanMotion * 2 * Math.PI) / 86400;
  const aKm = Math.cbrt(MU / (nRadS * nRadS));
  const p = aKm * (1 - e * e);
  const factor = 1.5 * J2 * (RE_J2 / p) ** 2 * nRadS;
  return {
    aKm,
    e,
    incRad,
    raan0,
    argp0,
    m0,
    nRadS,
    raanDot: -factor * Math.cos(incRad),
    argpDot: 0.5 * factor * (5 * Math.cos(incRad) ** 2 - 1),
    epochMs,
  };
}

function solveKepler(m: number, e: number): number {
  let E = m;
  for (let k = 0; k < 5; k++) {
    E = E - (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
  }
  return E;
}

// ECI position in km. `out` is [x, y, z].
export function positionEciKm(el: Elements, timeMs: number, out: number[]): number[] {
  const dt = (timeMs - el.epochMs) / 1000;
  const m = el.m0 + el.nRadS * dt;
  const raan = el.raan0 + el.raanDot * dt;
  const argp = el.argp0 + el.argpDot * dt;
  const E = solveKepler(m % (2 * Math.PI), el.e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const nu = Math.atan2(Math.sqrt(1 - el.e * el.e) * sinE, cosE - el.e);
  const r = el.aKm * (1 - el.e * cosE);
  const u = argp + nu;
  const cosO = Math.cos(raan);
  const sinO = Math.sin(raan);
  const cosi = Math.cos(el.incRad);
  const sini = Math.sin(el.incRad);
  const cosu = Math.cos(u);
  const sinu = Math.sin(u);
  out[0] = r * (cosO * cosu - sinO * sinu * cosi);
  out[1] = r * (sinO * cosu + cosO * sinu * cosi);
  out[2] = r * (sinu * sini);
  return out;
}

// Speed from the vis-viva equation, km/s.
export function speedKmS(el: Elements, rKm: number): number {
  return Math.sqrt(MU * (2 / rKm - 1 / el.aKm));
}
