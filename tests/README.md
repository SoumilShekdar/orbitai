# Physics engine test suite

Verifies the orbital physics in `src/lib/sim/`, `src/lib/mission/`, and
`src/lib/sun.ts` against (a) the **full SGP4** reference implementation in
`satellite.js` and (b) the **live CelesTrak API**. The suite is built so an
astrodynamics reviewer can check the *calculations*, not just that tests pass:
every block names the equation, its source, the expected value, and why the
tolerance is what it is, and maps 1:1 to a numbered section of
[`docs/PHYSICS.md`](../docs/PHYSICS.md).

## Running

```bash
pnpm test            # deterministic, offline — 41 checks
pnpm test:watch      # vitest watch mode
pnpm test:live       # opt-in: hits the CelesTrak API (network required)
```

`pnpm test` never touches the network and is safe for CI. The live checks only
run with `RUN_LIVE_TESTS=1`, and individual cases *skip* (not fail) if the fetch
errors, so a flaky network never reds the suite.

## The two things the brief asked for

### 1. Historical propagation verified against the latest data, within error bars

There are two complementary forms, because they measure different errors:

| File | What it compares | Error bar | Meaning |
|---|---|---|---|
| `propagation.test.ts` | engine vs **full SGP4** from the *same* TLE, over 48 h | **< 30 km**, and non-growing | Pure model error: the short-period terms the engine drops (`docs/PHYSICS.md §2`). Deterministic, offline. |
| `live.test.ts` | a checked-in *historical* TLE propagated forward vs the **latest** TLE fetched live | `25 + 12·age_days` km | Real-world *prediction* skill: dominated by un-modelled atmospheric drag, not the engine. |

The distinction matters: the §2 band (~5–15 km) is what the engine costs you
versus a perfect SGP4 at the *same epoch*. The live forecast error is larger and
grows with the age of the element set because real drag is not in any analytic
TLE — so its budget is age-scaled and the actual number is logged for inspection:

```
[live] ISS (ZARYA): age=0.00d  prediction err=11.7km (budget 25km)  fresh-SGP4 err=11.7km
```

`age=0.00d` right after the fixtures are captured (so prediction err ≈ the §2
band); as days pass the live epoch advances and it becomes a true multi-day
forecast check.

Empirically measured engine-vs-SGP4 maxima on the captured fixtures (2026-06-18):
**LEO ~12 km · SSO ~16 km · GEO ~17 km · MEO-deep ~16 km over 48 h**, bounded and
non-growing — the 30 km ceiling is ~2× headroom.

### 2. Expert verification of the calculations

`analytic.test.ts` and `traffic.test.ts` are closed-form checks, each tagged with
its `docs/PHYSICS.md` section:

| Section | Checks |
|---|---|
| §0 Constants | μ (WGS-72), equatorial vs mean radius (+7 km bias guard), J₂ |
| §1 Time & frames | GMST at J2000 (= 99.9678°), sidereal day rate, Julian date, ECI→scene map, solar declination ≤ 23.5° |
| §2 Kepler pipeline | vis-viva speed, radii within [perigee, apogee], **angular-momentum conservation** `|h| = √(μ·a(1−e²))`, drag-factor clamp [0.4, 1.6] |
| §3 Sun-sync inclination | J₂ nodal-precession table: 400→97.03°, 550→97.59°, 800→98.60°, 1000→99.48° (±0.05°) |
| §5 Launch geometry | i ≥ \|latitude\| feasibility, azimuth `sin Az = cos i / cos φ` (Cape 51.6°→~45°, Vandenberg SSO→~351°), plane-targeting sub-latitude |
| §6 Drag & lifetime | cube-scaling area law, B* sign/mass-scaling, King-Hele lifetime table, atmosphere density at band bases & monotonicity |
| §7 Traffic | exact ±20 km / ±2° band counts, conjunction index = `round(count·1.4)` (a band-count function, **not** a probability), density-label thresholds |

## Files

```
vitest.config.ts        # @/ alias + node env
tests/
  fixtures/realTles.ts  # real TLEs (ISS, Sentinel-2A, GOES-16, YZ-1 R/B) w/ provenance
  oracle.ts             # satellite.js full-SGP4 reference + ECI diff helpers
  propagation.test.ts   # §2 engine vs SGP4 error band (offline)
  analytic.test.ts      # §0/§1/§2/§3/§5/§6 closed-form checks
  traffic.test.ts       # §7 band counts & congestion index
  live.test.ts          # §"via API" historical→latest validation (opt-in)
```

## Known caveats the suite intentionally encodes

- The conjunction count and LOW/MEDIUM/HIGH label are a **congestion index**, not
  a collision probability (`§7.3`). The test pins the exact `×1.4` arithmetic to
  make that explicit.
- Deep-space objects (GEO/Molniya/GTO) hold the band over ~2 days but drift over
  longer spans (no SDP4 lunisolar/resonance terms). The 48 h window is chosen to
  stay inside that validity envelope.
- Lifetimes are order-of-decade (static atmosphere, no solar-cycle density swing),
  so those bounds are deliberately wide brackets, not tight equalities.
