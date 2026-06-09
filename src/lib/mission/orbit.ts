import * as THREE from "three";
import * as satellite from "satellite.js";
import { Elements, MU } from "@/lib/sim/kepler";
import { EARTH_RADIUS_KM, KM_TO_UNITS } from "@/lib/constants";

const DEG = Math.PI / 180;

// Scene-space unit vector of a ground site at the given sim time.
export function siteDirectionScene(latDeg: number, lonDeg: number, timeMs: number): THREE.Vector3 {
  const gmst = satellite.gstime(new Date(timeMs));
  const lat = latDeg * DEG;
  const lonEci = lonDeg * DEG + gmst;
  const x = Math.cos(lat) * Math.cos(lonEci);
  const y = Math.cos(lat) * Math.sin(lonEci);
  const z = Math.sin(lat);
  return new THREE.Vector3(x, z, -y);
}

function eciSceneFromU(u: number, raan: number, incRad: number, r: number): THREE.Vector3 {
  const cosO = Math.cos(raan);
  const sinO = Math.sin(raan);
  const cosi = Math.cos(incRad);
  const sini = Math.sin(incRad);
  const cosu = Math.cos(u);
  const sinu = Math.sin(u);
  const x = r * (cosO * cosu - sinO * sinu * cosi);
  const y = r * (sinO * cosu + cosO * sinu * cosi);
  const z = r * sinu * sini;
  return new THREE.Vector3(x * KM_TO_UNITS, z * KM_TO_UNITS, -y * KM_TO_UNITS);
}

export interface InsertionPlan {
  elements: Elements;
  insertionPosScene: THREE.Vector3; // where the rocket releases the satellite
}

// Build a circular orbit whose plane contains the launch site, inserting the
// satellite a few degrees downrange of the pad at insertionTimeMs.
export function planInsertion(
  altitudeKm: number,
  inclinationDeg: number,
  siteLatDeg: number,
  siteLonDeg: number,
  insertionTimeMs: number,
  downrangeDeg = 10,
): InsertionPlan {
  const incRad = Math.max(0.001, inclinationDeg * DEG);
  const aKm = EARTH_RADIUS_KM + altitudeKm;
  const nRadS = Math.sqrt(MU / (aKm * aKm * aKm));

  const gmst = satellite.gstime(new Date(insertionTimeMs));
  const lat = siteLatDeg * DEG;
  const lonEci = siteLonDeg * DEG + gmst;

  // Argument of latitude of the northbound pass over the site; clamped when
  // the requested inclination can't reach the site latitude (dogleg launch).
  const sinU0 = THREE.MathUtils.clamp(Math.sin(lat) / Math.sin(incRad), -1, 1);
  const u0 = Math.asin(sinU0);
  const raan = lonEci - Math.atan2(Math.cos(incRad) * Math.sin(u0), Math.cos(u0));
  const uIns = u0 + downrangeDeg * DEG;

  const e = 0.0005;
  const elements: Elements = {
    aKm,
    e,
    incRad,
    raan0: raan,
    argp0: 0,
    m0: uIns, // e ~ 0 so mean anomaly ~ argument of latitude
    nRadS,
    raanDot: 0,
    argpDot: 0,
    epochMs: insertionTimeMs,
  };
  // J2 rates so the new satellite precesses like everything else.
  const J2 = 1.08262668e-3;
  const p = aKm * (1 - e * e);
  const factor = 1.5 * J2 * (6378.137 / p) ** 2 * nRadS;
  elements.raanDot = -factor * Math.cos(incRad);
  elements.argpDot = 0.5 * factor * (5 * Math.cos(incRad) ** 2 - 1);

  return { elements, insertionPosScene: eciSceneFromU(uIns, raan, incRad, aKm) };
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
