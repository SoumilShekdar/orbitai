// Scene units: 1 unit = 1 (mean) Earth radius. This is only a rendering scale;
// it must NOT be used to convert orbital semi-major axis <-> altitude.
export const EARTH_RADIUS_KM = 6371;
export const KM_TO_UNITS = 1 / EARTH_RADIUS_KM;

// Geophysical constants for orbit math. Orbital elements (a, apo/peri) are
// referenced to the EQUATORIAL radius, so altitude = a - EARTH_RADIUS_EQ_KM,
// not a - 6371. Using the mean radius here biases every altitude high by ~7 km.
export const EARTH_RADIUS_EQ_KM = 6378.137; // WGS84 equatorial radius
export const MU_EARTH = 398600.8; // km^3/s^2 — must match kepler.ts MU (WGS72)
export const J2_EARTH = 1.08262668e-3; // Earth oblateness coefficient

// Inclination (deg) of a circular sun-synchronous orbit at the given altitude.
// Derived from the J2 nodal-precession condition: the right ascension of the
// ascending node must regress at the mean rate the Sun moves along the ecliptic
// (360deg / 365.2422 days) so the orbit plane keeps a fixed local solar time.
//   Omega_dot = -1.5 n J2 (Re/p)^2 cos(i) = +1.99096e-7 rad/s
// This is exact (to first order in J2); the old `96.6 + 0.00185*alt` linear fit
// is only valid near 550 km and drifts ~0.5deg by 800 km.
const SUN_SYNC_NODE_RATE = (2 * Math.PI) / (365.2421897 * 86400); // rad/s
export function sunSyncInclinationDeg(altitudeKm: number, e = 0): number {
  const a = EARTH_RADIUS_EQ_KM + altitudeKm; // km
  const n = Math.sqrt(MU_EARTH / a ** 3); // mean motion, rad/s
  const p = a * (1 - e * e); // semi-latus rectum, km
  const cosI = -SUN_SYNC_NODE_RATE / (1.5 * n * J2_EARTH * (EARTH_RADIUS_EQ_KM / p) ** 2);
  return (Math.acos(Math.max(-1, Math.min(1, cosI))) * 180) / Math.PI;
}

export const SPEED_OPTIONS = [
  { label: "1x", value: 1 },
  { label: "10x", value: 10 },
  { label: "100x", value: 100 },
  { label: "1000x", value: 1000 },
  { label: "1 day/s", value: 86400 },
] as const;
