// Real two-line element sets captured from CelesTrak on 2026-06-18 (epoch day
// 169 of 2026). They are the ground truth for the propagation tests and span
// the four orbital regimes the engine must handle. Provenance is kept inline so
// an expert can re-fetch and confirm.
//
//   curl "https://celestrak.org/NORAD/elements/gp.php?CATNR=<id>&FORMAT=tle"
//
// These are *fixed* anchors. The live test (tests/live.test.ts) re-fetches the
// current element set for the same NORAD id and measures how far this captured
// set drifts from the latest truth — a real historical->present prediction.

export interface TleFixture {
  name: string;
  noradId: number;
  regime: "LEO" | "SSO" | "GEO" | "MEO-deep";
  /** Approx semi-major axis (km) and period (min) for quick reference. */
  approxAltKm: number;
  line1: string;
  line2: string;
}

export const ISS: TleFixture = {
  name: "ISS (ZARYA)",
  noradId: 25544,
  regime: "LEO",
  approxAltKm: 419,
  line1: "1 25544U 98067A   26169.80206886  .00008155  00000+0  15439-3 0  9995",
  line2: "2 25544  51.6331 292.1003 0004666 202.2920 157.7867 15.49302471572008",
};

export const SENTINEL_2A: TleFixture = {
  name: "SENTINEL-2A",
  noradId: 40697,
  regime: "SSO",
  approxAltKm: 786,
  line1: "1 40697U 15028A   26169.96294524  .00000013  00000+0  21463-4 0  9990",
  line2: "2 40697  98.5684 244.7894 0001119  93.7311 266.4000 14.30815491573988",
};

export const GOES_16: TleFixture = {
  name: "GOES 16",
  noradId: 41866,
  regime: "GEO",
  approxAltKm: 35788,
  line1: "1 41866U 16071A   26169.87419625 -.00000097  00000+0  00000+0 0  9991",
  line2: "2 41866   0.3465  85.5116 0000260 324.3444  67.2656  1.00271194 35121",
};

export const YZ1_RB: TleFixture = {
  name: "YZ-1 R/B",
  noradId: 44866,
  regime: "MEO-deep",
  approxAltKm: 22343,
  line1: "1 44866U 19090C   26169.43514686 -.00000051  00000+0  00000+0 0  9993",
  line2: "2 44866  56.3850  69.4938 0071787  40.4909 320.0740  1.78364068 42399",
};

export const ALL_FIXTURES = [ISS, SENTINEL_2A, GOES_16, YZ1_RB];
