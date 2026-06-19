import * as THREE from "three";
import { Elements, elementsFromTle, positionEciKm, dragTempa } from "./kepler";
import { elementsForOrbit } from "./synthTle";
import { EARTH_RADIUS_EQ_KM, KM_TO_UNITS } from "../constants";

export interface SatMeta {
  noradId: number;
  name: string;
  operator: string;
  index: number;
  launched?: boolean;
}

export type CompactCatalogRow = [number, string, string, string, string];

const EXTRA_CAPACITY = 64; // headroom for satellites launched during the demo
export const REBASE_THRESHOLD_S = 6 * 3600;

export const DEFAULT_COLOR: [number, number, number] = [0.55, 0.75, 1.0];
export const SELECTED_COLOR: [number, number, number] = [0.4, 2.2, 2.6];
export const NEARBY_COLOR: [number, number, number] = [2.6, 0.35, 0.3];
export const LAUNCHED_COLOR: [number, number, number] = [2.8, 2.2, 0.6];

// Holds every satellite's orbital elements plus the packed attribute arrays
// the point shader consumes. Attribute elements are rebased to refMs so the
// shader's float32 time offset stays small.
export class SatCatalog {
  meta: SatMeta[] = [];
  elements: Elements[] = [];
  count = 0;
  capacity = 0;
  refMs = 0;

  elemA!: Float32Array; // a@ref(units, drag-decayed), e, inc, raan@ref
  elemB!: Float32Array; // argp@ref, M@ref, mdot@ref(rad/s), raanDot@ref(rad/s)
  elemC!: Float32Array; // argpDot(rad/s), pointSize
  colors!: Float32Array;

  // Low-rate CPU mirror of GPU positions (scene units) for picking/analysis.
  cpuPositions!: Float32Array;
  cpuTimeMs = 0;

  version = 0; // bumped whenever attribute arrays change (for geometry refresh)

  static fromCompact(rows: CompactCatalogRow[], nowMs: number): SatCatalog {
    const cat = new SatCatalog();
    cat.capacity = rows.length + EXTRA_CAPACITY;
    cat.elemA = new Float32Array(cat.capacity * 4);
    cat.elemB = new Float32Array(cat.capacity * 4);
    cat.elemC = new Float32Array(cat.capacity * 2);
    cat.colors = new Float32Array(cat.capacity * 3);
    cat.cpuPositions = new Float32Array(cat.capacity * 3);

    for (const [noradId, name, operator, tle1, tle2] of rows) {
      const el = elementsFromTle(tle1, tle2);
      if (!el) continue;
      const i = cat.count++;
      cat.meta.push({ noradId, name, operator, index: i });
      cat.elements.push(el);
      cat.setColor(i, DEFAULT_COLOR);
      cat.setSize(i, 1.0);
    }
    cat.rebase(nowMs);
    return cat;
  }

  // Elements evaluated at refMs: drag-decayed a, angles with their t^2 drag
  // terms folded in, and effective linear rates so the shader's cheap
  // "angle + rate * uTime" stays within metres of the CPU model for the
  // whole rebase window.
  private writeAttributes(i: number, el: Elements) {
    const TWO_PI = 2 * Math.PI;
    const dt = (this.refMs - el.epochMs) / 1000;
    const tempa = dragTempa(el, dt);
    this.elemA[i * 4 + 0] = el.aKm * tempa * tempa * KM_TO_UNITS;
    this.elemA[i * 4 + 1] = el.e;
    this.elemA[i * 4 + 2] = el.incRad;
    this.elemA[i * 4 + 3] = (el.raan0 + el.raanDot * dt + el.nodecf * dt * dt) % TWO_PI;
    this.elemB[i * 4 + 0] = (el.argp0 + el.argpDot * dt) % TWO_PI;
    this.elemB[i * 4 + 1] = (el.m0 + el.mdot * dt + el.mddot * dt * dt) % TWO_PI;
    this.elemB[i * 4 + 2] = el.mdot + 2 * el.mddot * dt;
    this.elemB[i * 4 + 3] = el.raanDot + 2 * el.nodecf * dt;
    this.elemC[i * 2 + 0] = el.argpDot;
  }

