# OrbitAI — Physics Reference & Verification Notes

This document states, as exactly as the code allows, the physics behind OrbitAI:
how satellites are propagated, how a launch is planned and inserted into orbit,
and how the traffic / risk / lifetime numbers are derived. It is written so a
domain expert (astrodynamics / spaceflight) can verify each model and flag what
should be tightened.

Each section is tagged:

- **[EXACT]** — standard, defensible model; differences from truth are bounded and stated.
- **[FIXED]** — was wrong/inconsistent, corrected in this pass (see *Change log* at the end).
- **[HEURISTIC]** — a demo-grade approximation that produces plausible but **not trustworthy** numbers. Flagged for expert review / replacement.
- **[SIMPLIFICATION]** — a deliberate, acceptable reduction in fidelity, with the cost stated.
- **[MISSING]** — physics a real tool would include that this app does not model at all.

Symbols: `μ` = Earth gravitational parameter, `Rₑ` = Earth equatorial radius,
`a` = semi-major axis, `e` = eccentricity, `i` = inclination, `Ω` = right
ascension of ascending node (RAAN), `ω` = argument of perigee, `M` = mean
anomaly, `ν` = true anomaly, `n` = mean motion, `J₂` = Earth oblateness
coefficient, `p = a(1−e²)` = semi-latus rectum.

---

## 0. Constants

| Constant | Value | Used where | Source |
|---|---|---|---|
| μ | 398600.8 km³/s² | propagation, vis-viva, SSO | WGS-72 (matches SGP4 in satellite.js) |
| Rₑ (equatorial) | 6378.137 km | altitude ↔ a, SSO | WGS-84 (SGP4 uses 6378.135; 2 m difference is negligible) |
| Rₑ (mean) | 6371 km | **rendering scale only** | scene units (1 unit = 1 mean radius) |
| J₂ | 1.08262668×10⁻³ | SSO inclination | EGM/WGS standard |
| Sidereal node-sync rate | 1.99096×10⁻⁷ rad/s | SSO | 360°/365.2422 d |

> **Note for review:** propagation uses WGS-72 μ and Rₑ (because SGP4 is defined
> in WGS-72), while altitude bookkeeping uses the WGS-84 equatorial radius. The
> two equatorial radii differ by 2 m, far below the propagation error band, so
> they are treated as interchangeable. This is intentional; flag if you disagree.

---

## 1. Coordinate frames & time **[EXACT]**

- **ECI** (Earth-Centered Inertial): x → vernal equinox, z → north pole. All
  orbital math is done here.
- **Scene** (three.js, y-up): the map `(x, y, z)_ECI → (x, z, −y)_scene`, scaled
  by `1/6371 km⁻¹`. This is a pure rotation+scale; it carries no physics.
- **GMST** (Greenwich Mean Sidereal Time): IAU-1982 polynomial in Julian
  centuries from J2000. Used to place ground sites and to spin the Earth texture.
  Good to sub-arcsecond over the demo's time span.
- **Sub-solar point / terminator**: low-precision solar ephemeris (Astronomical
  Almanac series), accurate to ~0.01°. Lighting only.

**[SIMPLIFICATION]** Ground sites are placed using **geocentric** latitude on a
sphere, i.e. geodetic latitude is treated as geocentric. The geodetic–geocentric
difference peaks at ~0.19° near 45° latitude (≈ 21 km of surface position). This
affects only the launch-pad direction used to seed the ascent cinematic and the
RAAN that makes the orbit plane pass over the pad; it does not affect catalog
satellites. Acceptable for visualization; note it exists.

---

## 2. Satellite propagation — "SGP4-secular" **[EXACT, bounded]**

Every catalog object and every launched satellite is initialized from a TLE
through **real SGP4 initialization** (`satellite.js` `twoline2satrec`): Kozai →
Brouwer mean-motion recovery, and the J₂ secular rates. We then propagate with a
**closed-form secular + first-order-drag** model (no SGP4 short-period terms):

```
a(t)  = a₀ · tempa²,          tempa = clamp(1 − C₁·Δt, 0.4, 1.6)
M(t)  = M₀ + Ṁ·Δt + (n·t2cof)·Δt²
Ω(t)  = Ω₀ + Ω̇·Δt + nodecf·Δt²
ω(t)  = ω₀ + ω̇·Δt
```

