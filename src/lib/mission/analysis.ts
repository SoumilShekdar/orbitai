import { SatCatalog } from "@/lib/sim/catalog";
import { EARTH_RADIUS_KM } from "@/lib/constants";

const RAD = 180 / Math.PI;

export interface TrafficStats {
  altBandCount: number; // satellites within ±20 km altitude
  inclBandCount: number; // satellites within ±2° inclination
  estConjunctionsPerYear: number;
  densityLabel: "LOW" | "MEDIUM" | "HIGH";
  nearbyIndices: number[];
  nearbyOperators: { operator: string; count: number }[];
  lifetimeYears: number;
  revisitHours: number;
  candidates: { altitudeKm: number; altBandCount: number }[];
}

const ALT_BAND_KM = 20;
const INCL_BAND_DEG = 2;

function countAltBand(catalog: SatCatalog, altitudeKm: number, exclude: number): number {
  let count = 0;
  for (let i = 0; i < catalog.count; i++) {
    if (i === exclude) continue;
    const meanAlt = catalog.elements[i].aKm - EARTH_RADIUS_KM;
    if (Math.abs(meanAlt - altitudeKm) <= ALT_BAND_KM) count++;
  }
  return count;
}

export function analyzeTraffic(
  catalog: SatCatalog,
  satIndex: number,
  massKg: number,
): TrafficStats {
  const el = catalog.elements[satIndex];
  const altitudeKm = el.aKm - EARTH_RADIUS_KM;
  const inclDeg = el.incRad * RAD;

  const nearbyIndices: number[] = [];
  let inclBandCount = 0;
  let crossingCount = 0; // alt band + intersecting inclination -> conjunction risk
  const operators = new Map<string, number>();

  for (let i = 0; i < catalog.count; i++) {
    if (i === satIndex) continue;
    const other = catalog.elements[i];
    const meanAlt = other.aKm - EARTH_RADIUS_KM;
    const inAltBand = Math.abs(meanAlt - altitudeKm) <= ALT_BAND_KM;
    const inInclBand = Math.abs(other.incRad * RAD - inclDeg) <= INCL_BAND_DEG;
    if (inAltBand) {
      nearbyIndices.push(i);
      crossingCount++;
      const op = catalog.meta[i].operator;
      operators.set(op, (operators.get(op) ?? 0) + 1);
    }
    if (inInclBand) inclBandCount++;
  }

  const altBandCount = nearbyIndices.length;
  // Toy conjunction model: every co-altitude satellite crosses our orbit
  // roughly twice per orbit plane alignment cycle.
  const estConjunctionsPerYear = Math.round(crossingCount * 1.4);

  const densityLabel = altBandCount >= 600 ? "HIGH" : altBandCount >= 120 ? "MEDIUM" : "LOW";

  const nearbyOperators = [...operators.entries()]
    .filter(([op]) => op !== "Unknown")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([operator, count]) => ({ operator, count }));

  // Drag lifetime heuristic tuned to give ~5.8 years at 550 km / 250 kg.
  const lifetimeYears =
    Math.min(100, 0.0008 * Math.exp(altitudeKm / 62)) * Math.pow(massKg / 250, 0.3);

  // Ground revisit heuristic for a single imaging satellite.
  const revisitHours = (24 / 3.6) * (550 / altitudeKm);

  // Survey alternative altitudes for the recommendation engine.
  const candidates: { altitudeKm: number; altBandCount: number }[] = [];
  for (let alt = altitudeKm - 80; alt <= altitudeKm + 120; alt += 20) {
    if (alt < 250 || Math.abs(alt - altitudeKm) < 10) continue;
    candidates.push({
      altitudeKm: Math.round(alt),
      altBandCount: countAltBand(catalog, alt, satIndex),
    });
  }
  candidates.sort((a, b) => a.altBandCount - b.altBandCount);

  return {
    altBandCount,
    inclBandCount,
    estConjunctionsPerYear,
    densityLabel,
    nearbyIndices,
    nearbyOperators,
    lifetimeYears: Math.round(lifetimeYears * 10) / 10,
    revisitHours: Math.round(revisitHours * 10) / 10,
    candidates: candidates.slice(0, 5),
  };
}
