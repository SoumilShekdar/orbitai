import * as THREE from "three";
import { Elements, elementsFromTle, positionEciKm, MU } from "./kepler";
import { EARTH_RADIUS_KM, KM_TO_UNITS } from "../constants";

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

  elemA!: Float32Array; // a(units), e, inc, raan@ref
  elemB!: Float32Array; // argp@ref, M@ref, n(rad/s), raanDot(rad/s)
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
      cat.writeStaticAttributes(i, el);
      cat.setColor(i, DEFAULT_COLOR);
    }
    cat.rebase(nowMs);
    return cat;
  }

  private writeStaticAttributes(i: number, el: Elements) {
    this.elemA[i * 4 + 0] = el.aKm * KM_TO_UNITS;
    this.elemA[i * 4 + 1] = el.e;
    this.elemA[i * 4 + 2] = el.incRad;
    this.elemB[i * 4 + 2] = el.nRadS;
    this.elemB[i * 4 + 3] = el.raanDot;
    this.elemC[i * 2 + 0] = el.argpDot;
    this.elemC[i * 2 + 1] = 1.0;
  }

  // Recompute raan/argp/M at refMs for every satellite.
  rebase(refMs: number) {
    this.refMs = refMs;
    const TWO_PI = 2 * Math.PI;
    for (let i = 0; i < this.count; i++) {
      const el = this.elements[i];
      const dt = (refMs - el.epochMs) / 1000;
      this.elemA[i * 4 + 3] = (el.raan0 + el.raanDot * dt) % TWO_PI;
      this.elemB[i * 4 + 0] = (el.argp0 + el.argpDot * dt) % TWO_PI;
      this.elemB[i * 4 + 1] = (el.m0 + el.nRadS * dt) % TWO_PI;
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

  // Single source of truth for point colors: launched > nearby > selected > default.
  recolor(selected: number | null, nearby?: Set<number>) {
    for (let i = 0; i < this.count; i++) {
      if (this.meta[i].launched) this.setColor(i, LAUNCHED_COLOR);
      else if (nearby?.has(i)) this.setColor(i, NEARBY_COLOR);
      else if (i === selected) this.setColor(i, SELECTED_COLOR);
      else this.setColor(i, DEFAULT_COLOR);
    }
    this.version++;
  }

  addSatellite(meta: Omit<SatMeta, "index">, el: Elements): number {
    if (this.count >= this.capacity) throw new Error("catalog capacity exceeded");
    const i = this.count++;
    this.meta.push({ ...meta, index: i });
    this.elements.push(el);
    this.writeStaticAttributes(i, el);
    const dt = (this.refMs - el.epochMs) / 1000;
    this.elemA[i * 4 + 3] = el.raan0 + el.raanDot * dt;
    this.elemB[i * 4 + 0] = el.argp0 + el.argpDot * dt;
    this.elemB[i * 4 + 1] = el.m0 + el.nRadS * dt;
    this.setColor(i, LAUNCHED_COLOR);
    this.setSize(i, 2.2);
    this.version++;
    return i;
  }

  // Move a satellite to a new circular altitude, preserving its current
  // angular position so the point doesn't jump.
  changeAltitude(i: number, newAltKm: number, timeMs: number) {
    const el = this.elements[i];
    const dt = (timeMs - el.epochMs) / 1000;
    const mNow = (el.m0 + el.nRadS * dt) % (2 * Math.PI);
    const raanNow = el.raan0 + el.raanDot * dt;
    const argpNow = el.argp0 + el.argpDot * dt;

    el.aKm = EARTH_RADIUS_KM + newAltKm;
    el.nRadS = Math.sqrt(MU / (el.aKm * el.aKm * el.aKm));
    const J2 = 1.08262668e-3;
    const p = el.aKm * (1 - el.e * el.e);
    const factor = 1.5 * J2 * (6378.137 / p) ** 2 * el.nRadS;
    el.raanDot = -factor * Math.cos(el.incRad);
    el.argpDot = 0.5 * factor * (5 * Math.cos(el.incRad) ** 2 - 1);
    el.epochMs = timeMs;
    el.m0 = mNow;
    el.raan0 = raanNow;
    el.argp0 = argpNow;

    this.writeStaticAttributes(i, el);
    this.setSize(i, 2.2);
    const dtRef = (this.refMs - timeMs) / 1000;
    this.elemA[i * 4 + 3] = raanNow + el.raanDot * dtRef;
    this.elemB[i * 4 + 0] = argpNow + el.argpDot * dtRef;
    this.elemB[i * 4 + 1] = mNow + el.nRadS * dtRef;
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