with `Δt = t − epoch`. Ṁ, Ω̇, ω̇ are the SGP4 J₂ secular rates; `C₁`, `t2cof`,
`nodecf` are the SGP4 drag coefficients. Position then comes from the standard
Kepler pipeline: solve `M = E − e·sin E` (Newton, 8 iterations), get `ν`, radius
`r = a(1 − e·cos E)`, argument of latitude `u = ω + ν`, then rotate by `Ω, i`
into ECI. Speed for the panel uses **vis-viva**, `v = √(μ(2/r − 1/a))`. **[EXACT]**

The same closed form runs in the vertex shader and on the CPU, so the rendered
point, the orbit trail, and the panel numbers always agree.

**What is intentionally dropped vs. full SGP4:**

- **[SIMPLIFICATION]** SGP4 **short-period periodic** terms (the ~½-orbit
  oscillations in a, e, i, Ω, ω). This is the dominant error: a bounded
  **~5–15 km** position oscillation that does **not** grow with time. (Contrast
  with a two-body propagation, which would drift tens of km/day.)
- **[SIMPLIFICATION]** Higher-order drag (`C₂…C₅`, `D₂…D₄`, `t3cof`, `t4cof`,
  `t5cof`). Only the first-order `C₁` decay on `a` and `t2cof` on `M` are kept.
  Fine for low-drag LEO over hours–days; degrades for very high-drag objects.
- **[MISSING]** Deep-space (SDP4) physics: lunisolar periodics and Earth
  resonance for orbits with period ≥ 225 min (Molniya, GEO, GTO). These objects
  propagate with only their secular rates and will be wrong in phase over days.
- **[MISSING] Atmospheric reentry / decay-out.** `tempa` is clamped at 0.4, so a
  high-drag object's semi-major axis is artificially floored instead of decaying
  into the atmosphere. Nothing is ever removed for reentry.

> **Verification ask:** confirm the 5–15 km short-period band is an acceptable
> claim for the LEO population, and that floor-clamping decayed objects (rather
> than removing them) is acceptable for the demo's purposes.

---

## 3. Sun-synchronous inclination **[FIXED]**

A sun-synchronous orbit (SSO) requires the RAAN to regress at exactly the rate
the mean Sun moves along the ecliptic, **+360°/365.2422 d = +1.99096×10⁻⁷ rad/s**,
so the orbit plane holds a fixed mean local solar time. Setting the J₂ secular
nodal rate equal to that:

```
Ω̇ = −(3/2) · n · J₂ · (Rₑ/p)² · cos i  =  +1.99096×10⁻⁷ rad/s
```

solved for inclination (circular, `p = a = Rₑ + h`):

```
cos i = −Ω̇_sun / [ (3/2) · n · J₂ · (Rₑ/p)² ],   n = √(μ/a³)
```

This is implemented in `sunSyncInclinationDeg(altitudeKm)` and produces:

| Altitude | This model | Published | Old linear fit `96.6 + 0.00185·h` |
|---|---|---|---|
| 400 km | 97.03° | ~97.0° | 97.34° |
| 550 km | 97.59° | ~97.6° | 97.62° |
| 800 km | 98.60° | ~98.6° | 98.08° |
| 1000 km | 99.48° | ~99.5° | 98.45° |

**Why it was wrong before:** the previous code used a hard-coded linear fit that
is only accurate near 550 km and drifts up to **~1.6°** by 1200 km — enough to
break the sun-synchronous condition entirely. The new value is exact to first
order in J₂ (the dominant term; higher zonal harmonics shift it by < 0.05°).

> **Verification ask:** confirm μ, J₂, Rₑ choices and that first-order J₂ is
> adequate (J₄ contributes < 0.05° and is omitted).

---

## 4. Altitude ↔ semi-major-axis convention **[FIXED]**

Orbital elements reference the **equatorial** radius. Altitude must therefore be

```
altitude = a − Rₑ(equatorial = 6378.137 km)
```

Previously the code subtracted the **mean** radius (6371 km) while `a` had been
recovered against the equatorial radius — a systematic **+7 km bias** on every
displayed altitude, apogee, and perigee, and on the target `a` for planned
orbits. Ironically that 7 km is the same size as the propagation error band the
app advertises. Now fixed consistently in launch planning, traffic analysis,
altitude changes, and the inspector panel. The 6371 km constant is retained
**only** as the rendering scale.

