// Orbital decay & lifetime for circular LEO orbits.
//
// King-Hele first-order result for a circular orbit in an exponential
// atmosphere. Drag removes Δa = -2π (Cd·A/m) ρ a² per revolution, so
//     da/dt = -(Cd·A/m) · ρ(a) · √(μ a)
// and because density rises exponentially as the orbit sinks, the lifetime
// integral ∫ da / |da/dt| is dominated by the starting altitude, giving
//     L ≈ H / |da/dt|_start = H / [ (Cd·A/m) · ρ(h0) · √(μ a0) ]
// where H is the local atmospheric scale height.
//
// Density is Vallado's piecewise-exponential atmosphere (Fundamentals of
// Astrodynamics, Table 8-4 / CIRA-72): ρ(h) = ρ0·exp(-(h-h0)/H) from the
// bracketing band. This is a STATIC nominal atmosphere — it does NOT capture
// the ~10-100x thermospheric swing over the 11-year solar cycle, which is the
// dominant real-world uncertainty. Treat the output as an order-of-decade
// estimate, not a prediction.

const MU_M3S2 = 3.986004418e14; // m^3/s^2
const RE_M = 6378137; // m, equatorial radius
const LIFETIME_CAP_YEARS = 200; // above ~800 km drag is negligible; report "effectively stable"

export const DRAG_CD = 2.2; // standard free-molecular drag coefficient

// Cross-section guess from a cube-scaling law. Single source of truth shared
// with estimateBstar() so the ballistic assumptions stay consistent.
export function dragAreaM2(massKg: number): number {
  return Math.pow(Math.max(1, massKg) / 100, 2 / 3);
}

// Vallado exponential atmosphere bands: [base altitude km, nominal density kg/m^3, scale height km].
const ATMOSPHERE: [number, number, number][] = [
  [150, 2.07e-9, 22.523],
  [180, 5.464e-10, 29.74],
  [200, 2.789e-10, 37.105],
  [250, 7.248e-11, 45.546],
  [300, 2.418e-11, 53.628],
  [350, 9.518e-12, 53.298],
  [400, 3.725e-12, 58.515],
  [450, 1.585e-12, 60.828],
  [500, 6.967e-13, 63.822],
  [600, 1.454e-13, 71.835],
  [700, 3.614e-14, 88.667],
  [800, 1.17e-14, 124.64],
  [900, 5.245e-15, 181.05],
  [1000, 3.019e-15, 268.0],
];

function atmosphereBand(altitudeKm: number): [number, number, number] {
  let band = ATMOSPHERE[0];
  for (const b of ATMOSPHERE) {
    if (altitudeKm >= b[0]) band = b;
    else break;
  }
  return band;
}

// Nominal atmospheric density at altitude, kg/m^3.
export function atmosphereDensity(altitudeKm: number): number {
  const [h0, rho0, H] = atmosphereBand(altitudeKm);
  return rho0 * Math.exp(-(altitudeKm - h0) / H);
}

// Estimated decay lifetime (years) for a circular orbit at the given altitude.
export function orbitalLifetimeYears(altitudeKm: number, massKg: number): number {
  const [, , H] = atmosphereBand(altitudeKm);
  const ballistic = (DRAG_CD * dragAreaM2(massKg)) / Math.max(1, massKg); // Cd·A/m, m^2/kg
  const a0 = RE_M + altitudeKm * 1000; // m
  const rho = atmosphereDensity(altitudeKm); // kg/m^3
  const dadt = ballistic * rho * Math.sqrt(MU_M3S2 * a0); // m/s
  const lifeSeconds = (H * 1000) / dadt;
  const lifeYears = lifeSeconds / (365.25 * 86400);
  return Math.min(LIFETIME_CAP_YEARS, lifeYears);
}
