export interface LaunchSite {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

export const LAUNCH_SITES: LaunchSite[] = [
  { name: "Satish Dhawan Space Centre, Sriharikota", country: "India", lat: 13.72, lon: 80.23 },
  { name: "Cape Canaveral", country: "USA", lat: 28.49, lon: -80.57 },
  { name: "Kennedy Space Center", country: "USA", lat: 28.61, lon: -80.6 },
  { name: "Vandenberg Space Force Base", country: "USA", lat: 34.74, lon: -120.57 },
  { name: "Baikonur Cosmodrome", country: "Kazakhstan", lat: 45.96, lon: 63.31 },
  { name: "Guiana Space Centre, Kourou", country: "French Guiana", lat: 5.24, lon: -52.77 },
  { name: "Tanegashima Space Center", country: "Japan", lat: 30.4, lon: 130.97 },
  { name: "Jiuquan Satellite Launch Center", country: "China", lat: 40.96, lon: 100.29 },
  { name: "Wenchang Space Launch Site", country: "China", lat: 19.61, lon: 110.95 },
  { name: "Rocket Lab LC-1, Mahia", country: "New Zealand", lat: -39.26, lon: 177.86 },
  { name: "Plesetsk Cosmodrome", country: "Russia", lat: 62.93, lon: 40.57 },
  { name: "Wallops Flight Facility", country: "USA", lat: 37.94, lon: -75.47 },
];

// Generic words shared across many pad names ("Space Force Base", "Space
// Launch Complex", "Satellite Launch Center"). Matching on these would snap any
// site to whichever pad lists them first, so they can't be distinguishing keys.
const GENERIC_SITE_WORDS = new Set([
  "space",
  "centre",
  "center",
  "force",
  "base",
  "launch",
  "complex",
  "station",
  "site",
  "satellite",
  "cosmodrome",
  "flight",
  "facility",
]);

// Snap model-provided coordinates to a known pad when the name matches,
// so hallucinated lat/lons can't put the rocket in the ocean.
export function resolveLaunchSite(name: string, lat: number, lon: number): LaunchSite {
  const lower = name.toLowerCase();
  // Prefer a distinctive token in the pad name (e.g. "vandenberg", "baikonur").
  for (const site of LAUNCH_SITES) {
    const keys = site.name
      .toLowerCase()
      .split(/[,\s]+/)
      .filter((k) => k.length > 4 && !GENERIC_SITE_WORDS.has(k));
    if (keys.some((k) => lower.includes(k))) {
      return site;
    }
  }
  // Fall back to country only if no name matched (e.g. "India" -> Sriharikota).
  for (const site of LAUNCH_SITES) {
    if (lower.includes(site.country.toLowerCase())) {
      return site;
    }
  }
  return { name, country: "", lat, lon };
}
