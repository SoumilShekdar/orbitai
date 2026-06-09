import * as satellite from "satellite.js";

// Demo-grade analytic propagation: Keplerian elements from each TLE plus J2
// secular precession of RAAN/argp. The same math runs in the vertex shader
// (Satellites.tsx) and here on the CPU for picking/analysis, so rendered
// points, trails, and panel stats always agree.

export const MU = 398600.4418; // km^3/s^2
const J2 = 1.08262668e-3;
const RE_J2 = 6378.137; // km, equatorial radius used in J2 rates

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

export function elementsFromTle(tleLine1: string, tleLine2: string): Elements | null {
  const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
  if (satrec.error !== 0) return null;
  const nRadS = satrec.no / 60; // satrec.no is rad/min
  if (!(nRadS > 0)) return null;
  const aKm = Math.cbrt(MU / (nRadS * nRadS));
  const e = satrec.ecco;
  const incRad = satrec.inclo;
  const p = aKm * (1 - e * e);
  const factor = 1.5 * J2 * (RE_J2 / p) ** 2 * nRadS;
  return {
    aKm,
    e,
    incRad,
    raan0: satrec.nodeo,
    argp0: satrec.argpo,
    m0: satrec.mo,
    nRadS,
    raanDot: -factor * Math.cos(incRad),
    argpDot: 0.5 * factor * (5 * Math.cos(incRad) ** 2 - 1),
    epochMs: (satrec.jdsatepoch - 2440587.5) * 86400000,
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
