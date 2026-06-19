// ── Live validation against the CelesTrak API (ask #1, "verify the latest data") ──
//
// This is the historical→present check the brief asks for:
//   1. take a *historical* element set (the checked-in fixture, captured earlier),
//   2. propagate it forward with the engine to the epoch of the *latest* element
//      set fetched live from CelesTrak,
//   3. assert the predicted position is within an age-scaled error bar of the
//      truth, and separately re-confirm the engine reproduces the FRESH SGP4 to
//      within the §2 band (a network-independent regression guard on fresh data).
//
// It is OPT-IN — set RUN_LIVE_TESTS=1 — because it hits the network and is
// non-deterministic; the default `pnpm test` stays green offline/CI. If the fetch
// fails at runtime the individual case is skipped (not failed) so a flaky network
// never turns the suite red.
//
//   RUN_LIVE_TESTS=1 pnpm vitest run tests/live.test.ts
//
// WHAT THE ERROR BAR MEANS: this measures real TLE *prediction* skill, which is
// dominated by un-modelled atmospheric drag variation — NOT the engine's
// short-period band. For LEO a propagated TLE typically drifts on the order of a
// few to tens of km/day along-track, so we allow base + slope·age_days and log
// the actual number for expert inspection rather than asserting a tight bound.

import { describe, expect, it } from "vitest";
import { elementsFromTle, positionEciKm } from "@/lib/sim/kepler";
import { ISS, SENTINEL_2A, type TleFixture } from "./fixtures/realTles";
import { distanceKm, epochMsFromSatrec, satrecFromTle, sgp4PositionEciKm } from "./oracle";

const LIVE = process.env.RUN_LIVE_TESTS === "1";
const DAY_MS = 86400000;

async function fetchLatestTle(noradId: number): Promise<[string, string] | null> {
  try {
    const res = await fetch(
      `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=tle`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) return null;
    const lines = (await res.text()).trim().split(/\r?\n/);
    const l1 = lines.find((l) => l.startsWith("1 "));
    const l2 = lines.find((l) => l.startsWith("2 "));
    return l1 && l2 ? [l1, l2] : null;
  } catch {
    return null;
  }
}

// LEO/SSO predictive budget: a generous, documented envelope (see header).
function predictionBudgetKm(ageDays: number): number {
  return 25 + 12 * Math.max(0, ageDays);
}

describe.skipIf(!LIVE)("live CelesTrak validation", () => {
  for (const fixture of [ISS, SENTINEL_2A] as TleFixture[]) {
    it(`${fixture.name}: fixture propagated to the latest epoch stays within the error bar`, async (ctx) => {
      const latest = await fetchLatestTle(fixture.noradId);
      if (!latest) return ctx.skip(); // no network / object not served right now

      const liveRec = satrecFromTle(latest[0], latest[1]);
      const liveEpoch = epochMsFromSatrec(liveRec);
      const fixtureEl = elementsFromTle(fixture.line1, fixture.line2)!;
      const ageDays = (liveEpoch - fixtureEl.epochMs) / DAY_MS;

      // (1) historical fixture → present: predicted vs. live SGP4 truth.
      const truth = sgp4PositionEciKm(liveRec, liveEpoch)!;
      const predicted = positionEciKm(fixtureEl, liveEpoch, [0, 0, 0]);
      const predErr = distanceKm(truth, predicted);

      // (2) engine vs. FRESH SGP4 at the same instant — must hold the §2 band.
      const freshEl = elementsFromTle(latest[0], latest[1])!;
      const freshErr = distanceKm(truth, positionEciKm(freshEl, liveEpoch, [0, 0, 0]));

      const budget = predictionBudgetKm(ageDays);
      console.log(
        `[live] ${fixture.name}: age=${ageDays.toFixed(2)}d  ` +
          `prediction err=${predErr.toFixed(1)}km (budget ${budget.toFixed(0)}km)  ` +
          `fresh-SGP4 err=${freshErr.toFixed(1)}km`,
      );

      expect(ageDays).toBeGreaterThanOrEqual(-0.01); // live epoch is at/after the fixture
      expect(predErr).toBeLessThan(budget);
      expect(freshErr).toBeLessThan(30); // §2 band, network-independent
    });
  }
});

// Make the file non-empty / self-describing when live tests are off.
describe("live validation (gated)", () => {
  it.skipIf(LIVE)("is skipped unless RUN_LIVE_TESTS=1", () => {
    expect(LIVE).toBe(false);
  });
});
