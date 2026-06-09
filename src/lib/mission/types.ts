export interface MissionReport {
  collisionRisk: "Low" | "Moderate" | "High";
  summary: string;
  recommendedAltitudeKm: number;
  recommendationReason: string;
}

export interface ParsedMission {
  missionName: string;
  massKg: number;
  orbitType: "SSO" | "polar" | "equatorial" | "inclined";
  altitudeKm: number;
  inclinationDeg: number;
  launchSite: {
    name: string;
    lat: number;
    lon: number;
  };
}
