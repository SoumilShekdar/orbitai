// Heuristic operator attribution from satellite name prefixes. CelesTrak GP
// data has no operator field, and name prefixes cover the big constellations
// that matter for the demo.
const PREFIXES: [string, string][] = [
  ["STARLINK", "SpaceX"],
  ["ONEWEB", "OneWeb"],
  ["KUIPER", "Amazon Kuiper"],
  ["QIANFAN", "SpaceSail"],
  ["IRIDIUM", "Iridium"],
  ["GLOBALSTAR", "Globalstar"],
  ["ORBCOMM", "Orbcomm"],
  ["FLOCK", "Planet Labs"],
  ["SKYSAT", "Planet Labs"],
  ["LEMUR", "Spire Global"],
  ["ISS (ZARYA)", "NASA / Roscosmos"],
  ["ISS ", "NASA / Roscosmos"],
  ["CSS", "CMSA"],
  ["TIANHE", "CMSA"],
  ["NAVSTAR", "US Space Force"],
  ["GPS", "US Space Force"],
  ["GALILEO", "EUSPA"],
  ["BEIDOU", "CNSA"],
  ["GLONASS", "Roscosmos"],
  ["COSMOS", "Russian MoD"],
  ["YAOGAN", "PLA / CNSA"],
  ["GAOFEN", "CNSA"],
  ["JILIN", "Chang Guang"],
  ["INTELSAT", "Intelsat"],
  ["SES-", "SES"],
  ["EUTELSAT", "Eutelsat"],
  ["TELESAT", "Telesat"],
  ["NOAA", "NOAA"],
  ["GOES", "NOAA"],
  ["METOP", "EUMETSAT"],
  ["LANDSAT", "NASA / USGS"],
  ["SENTINEL", "ESA"],
  ["CARTOSAT", "ISRO"],
  ["RESOURCESAT", "ISRO"],
  ["EOS-", "ISRO"],
  ["HUBBLE", "NASA"],
  ["HST", "NASA"],
];

export function deriveOperator(name: string): string {
  const upper = name.toUpperCase();
  for (const [prefix, operator] of PREFIXES) {
    if (upper.startsWith(prefix)) return operator;
  }
  return "Unknown";
}
