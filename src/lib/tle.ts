import { twoline2satrec } from "satellite.js";

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

const RE_KM = 6378.135; // WGS72 equatorial radius used by SGP4
const DEG = 180 / Math.PI;

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

// Parses CelesTrak 3-line element sets (name + TLE pair). Each set runs
// through SGP4 initialization, so derived fields use the recovered Brouwer
// semi-major axis and objects SGP4 can't propagate are dropped here.
export function parseTleCatalog(text: string): ParsedTle[] {
  const lines = text.split(/\r?\n/);
  const result: ParsedTle[] = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const name = lines[i]?.trim();
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (!name || !l1?.startsWith("1 ") || !l2?.startsWith("2 ")) continue;

    let rec;
    try {
      rec = twoline2satrec(l1, l2);
    } catch {
      continue;
    }
    if (rec.error !== 0 || !(rec.a > 0)) continue;

    const aKm = rec.a * RE_KM;
    result.push({
      noradId: parseCatalogNumber(l1.slice(2, 7)),
      name,
      tleLine1: l1,
      tleLine2: l2,
      inclination: rec.inclo * DEG,
      apoapsisKm: aKm * (1 + rec.ecco) - RE_KM,
      periapsisKm: aKm * (1 - rec.ecco) - RE_KM,
      epoch: new Date((rec.jdsatepoch - 2440587.5) * 86400000),
    });
  }
  return result;
}
