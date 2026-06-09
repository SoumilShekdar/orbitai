// Scene units: 1 unit = 1 Earth radius.
export const EARTH_RADIUS_KM = 6371;
export const KM_TO_UNITS = 1 / EARTH_RADIUS_KM;

export const SPEED_OPTIONS = [
  { label: "1x", value: 1 },
  { label: "10x", value: 10 },
  { label: "100x", value: 100 },
  { label: "1000x", value: 1000 },
  { label: "1 day/s", value: 86400 },
] as const;