**[SIMPLIFICATION]** Instantaneous altitude in the inspector is `r − Rₑ` using
the equatorial radius regardless of latitude (i.e. altitude above a sphere, not
above the ellipsoid). Over the poles this overstates altitude by up to ~21 km.
Mean / apogee / perigee altitudes are likewise "above equatorial radius."

---

## 5. Launch geometry & orbit insertion

### 5.1 Plane targeting **[EXACT, with one guard]**

Given a launch site at geocentric latitude `φ` and a target inclination `i`, the
orbit plane that passes over the site has argument of latitude `u₀` at the
overflight given by the spherical-triangle relation:

```
sin φ = sin i · sin u₀        ⟹   u₀ = asin( sin φ / sin i )
```

and the RAAN is placed so the ascending node leads the site longitude by the
in-plane offset:

```
Ω = λ_site(ECI) − atan2( cos i · sin u₀,  cos u₀ )
```

The satellite is released `downrange = 10°` past `u₀`. With `e ≈ 0` (a near-
circular `e = 5×10⁻⁴` is used so the synthesized TLE is well-conditioned),
`M ≈ ν ≈ u`. This geometry is correct.

### 5.2 The inclination ≥ latitude constraint & launch azimuth **[FIXED — surfaced]**

A direct launch **cannot** reach an inclination lower than the launch site's
latitude — you can only inject into a plane that contains the launch point.
`sin φ / sin i > 1` when `i < φ`. `launchGeometry()` (`orbit.ts`) now computes:

```
minInclination = |φ|                         (lowest reachable directly)
feasible       = |cos i / cos φ| ≤ 1   ⟺   |φ| ≤ i ≤ 180° − |φ|
launch azimuth: sin(Az) = cos i / cos φ       (inertial heading, 0°=N, 90°=E)
```

The mission panel shows the launch azimuth (e.g. ISS-class 51.6° from Cape
Canaveral → 45° NE; 550 km SSO from Vandenberg → ~351°, i.e. near-north
retrograde) and, when `i < φ`, an explicit warning that a direct ascent can't
reach the requested inclination and a **dogleg or on-orbit plane change** would
be required. The propagation still clamps internally so the cinematic runs, but
the user is no longer misled about feasibility.

- **[SIMPLIFICATION]** The reported azimuth is the **inertial** heading and uses
  the modeled **northbound (ascending)** pass. Real sites often fly the
  descending pass (e.g. Vandenberg launches SSO southward, ~190°) for range-
  safety reasons; the southbound azimuth is `180° − Az`. The Earth-rotation
  correction between inertial and ground-relative azimuth (a few degrees) is not
  applied.
- **[MISSING]** The payload/Δv penalty of a dogleg is described but not costed.

### 5.3 Launch energetics / Δv **[MISSING]**

There is **no** Δv budget, rocket equation, staging, gravity-turn, or
payload-to-orbit calculation anywhere. A launch always "succeeds" and inserts a
perfectly circular orbit. Notably absent:

- Ideal LEO Δv ≈ **9.3–9.5 km/s** (orbital speed ~7.6 km/s + gravity & drag
  losses ~1.5–2 km/s).
- **Eastward launch assist** from Earth's rotation: `465·cos φ m/s` at the
  equator, falling to zero at the poles, and **negative** for retrograde/SSO
  launches. This is exactly why equatorial eastward launches are cheapest and
  why SSO (retrograde) pays a penalty.
- The orbital velocity at insertion (≈ √(μ/a) ≈ 7.6 km/s at 550 km) is not even
  displayed, though vis-viva is already implemented and could show it.

### 5.4 Ascent trajectory **[SIMPLIFICATION — cosmetic]**

The rocket's path from pad to insertion is an **aesthetic** curve (a radial
climb that eases downrange via quaternion slerp), not an integrated trajectory.
It is explicitly cinematic and carries no physics. Acceptable as long as it is
not read as a real ascent profile.

### 5.5 Altitude change after recommendation **[HEURISTIC — known inconsistency]**

