// Reference oracle for the propagation tests.
//
// The engine (src/lib/sim/kepler.ts) is an "SGP4-secular" model: it keeps the
// SGP4 J2 secular rates and first-order drag but drops the SGP4 short-period
// periodic terms. The natural ground truth is therefore the *full* SGP4
// implementation in satellite.js, initialized from the identical TLE. The gap
// between the two is exactly the documented short-period band (docs/PHYSICS.md
// §2). This module wraps satellite.js so a test can ask for "the SGP4 truth
// position in ECI km at time t" and diff it against the engine.

import { propagate, twoline2satrec, type SatRec } from "satellite.js";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Full-SGP4 ECI (TEME) position in km at a given epoch-millis, or null on error. */
export function sgp4PositionEciKm(rec: SatRec, timeMs: number): Vec3 | null {
  const pv = propagate(rec, new Date(timeMs));
  const p = pv?.position;
  if (!p || typeof p === "boolean") return null;
  return { x: p.x, y: p.y, z: p.z };
}

export function satrecFromTle(line1: string, line2: string): SatRec {
  return twoline2satrec(line1, line2);
}

/** Epoch of a TLE in millis (matches kepler.ts' epochMs derivation). */
export function epochMsFromSatrec(rec: SatRec): number {
  return (rec.jdsatepoch - 2440587.5) * 86400000;
}

export function distanceKm(a: Vec3, b: { 0: number; 1: number; 2: number }): number {
  const dx = a.x - b[0];
  const dy = a.y - b[1];
  const dz = a.z - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
