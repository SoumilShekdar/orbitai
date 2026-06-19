// ── Closed-form / analytic verification of the physics engine ──
//
// Every block here maps 1:1 to a numbered section of docs/PHYSICS.md and states
// the governing equation, its source, the expected value, and the tolerance, so
// a domain expert can confirm the *math*, not just that "a test passes". These
// are all deterministic and offline.

import { describe, expect, it } from "vitest";
import {
  EARTH_RADIUS_EQ_KM,
  EARTH_RADIUS_KM,
  KM_TO_UNITS,
  J2_EARTH,
  MU_EARTH,
  sunSyncInclinationDeg,
} from "@/lib/constants";
import { MU, elementsFromTle, positionEciKm, speedKmS, dragTempa } from "@/lib/sim/kepler";
import {
  atmosphereDensity,
  dragAreaM2,
  orbitalLifetimeYears,
  DRAG_CD,
} from "@/lib/sim/decay";
import { estimateBstar, elementsForOrbit } from "@/lib/sim/synthTle";
import { launchGeometry, planInsertion } from "@/lib/mission/orbit";
import { gmst, eciToScene, sunDirectionScene, julianDate } from "@/lib/sun";
import * as THREE from "three";
import { ISS } from "./fixtures/realTles";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// ────────────────────────────────────────────────────────────────────────────
// §0 — Constants
// ────────────────────────────────────────────────────────────────────────────
describe("§0 geophysical constants", () => {
  it("μ matches WGS-72 / the SGP4 value (398600.8 km³/s²)", () => {
    expect(MU).toBe(398600.8);
    expect(MU_EARTH).toBe(MU); // constants.ts must agree with kepler.ts
  });

  it("uses the EQUATORIAL radius (6378.137 km) for orbit math, not the mean (6371)", () => {
    // §4: elements reference the equatorial radius; using 6371 biases altitude +7 km.
    expect(EARTH_RADIUS_EQ_KM).toBeCloseTo(6378.137, 3);
    expect(EARTH_RADIUS_KM).toBe(6371); // rendering scale only
    expect(EARTH_RADIUS_EQ_KM - EARTH_RADIUS_KM).toBeCloseTo(7.137, 2); // the historical bias
    expect(KM_TO_UNITS).toBeCloseTo(1 / 6371, 12);
  });

  it("J₂ is the EGM/WGS standard value", () => {
    expect(J2_EARTH).toBeCloseTo(1.08262668e-3, 11);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// §1 — Time & frames
// ────────────────────────────────────────────────────────────────────────────
describe("§1 GMST & frame transforms", () => {
  it("GMST at 2000-01-01 00:00 UTC equals the reference 99.9678°", () => {
    // Reference value (IAU-1982): GMST = 6.664520 h = 99.9678° at J2000 midnight.
    const g = gmst(Date.UTC(2000, 0, 1, 0, 0, 0)) * RAD;
    expect(g).toBeCloseTo(99.9678, 2);
  });

  it("GMST advances one sidereal turn (~360.9856°) per solar day", () => {
    const t0 = Date.UTC(2026, 0, 1, 0, 0, 0);
    const a = gmst(t0) * RAD;
    const b = gmst(t0 + 86400000) * RAD;
    const adv = ((b - a) % 360 + 360) % 360;
    expect(adv).toBeCloseTo(360.9856 - 360, 2); // 0.9856° net per solar day
  });

  it("Julian date is correct at the J2000 epoch", () => {
    expect(julianDate(Date.UTC(2000, 0, 1, 12, 0, 0))).toBeCloseTo(2451545.0, 6);
  });

  it("ECI→scene is the pure axis map (x, y, z) → (x, z, −y)", () => {
    const out = eciToScene(1, 2, 3, 1, new THREE.Vector3());
    expect([out.x, out.y, out.z]).toEqual([1, 3, -2]);
  });

  it("sun direction is a unit vector with declination within ±23.5°", () => {
    const s = sunDirectionScene(Date.UTC(2026, 5, 21), new THREE.Vector3());
    expect(s.length()).toBeCloseTo(1, 6);
    const decDeg = Math.asin(s.y) * RAD; // scene y = ECI z = sin(dec)
    expect(Math.abs(decDeg)).toBeLessThanOrEqual(23.5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// §2 — Kepler pipeline building blocks (the bounded-error claim is in propagation.test.ts)
// ────────────────────────────────────────────────────────────────────────────
describe("§2 Kepler pipeline & vis-viva", () => {
  const el = elementsFromTle(ISS.line1, ISS.line2)!;

  it("vis-viva: v = √(μ(2/r − 1/a)); ISS speed ≈ 7.66 km/s", () => {
    const v = speedKmS(el, el.aKm); // r = a on a near-circular orbit
    expect(v).toBeCloseTo(Math.sqrt(MU / el.aKm), 9);
    expect(v).toBeGreaterThan(7.5);
    expect(v).toBeLessThan(7.8);
  });

  it("all propagated radii lie within [perigee, apogee] of the ellipse", () => {
    // Drag-free orbit so a is fixed and the bound is exact (the ISS fixture has
    // drag, which shrinks a over the window and dips r a few metres below r_p).
    const orb = elementsForOrbit({
      noradId: 90002,
      epochMs: Date.UTC(2026, 0, 1),
      incRad: 51.6 * DEG,
      raanRad: 0,
      e: 0.05,
      argpRad: 0,
      mRad: 0,
      aKm: EARTH_RADIUS_EQ_KM + 700,
      bstar: 0,
    });
    const rp = orb.aKm * (1 - orb.e);
    const ra = orb.aKm * (1 + orb.e);
    for (let m = 0; m < 120; m++) {
      const p = positionEciKm(orb, orb.epochMs + m * 60_000, [0, 0, 0]);
      const r = Math.hypot(p[0], p[1], p[2]);
      expect(r).toBeGreaterThanOrEqual(rp - 1e-3);
      expect(r).toBeLessThanOrEqual(ra + 1e-3);
    }
  });

  it("conserves specific angular momentum |h| = √(μ·a(1−e²)) over an orbit (drag-free)", () => {
    // Drag-free circular orbit so a, e are fixed; h = r × v must be constant.
    const orb = elementsForOrbit({
      noradId: 90001,
      epochMs: Date.UTC(2026, 0, 1),
      incRad: 51.6 * DEG,
      raanRad: 0,
      e: 0.001,
      argpRad: 0,
      mRad: 0,
      aKm: EARTH_RADIUS_EQ_KM + 550,
      bstar: 0,
    });
    const hExpected = Math.sqrt(MU * orb.aKm * (1 - orb.e * orb.e));
    const dt = 1000; // 1 s central-difference for velocity
    const hMags: number[] = [];
    const hz: number[] = [];
    for (let s = 0; s < 6000; s += 600) {
      const t = orb.epochMs + s * 1000;
      const a = positionEciKm(orb, t - dt, [0, 0, 0]);
      const b = positionEciKm(orb, t + dt, [0, 0, 0]);
      const r = positionEciKm(orb, t, [0, 0, 0]);
      const v = [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2, (b[2] - a[2]) / 2]; // km/s
      hMags.push(Math.hypot(
        r[1] * v[2] - r[2] * v[1],
        r[2] * v[0] - r[0] * v[2],
        r[0] * v[1] - r[1] * v[0],
      ));
      hz.push(r[0] * v[1] - r[1] * v[0]);
    }
    // h is conserved (constant across samples) and equals √(μp). The ~0.02%
    // offset from the analytic value is central-difference truncation, not a
    // physics error, so we assert a relative bound.
    const spread = Math.max(...hMags) - Math.min(...hMags);
    expect(spread / hExpected).toBeLessThan(1e-4); // constant over the orbit
    for (const h of hMags) expect(Math.abs(h - hExpected) / hExpected).toBeLessThan(1e-3);
    // h_z = |h|·cos(i) is conserved (inclination is fixed).
    const hzExpected = hExpected * Math.cos(orb.incRad);
    for (const z of hz) expect(Math.abs(z - hzExpected) / hExpected).toBeLessThan(1e-3);
  });

  it("drag decay factor on a is clamped to [0.4, 1.6]", () => {
    expect(dragTempa(el, 0)).toBeCloseTo(1, 9);
    expect(dragTempa(el, 1e12)).toBe(0.4); // huge forward jump floors, never collapses
    expect(dragTempa({ ...el, cc1: -1 }, 1e12)).toBe(1.6);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// §3 — Sun-synchronous inclination (J₂ nodal-precession condition)
// ────────────────────────────────────────────────────────────────────────────
describe("§3 sun-synchronous inclination", () => {
  // cos i = −Ω̇_sun / [ 1.5 · n · J₂ · (Rₑ/p)² ],  Ω̇_sun = +1.99096e-7 rad/s.
  // Published reference column from docs/PHYSICS.md §3.
  const cases: [number, number][] = [
    [400, 97.03],
    [550, 97.59],
    [800, 98.6],
    [1000, 99.48],
  ];
  for (const [alt, expected] of cases) {
    it(`${alt} km → ${expected}° (±0.05)`, () => {
      expect(sunSyncInclinationDeg(alt)).toBeCloseTo(expected, 1);
      expect(Math.abs(sunSyncInclinationDeg(alt) - expected)).toBeLessThan(0.05);
    });
  }

  it("is retrograde (>90°) and increases with altitude", () => {
    expect(sunSyncInclinationDeg(400)).toBeGreaterThan(90);
    expect(sunSyncInclinationDeg(1000)).toBeGreaterThan(sunSyncInclinationDeg(400));
  });
});

// ────────────────────────────────────────────────────────────────────────────
// §5 — Launch geometry
// ────────────────────────────────────────────────────────────────────────────
describe("§5.1/5.2 launch plane targeting, feasibility & azimuth", () => {
  it("ISS-class 51.6° from Cape Canaveral (28.5°N) → feasible, ~45° (NE)", () => {
    const g = launchGeometry(51.6, 28.5);
    expect(g.feasible).toBe(true);
    expect(g.minInclinationDeg).toBeCloseTo(28.5, 6);
    expect(g.launchAzimuthDeg).toBeGreaterThan(40);
    expect(g.launchAzimuthDeg).toBeLessThan(50);
  });

  it("550 km SSO 97.6° from Vandenberg (34.7°N) → near-north retrograde (~351°)", () => {
    const g = launchGeometry(97.6, 34.7);
    expect(g.feasible).toBe(true);
    expect(g.launchAzimuthDeg).toBeGreaterThan(348);
    expect(g.launchAzimuthDeg).toBeLessThan(353);
  });

  it("i < |latitude| is infeasible directly (i=28° from Vandenberg 34.7°N)", () => {
    const g = launchGeometry(28, 34.7);
    expect(g.feasible).toBe(false);
    expect(g.minInclinationDeg).toBeCloseTo(34.7, 6); // a dogleg/plane-change is required
  });

  it("planInsertion places the orbit plane over the pad: sub-lat = asin(sin i · sin u_ins)", () => {
    const incDeg = 51.6;
    const latDeg = 28.5;
    const lonDeg = -80.6;
    const t = Date.UTC(2026, 0, 1, 0, 0, 0);
    const plan = planInsertion(420, incDeg, latDeg, lonDeg, t, 250, 10);
    const p = positionEciKm(plan.elements, t, [0, 0, 0]);
    const subLat = Math.asin(p[2] / Math.hypot(p[0], p[1], p[2])) * RAD;

    const u0 = Math.asin(Math.sin(latDeg * DEG) / Math.sin(incDeg * DEG));
    const expectedLat = Math.asin(Math.sin(incDeg * DEG) * Math.sin(u0 + 10 * DEG)) * RAD;
    expect(subLat).toBeCloseTo(expectedLat, 1); // within ~0.1°; geocentric-sphere model
    expect(plan.elements.incRad * RAD).toBeCloseTo(incDeg, 2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// §6 — Drag, ballistic coefficient & lifetime
// ────────────────────────────────────────────────────────────────────────────
describe("§6.1 ballistic coefficient & B*", () => {
  it("drag cross-section follows the cube-scaling law A = (m/100)^(2/3)", () => {
    expect(dragAreaM2(100)).toBeCloseTo(1, 9);
    expect(dragAreaM2(800)).toBeCloseTo(4, 9); // 8^(2/3)
    expect(DRAG_CD).toBe(2.2);
  });

  it("B* = ρ₀·C_d·A/(2m) is positive and decreases with mass (area-to-mass falls)", () => {
    const light = estimateBstar(250);
    const heavy = estimateBstar(1000);
    expect(light).toBeGreaterThan(0);
    expect(heavy).toBeLessThan(light);
    // Closed form: 0.157 · 2.2 · (2.5)^(2/3) / (2·250)
    expect(estimateBstar(250)).toBeCloseTo((0.157 * 2.2 * Math.pow(2.5, 2 / 3)) / 500, 9);
  });
});

describe("§6.2 King-Hele orbital lifetime (static atmosphere)", () => {
  // Order-of-decade estimates; bounds bracket the docs/PHYSICS.md §6.2 table.
  it("200 km decays in days, 800 km is capped at 200 yr", () => {
    expect(orbitalLifetimeYears(200, 250)).toBeLessThan(0.05);
    expect(orbitalLifetimeYears(800, 250)).toBe(200);
  });

  it("mid-LEO lifetimes bracket the published table", () => {
    expect(orbitalLifetimeYears(400, 250)).toBeGreaterThan(0.3);
    expect(orbitalLifetimeYears(400, 250)).toBeLessThan(1.2); // ~0.6 yr
    expect(orbitalLifetimeYears(550, 250)).toBeGreaterThan(4);
    expect(orbitalLifetimeYears(550, 250)).toBeLessThan(12); // ~7.5 yr
  });

  it("lifetime is monotonic in altitude and scales with mass (β = A/m)", () => {
    expect(orbitalLifetimeYears(550, 250)).toBeGreaterThan(orbitalLifetimeYears(400, 250));
    // Heavier object (lower area-to-mass) lives longer at the same altitude.
    expect(orbitalLifetimeYears(550, 1000)).toBeGreaterThan(orbitalLifetimeYears(550, 250));
  });

  it("atmosphere density equals the table value at a band base and decreases with altitude", () => {
    expect(atmosphereDensity(400)).toBeCloseTo(3.725e-12, 15); // band base, exp(0)=1
    expect(atmosphereDensity(150)).toBeCloseTo(2.07e-9, 12);
    for (const [lo, hi] of [[300, 400], [400, 500], [500, 700], [700, 1000]]) {
      expect(atmosphereDensity(lo)).toBeGreaterThan(atmosphereDensity(hi));
    }
  });
});