Accepting a recommended altitude calls `changeAltitude`, which rebuilds the
orbit at the new `a` but **keeps the existing inclination**. For an SSO, the
panel label updates to the new sun-synchronous inclination, but the propagated
orbit's inclination is **not** changed to match — so the displayed and actual
inclinations diverge after a move, and the orbit is no longer truly
sun-synchronous. Also, an altitude change is modeled as instantaneous and
**free** (no Δv, no transfer ellipse / Hohmann two-burn).

> **Verification ask / open bug:** should `changeAltitude` also re-target
> inclination for SSO, and should the maneuver cost be surfaced?

---

## 6. Drag, ballistic coefficient & lifetime

### 6.1 B\* estimate **[SIMPLIFICATION]**

A launched satellite's drag is seeded from a ballistic estimate:

```
A   = (m/100)^(2/3)  m²         (cube-scaling cross-section guess)
B*  = ρ₀ · C_d · A / (2m),      C_d = 2.2,  ρ₀ = 0.157 kg·m⁻²·Rₑ⁻¹
```

`ρ₀ = 0.157` and `C_d = 2.2` are the standard SGP4 reference values, so the B\*
**formula** is correct. The weak link is the **area-from-mass** guess `A =
(m/100)^(2/3)`, which is a crude stand-in for an unknown spacecraft geometry.
This area law (`dragAreaM2`) and `C_d = 2.2` (`DRAG_CD`) now live in `decay.ts`
and are shared by both the B\* estimate and the lifetime model, so the two use
identical ballistic assumptions.

### 6.2 Orbital lifetime **[FIXED — physics-based, static atmosphere]**

The previous "expected lifetime" was a hand-tuned curve
(`min(100, 0.0008·exp(alt/62))·(m/250)^0.3`) with no physical basis. It is
replaced by the **King-Hele** first-order result for a circular orbit in an
exponential atmosphere (`orbitalLifetimeYears` in `decay.ts`). Per revolution
`Δa = −2π (C_d A/m) ρ(a) a²`, so

```
da/dt = −(C_d A/m) · ρ(a) · √(μ a)
```

and because density rises exponentially as the orbit sinks, the lifetime
integral `∫ da / |da/dt|` is dominated by the starting altitude:

```
L ≈ H / |da/dt|_start = H / [ (C_d A/m) · ρ(h₀) · √(μ a₀) ]
```

Density `ρ(h)` is **Vallado's piecewise-exponential atmosphere** (Fundamentals
of Astrodynamics, Table 8-4 / CIRA-72): `ρ = ρ₀·exp(−(h−h₀)/H)` from the
bracketing 150–1000 km band. Sample outputs (250 kg):

| Altitude | Lifetime |
|---|---|
| 200 km | ~0.01 yr (days) |
| 300 km | ~0.08 yr (weeks) |
| 400 km | ~0.6 yr |
| 550 km | ~7.5 yr |
| 700 km | ~90 yr |
| ≥ 800 km | capped at 200 yr ("effectively stable") |

Mass scales it correctly through the area-to-mass ratio (e.g. 1000 kg at 550 km
→ ~12 yr vs ~7.5 yr at 250 kg).

> **Remaining caveat for review:** this is a **static nominal atmosphere**. It
> does **not** model the ~10–100× thermospheric density swing over the 11-year
> solar cycle (F10.7 / geomagnetic activity), which is the dominant real-world
> uncertainty in decay lifetime. Treat the figure as an order-of-decade estimate,
> not a prediction. A drop-in upgrade would sample NRLMSISE-00 / JB2008 at a
> chosen solar-activity level in place of the static table. The 200 yr cap marks
> the altitude band where drag ceases to be the governing perturbation.

### 6.3 Ground revisit **[HEURISTIC]**

```
revisitHours = (24/3.6) · (550/altitude)
```

A made-up scaling, not tied to swath width, field of view, or the actual ground-
track repeat cycle. Order-of-magnitude only. A real value comes from the
ground-track repeat condition (orbits-per-day rational with the nodal day) and
the sensor swath.

---

## 7. Traffic & collision risk

### 7.1 Proximity ("live range") **[EXACT]**

The closest-approach distances shown are real: both satellites are propagated to
the same instant, and the Euclidean distance between their ECI positions is
reported in km. This part is trustworthy (within the §2 propagation band).

### 7.2 Neighborhood counts **[SIMPLIFICATION]**

