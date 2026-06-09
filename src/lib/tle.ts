export interface ParsedTle {
  noradId: number;
  name: string;
  tleLine1: string;
  tleLine2: string;
  inclination: number;
  apoapsisKm: number;
  periapsisKm: number;
  epoch: Date;
}

const MU = 398600.4418; // km^3/s^2
const EARTH_RADIUS_KM = 6371;

// Alpha-5 catalog numbers: first char A-Z (minus I, O) encodes 10-33.
function parseCatalogNumber(field: string): number {
  const trimmed = field.trim();
  const first = trimmed.charCodeAt(0);
  if (first >= 65 && first <= 90) {
    let value = first - 55; // A=10
    if (first > 73) value -= 1; // skip I
    if (first > 79) value -= 1; // skip O
    return value * 10000 + parseInt(trimmed.slice(1), 10);
  }
  return parseInt(trimmed, 10);
}

function parseEpoch(line1: string): Date {
  const yy = parseInt(line1.slice(18, 20), 10);
  const year = yy >= 57 ? 1900 + yy : 2000 + yy;
  const dayOfYear = parseFloat(line1.slice(20, 32));
  const ms = Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86400000;
  return new Date(ms);
}

// Parses CelesTrak 3-line element sets (name + TLE pair).
export function parseTleCatalog(text: string): ParsedTle[] {
  const lines = text.split(/\r?\n/);
  const result: ParsedTle[] = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const name = lines[i]?.trim();
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (!name || !l1?.startsWith("1 ") || !l2?.startsWith("2 ")) continue;

    const inclination = parseFloat(l2.slice(8, 16));
    const ecc = parseFloat(`0.${l2.slice(26, 33).trim()}`);
    const meanMotion = parseFloat(l2.slice(52, 63)); // rev/day
    if (!isFinite(inclination) || !isFinite(ecc) || !(meanMotion > 0)) continue;

    const nRadS = (meanMotion * 2 * Math.PI) / 86400;
    const semiMajorKm = Math.cbrt(MU / (nRadS * nRadS));

    result.push({
      noradId: parseCatalogNumber(l1.slice(2, 7)),
      name,
      tleLine1: l1,
      tleLine2: l2,
      inclination,
      apoapsisKm: semiMajorKm * (1 + ecc) - EARTH_RADIUS_KM,
      periapsisKm: semiMajorKm * (1 - ecc) - EARTH_RADIUS_KM,
      epoch: parseEpoch(l1),
    });
  }
  return result;
}
