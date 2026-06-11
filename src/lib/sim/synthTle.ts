// Synthesizes a TLE for satellites launched in the demo so they flow through
// the exact same SGP4 initialization (kepler.ts) as the real catalog: same
// J2 secular rates, same B*-drag evolution, same propagation everywhere.

import { Elements, elementsFromTle, MU } from "./kepler";

const DEG = 180 / Math.PI;
const RE_KM = 6378.135;

function checksum(line: string): number {
  let sum = 0;
  for (const ch of line) {
    if (ch >= "0" && ch <= "9") sum += ch.charCodeAt(0) - 48;
    else if (ch === "-") sum += 1;
  }
  return sum % 10;
}

// TLE "assumed decimal point" exponent field, e.g. 3.0277e-4 -> " 30277-3".
function formatBstar(b: number): string {
  if (b === 0 || !isFinite(b)) return " 00000+0";
  const sign = b < 0 ? "-" : " ";
  let exp = Math.ceil(Math.log10(Math.abs(b)) + 1e-12);
  let mant = Math.abs(b) / 10 ** exp;
  if (mant >= 1) {
    mant /= 10;
    exp += 1;
  }
  const digits = Math.round(mant * 1e5)
    .toString()
    .padStart(5, "0");
  const expStr = exp < 0 ? `-${-exp}` : `+${exp}`;
  return `${sign}${digits}${expStr}`;
}

// Epoch field "YYDDD.DDDDDDDD" (UTC day-of-year with fraction).
function formatEpoch(epochMs: number): string {
  const d = new Date(epochMs);
  const year = d.getUTCFullYear();
  const dayFrac = 1 + (epochMs - Date.UTC(year, 0, 1)) / 86400000;
  const yy = String(year % 100).padStart(2, "0");
  return `${yy}${dayFrac.toFixed(8).padStart(12, "0")}`;
}

const angle = (rad: number) => {
  const deg = ((rad * DEG) % 360 + 360) % 360;
  return deg.toFixed(4).padStart(8, " ");
};

export interface SynthOrbit {
  noradId: number;
  epochMs: number;
  incRad: number;
  raanRad: number;
  e: number;
  argpRad: number;
  mRad: number;
  aKm: number; // target Brouwer semi-major axis
  bstar: number;
}

export function synthesizeTleLines(o: SynthOrbit, meanMotionRevDay: number): [string, string] {
  const num = String(o.noradId).padStart(5, "0").slice(-5);
  const body1 =
    `1 ${num}U 26001A   ${formatEpoch(o.epochMs)}  .00000000  00000+0 ` +
    `${formatBstar(o.bstar)} 0    0`;
  const ecc = Math.round(Math.min(0.9999999, Math.max(0, o.e)) * 1e7)
    .toString()
    .padStart(7, "0");
  const body2 =
    `2 ${num} ${angle(o.incRad)} ${angle(o.raanRad)} ${ecc} ${angle(o.argpRad)} ` +
    `${angle(o.mRad)} ${meanMotionRevDay.toFixed(8).padStart(11, "0")}    0`;
  return [`${body1}${checksum(body1)}`, `${body2}${checksum(body2)}`];
}

// Builds SGP4-initialized Elements hitting the requested Brouwer semi-major
// axis exactly: the TLE mean motion is Kozai convention, so iterate the
// synthesized value until SGP4 init recovers the target axis.
export function elementsForOrbit(o: SynthOrbit): Elements {
  let revDay = (Math.sqrt(MU / o.aKm ** 3) * 86400) / (2 * Math.PI);
  let el: Elements | null = null;
  for (let k = 0; k < 3; k++) {
    el = elementsFromTle(...synthesizeTleLines(o, revDay));
    if (!el) throw new Error("synthesized TLE failed SGP4 init");
    revDay *= (el.aKm / o.aKm) ** 1.5;
  }
  return el!;
}

// Crude ballistic estimate for a launched satellite: cross-section from a
// cube-scaling law, Cd 2.2, B* = rho0 * Cd * A / (2m) in 1/earth-radii.
export function estimateBstar(massKg: number): number {
  const areaM2 = Math.pow(Math.max(1, massKg) / 100, 2 / 3);
  return (0.157 * 2.2 * areaM2) / (2 * Math.max(1, massKg));
}

export { RE_KM };