  // Re-evaluate every satellite's attributes at refMs.
  rebase(refMs: number) {
    this.refMs = refMs;
    for (let i = 0; i < this.count; i++) {
      this.writeAttributes(i, this.elements[i]);
    }
    this.version++;
  }

  needsRebase(simTimeMs: number): boolean {
    return Math.abs(simTimeMs - this.refMs) / 1000 > REBASE_THRESHOLD_S;
  }

  setColor(i: number, rgb: readonly [number, number, number]) {
    this.colors[i * 3 + 0] = rgb[0];
    this.colors[i * 3 + 1] = rgb[1];
    this.colors[i * 3 + 2] = rgb[2];
  }

  setSize(i: number, size: number) {
    this.elemC[i * 2 + 1] = size;
  }

  // Single source of truth for point colors: launched > selected > nearby > default.
  recolor(selected: number | null, nearby?: Set<number>) {
    for (let i = 0; i < this.count; i++) {
      if (this.meta[i].launched) this.setColor(i, LAUNCHED_COLOR);
      else if (i === selected) this.setColor(i, SELECTED_COLOR);
      else if (nearby?.has(i)) this.setColor(i, NEARBY_COLOR);
      else this.setColor(i, DEFAULT_COLOR);
    }
    this.version++;
  }

  addSatellite(meta: Omit<SatMeta, "index">, el: Elements): number {
    if (this.count >= this.capacity) throw new Error("catalog capacity exceeded");
    const i = this.count++;
    this.meta.push({ ...meta, index: i });
    this.elements.push(el);
    this.writeAttributes(i, el);
    this.setColor(i, LAUNCHED_COLOR);
    this.setSize(i, 2.2);
    this.version++;
    return i;
  }

  // Mission satellites are always appended, so removal only needs to support
  // popping the most recent entry.
  removeSatellite(i: number) {
    if (i !== this.count - 1) throw new Error("only the last satellite can be removed");
    this.count--;
    this.meta.pop();
    this.elements.pop();
    this.version++;
  }

  // Move a satellite to a new circular altitude, preserving its current
  // angular position so the point doesn't jump. Re-runs SGP4 init via a
  // synthesized TLE so the new orbit carries proper J2 and drag rates.
  // An optional new inclination lets a sun-synchronous orbit retarget its
  // inclination to stay sun-synchronous at the new altitude.
  changeAltitude(i: number, newAltKm: number, timeMs: number, newInclinationDeg?: number) {
    const el = this.elements[i];
    const dt = (timeMs - el.epochMs) / 1000;
    const TWO_PI = 2 * Math.PI;
    const next = elementsForOrbit({
      noradId: this.meta[i].noradId,
      epochMs: timeMs,
      incRad: newInclinationDeg !== undefined ? (newInclinationDeg * Math.PI) / 180 : el.incRad,
      raanRad: (el.raan0 + el.raanDot * dt + el.nodecf * dt * dt) % TWO_PI,
      e: el.e,
      argpRad: (el.argp0 + el.argpDot * dt) % TWO_PI,
      mRad: (el.m0 + el.mdot * dt + el.mddot * dt * dt) % TWO_PI,
      aKm: EARTH_RADIUS_EQ_KM + newAltKm,
      bstar: el.bstar,
    });
    this.elements[i] = next;
    this.writeAttributes(i, next);
    this.setSize(i, 2.2);
    this.version++;
  }

  positionScene(i: number, timeMs: number, out: THREE.Vector3): THREE.Vector3 {
    const eci = positionEciKm(this.elements[i], timeMs, SCRATCH);
    return out.set(eci[0] * KM_TO_UNITS, eci[2] * KM_TO_UNITS, -eci[1] * KM_TO_UNITS);
  }

  // Refresh the CPU position mirror (used by picking and traffic analysis).
  updateCpuPositions(timeMs: number) {
    for (let i = 0; i < this.count; i++) {
      const eci = positionEciKm(this.elements[i], timeMs, SCRATCH);
      this.cpuPositions[i * 3 + 0] = eci[0] * KM_TO_UNITS;
      this.cpuPositions[i * 3 + 1] = eci[2] * KM_TO_UNITS;
      this.cpuPositions[i * 3 + 2] = -eci[1] * KM_TO_UNITS;
    }
    this.cpuTimeMs = timeMs;
  }
}

const SCRATCH: number[] = [0, 0, 0];
