import * as THREE from "three";

// ECI (z = north pole, x = vernal equinox) -> three.js scene (y-up).
export function eciToScene(
  x: number,
  y: number,
  z: number,
  scale: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  return out.set(x * scale, z * scale, -y * scale);
}

export function julianDate(ms: number): number {
  return ms / 86400000 + 2440587.5;
}

const DEG = Math.PI / 180;

// Low-precision solar position (Astronomical Almanac), good to ~0.01 deg.
// Returns a unit vector toward the Sun in scene coordinates.
export function sunDirectionScene(ms: number, out: THREE.Vector3): THREE.Vector3 {
  const n = julianDate(ms) - 2451545.0;
  const L = (280.46 + 0.9856474 * n) * DEG;
  const g = (357.528 + 0.9856003 * n) * DEG;
  const lambda = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const epsilon = (23.439 - 0.0000004 * n) * DEG;
  const x = Math.cos(lambda);
  const y = Math.cos(epsilon) * Math.sin(lambda);
  const z = Math.sin(epsilon) * Math.sin(lambda);
  return eciToScene(x, y, z, 1, out);
}
