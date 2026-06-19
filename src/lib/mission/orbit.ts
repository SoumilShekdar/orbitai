import * as THREE from "three";
import { Elements, positionEciKm } from "@/lib/sim/kepler";
import { elementsForOrbit, estimateBstar } from "@/lib/sim/synthTle";
import { gmst } from "@/lib/sun";
import { EARTH_RADIUS_EQ_KM, KM_TO_UNITS } from "@/lib/constants";

const DEG = Math.PI / 180;

// Scene-space unit vector of a ground site at the given sim time.
export function siteDirectionScene(latDeg: number, lonDeg: number, timeMs: number): THREE.Vector3 {
  const lat = latDeg * DEG;
  const lonEci = lonDeg * DEG + gmst(timeMs);
  const x = Math.cos(lat) * Math.cos(lonEci);
  const y = Math.cos(lat) * Math.sin(lonEci);
  const z = Math.sin(lat);
  return new THREE.Vector3(x, z, -y);
}

export interface InsertionPlan {
  elements: Elements;
  insertionPosScene: THREE.Vector3; // where the rocket releases the satellite
}

export interface LaunchGeometry {
  feasible: boolean; // can a direct ascent reach this inclination from this site?
  minInclinationDeg: number; // lowest inclination reachable directly = |site latitude|
  launchAzimuthDeg: number; // inertial heading of the (northbound) ascending pass, 0=N, 90=E
}

// A direct ascent can only inject into an orbit plane that contains the launch
// point, so the inclination cannot be less than the site's (absolute) latitude;
// a lower target needs a dogleg or an on-orbit plane change. The required
// inertial launch azimuth comes from sin(Az) = cos(i) / cos(latitude).
export function launchGeometry(inclinationDeg: number, siteLatDeg: number): LaunchGeometry {
  const lat = Math.abs(siteLatDeg) * DEG;
  const inc = inclinationDeg * DEG;
  const minInclinationDeg = Math.abs(siteLatDeg);
  const ratio = Math.cos(inc) / Math.cos(lat);
  const feasible = Math.abs(ratio) <= 1 + 1e-9;
  const azDeg = (Math.asin(Math.max(-1, Math.min(1, ratio))) * 180) / Math.PI;
  return { feasible, minInclinationDeg, launchAzimuthDeg: (azDeg + 360) % 360 };
}

// Build a circular orbit whose plane contains the launch site, inserting the
// satellite a few degrees downrange of the pad at insertionTimeMs. The orbit
// is SGP4-initialized via a synthesized TLE (B* estimated from mass), so the
// launched satellite evolves exactly like the real catalog.
export function planInsertion(
  altitudeKm: number,
  inclinationDeg: number,
  siteLatDeg: number,
  siteLonDeg: number,
  insertionTimeMs: number,
  massKg: number,
  downrangeDeg = 10,
): InsertionPlan {
  const incRad = Math.max(0.001, inclinationDeg * DEG);

  const lat = siteLatDeg * DEG;
  const lonEci = siteLonDeg * DEG + gmst(insertionTimeMs);

  // Argument of latitude of the northbound pass over the site; clamped when
  // the requested inclination can't reach the site latitude (dogleg launch).
  const sinU0 = THREE.MathUtils.clamp(Math.sin(lat) / Math.sin(incRad), -1, 1);
  const u0 = Math.asin(sinU0);
  const raan = lonEci - Math.atan2(Math.cos(incRad) * Math.sin(u0), Math.cos(u0));
  const uIns = u0 + downrangeDeg * DEG;

  const elements = elementsForOrbit({
    noradId: 90000,
    epochMs: insertionTimeMs,
    incRad,
    raanRad: raan,
    e: 0.0005,
    argpRad: 0,
    mRad: uIns, // e ~ 0 so mean anomaly ~ argument of latitude
    aKm: EARTH_RADIUS_EQ_KM + altitudeKm,
    bstar: estimateBstar(massKg),
  });

  const eci = positionEciKm(elements, insertionTimeMs, [0, 0, 0]);
  const insertionPosScene = new THREE.Vector3(
    eci[0] * KM_TO_UNITS,
    eci[2] * KM_TO_UNITS,
    -eci[1] * KM_TO_UNITS,
  );
  return { elements, insertionPosScene };
}

const easeInOut = (t: number) => t * t * (3 - 2 * t);

// Cinematic ascent path: radial climb off the pad bending downrange toward
// the insertion point. Returns position in scene units for s in [0, 1].
export function makeAscentCurve(siteDir: THREE.Vector3, insertionPos: THREE.Vector3) {
  const rIns = insertionPos.length();
  const insDir = insertionPos.clone().normalize();
  const full = new THREE.Quaternion().setFromUnitVectors(siteDir, insDir);
  const partial = new THREE.Quaternion();
  const dir = new THREE.Vector3();

  return (s: number, out: THREE.Vector3): THREE.Vector3 => {
    const bend = easeInOut(Math.pow(s, 1.6)); // hug the pad early, sweep late
    partial.identity().slerp(full, bend);
    dir.copy(siteDir).applyQuaternion(partial);
    const climb = easeInOut(s);
    const r = 1.002 + (rIns - 1.002) * climb;
    return out.copy(dir).multiplyScalar(r);
  };
}