"Satellites within ±20 km altitude" and "within ±2° inclination" are exact
counts against those thresholds. They are reasonable congestion proxies but are
**mean-element band counts**, not conjunction geometry: two objects can share a
mean altitude yet never approach (different RAAN/phase), and objects in eccentric
orbits cross the band only briefly.

### 7.3 Conjunctions per year & collision risk **[HEURISTIC — not physical]**

```
estConjunctionsPerYear = round( (co-altitude count) · 1.4 )
density  = HIGH ≥600,  MEDIUM ≥120,  LOW otherwise   (band counts)
collisionRisk: LLM maps density → {Low, Moderate, High}
```

The `×1.4` factor is dimensionless and arbitrary; this is **not** a conjunction
rate. A real estimate needs the **kinetic-gas / Kessler** flux form:

```
collision rate ≈ ρ_spatial · A_cross · v_rel  (integrated over the encountered population)
```

i.e. spatial density of objects, mutual cross-sectional area, and **relative
velocity** (which in LEO ranges from ~0 for co-planar same-direction passes up
to ~15 km/s for head-on crossing-plane encounters — the relative-velocity
distribution is the crux and is entirely absent here). Per-conjunction risk
would then come from a miss-distance / covariance model (e.g. Foster's `Pc`).

> **Verification ask:** the conjunction count and the Low/Moderate/High label are
> demo storytelling, not screening output. They should be relabeled as a
> congestion *index* or replaced with a flux-based estimate before being read as
> collision probability.

---

## 8. Summary — what to trust, what not to

| Quantity | Status | Trust level |
|---|---|---|
| Satellite positions / velocities | [EXACT, ±5–15 km] | High (LEO, short span) |
| Deep-space objects (Molniya/GEO/GTO) | [MISSING SDP4] | Low over days |
| Reentry / orbital decay-out | [MISSING] | Not modeled |
| Sun-synchronous inclination | [FIXED] | High |
| Altitude / apogee / perigee | [FIXED] | High |
| Orbit-plane targeting over a pad | [EXACT] | High |
| `i < latitude` feasibility / azimuth | [FIXED] | Surfaced; inertial/northbound |
| Launch Δv / payload / energetics | [MISSING] | Not modeled |
| Ascent trajectory | [SIMPLIFICATION] | Cosmetic only |
| B\* drag coefficient | [SIMPLIFICATION] | Form correct, area guessed |
| Orbital lifetime | [FIXED] | Physics-based; static atmosphere |
| Ground revisit | [HEURISTIC] | Order-of-magnitude |
| Live closest-approach range | [EXACT] | High |
| Band counts (±20 km / ±2°) | [SIMPLIFICATION] | Counts exact, geometry coarse |
| Conjunctions/yr, collision risk | [HEURISTIC] | Not a probability |

---

## Change log (this pass)

Corrected:

1. **Sun-synchronous inclination** — replaced the `96.6 + 0.00185·altitude`
   linear fit with the exact J₂ nodal-precession condition
   (`sunSyncInclinationDeg` in `src/lib/constants.ts`); applied in
   `parse-mission` and on accept-recommendation. (§3)
2. **Altitude reference radius** — altitude ↔ semi-major-axis now consistently
   uses the equatorial radius (6378.137 km) instead of the mean radius
   (6371 km), removing a +7 km bias in `orbit.ts`, `analysis.ts`, `catalog.ts`,
   `tle.ts`, and the inspector panel. The 6371 km constant is now used only as
   the rendering scale. (§4)
3. **Launch azimuth & `i < latitude` feasibility** — `launchGeometry()` computes
   the inertial launch azimuth and the minimum reachable inclination; the mission
   panel shows the azimuth and warns when a direct ascent is infeasible. (§5.2)
4. **Physics-based orbital lifetime** — replaced the hand-tuned curve with a
   King-Hele decay model over Vallado's exponential atmosphere, sharing the
   ballistic assumptions with the B\* estimate (`decay.ts`). (§6.2)

Documented but **not** changed (need expert input / larger work):

- SDP4 deep-space periodics; reentry handling (§2)
- Δv / energetics / Earth-rotation assist; dogleg cost (§5.3, §5.2)
- SSO inclination not re-targeted on altitude change (§5.5)
- Solar-activity-dependent atmosphere for lifetime (§6.2)
- Flux-based conjunction / collision model (§7.3)
