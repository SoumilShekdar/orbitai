// SGP4-secular analytic propagation. Per-satellite elements and secular rates
// come from satellite.js's real SGP4 initialization (Kozai->Brouwer mean
// motion recovery, J2 secular rates for RAAN/argp/mean anomaly, B*-drag
// coefficients), then position is closed-form. The same math runs in the
// vertex shader (Satellites.tsx) and here on the CPU for picking/analysis, so
// rendered points, trails, and panel stats always agree. Versus full SGP4 the
// error is the bounded short-period oscillation (~5-15 km) rather than a
// drift that grows tens of km per day; only deep-space resonance/lunisolar
// periodics (e.g. Molniya) are not modeled.

import { twoline2satrec, type SatRec } from "satellite.js";

export const MU = 398600.8; // km^3/s^2 (WGS72, matches SGP4)
const RE_KM = 6378.135; // km, WGS72 equatorial radius used by SGP4

export interface Elements {
  aKm: number; // Brouwer-mean semi-major axis at epoch
  e: number;
  incRad: number;
  raan0: number; // at epochMs
  argp0: number;
  m0: number;
  nRadS: number; // Brouwer mean motion, rad/s (for period display)
  mdot: number; // mean anomaly rate incl. J2 secular, rad/s
  raanDot: number; // rad/s
  argpDot: number; // rad/s
  nodecf: number; // RAAN drag term, rad/s^2
  cc1: number; // semi-major-axis drag decay coefficient, 1/s
  mddot: number; // mean anomaly drag term, rad/s^2
  bstar: number; // TLE B* (1/earth-radii), kept for re-synthesis
  epochMs: number;
}

export function elementsFromSatrec(rec: SatRec): Elements {
  return {
    aKm: rec.a * RE_KM,
    e: rec.ecco,
    incRad: rec.inclo,
    raan0: rec.nodeo,
    argp0: rec.argpo,
    m0: rec.mo,
    nRadS: rec.no / 60,
    mdot: rec.mdot / 60,
    raanDot: rec.nodedot / 60,
    argpDot: rec.argpdot / 60,
    nodecf: rec.nodecf / 3600,
    // SGP4's secular drag term on mean longitude is no * t2cof * t^2.
    mddot: (rec.no * rec.t2cof) / 3600,
    cc1: rec.cc1 / 60,
    bstar: rec.bstar,
    epochMs: (rec.jdsatepoch - 2440587.5) * 86400000,
  };
}

export function elementsFromTle(tleLine1: string, tleLine2: string): Elements | null {
  if (!tleLine1?.startsWith("1 ") || !tleLine2?.startsWith("2 ")) return null;
  let rec: SatRec;
  try {
    rec = twoline2satrec(tleLine1, tleLine2);
  } catch {
    return null;
  }
  if (rec.error !== 0 || !(rec.no > 0) || !(rec.a > 0)) return null;
  return elementsFromSatrec(rec);
}

function solveKepler(m: number, e: number): number {
  let E = m + e * Math.sin(m); // good starter even at Molniya-class eccentricity
  for (let k = 0; k < 8; k++) {
    E = E - (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
  }
  return E;
}

// Drag decay factor on semi-major axis; clamped so long time jumps on
// decayed/high-drag objects can't collapse the orbit into the Earth.
export function dragTempa(el: Elements, dtS: number): number {
  return Math.min(1.6, Math.max(0.4, 1 - el.cc1 * dtS));
}

// ECI position in km. `out` is [x, y, z].
export function positionEciKm(el: Elements, timeMs: number, out: number[]): number[] {
  const dt = (timeMs - el.epochMs) / 1000;
  const tempa = dragTempa(el, dt);
  const a = el.aKm * tempa * tempa;
  const m = el.m0 + el.mdot * dt + el.mddot * dt * dt;
  const raan = el.raan0 + el.raanDot * dt + el.nodecf * dt * dt;
  const argp = el.argp0 + el.argpDot * dt;
  const E = solveKepler(m % (2 * Math.PI), el.e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const nu = Math.atan2(Math.sqrt(1 - el.e * el.e) * sinE, cosE - el.e);
  const r = a * (1 - el.e * cosE);
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
