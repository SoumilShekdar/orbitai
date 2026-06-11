import { create } from "zustand";
import { ParsedMission, MissionReport } from "./types";
import { analyzeTraffic, TrafficStats } from "./analysis";
import { useCatalogStore } from "@/lib/sim/catalogStore";
import { useUiStore } from "@/lib/sim/uiStore";
import { useSimStore } from "@/lib/sim/store";
import { simClock } from "@/lib/sim/clock";
import { Elements } from "@/lib/sim/kepler";

export type MissionStatus = "idle" | "parsing" | "ready" | "launching" | "orbiting";

let nextNoradId = 90001;

// Live range from the mission satellite to a nearby catalog satellite.
export interface ProximityEntry {
  index: number;
  rangeKm: number;
}

interface MissionState {
  status: MissionStatus;
  prompt: string;
  params: ParsedMission | null;
  satIndex: number | null;
  stats: TrafficStats | null;
  report: MissionReport | null;
  proximity: ProximityEntry[];
  analyzing: boolean;
  error: string | null;
  parse: (prompt: string) => Promise<void>;
  launch: () => void;
  insertSatellite: (elements: Elements) => void;
  finishLaunch: () => void;
  analyze: () => Promise<void>;
  setProximity: (proximity: ProximityEntry[]) => void;
  acceptRecommendation: () => void;
  reset: () => void;
}

export const useMissionStore = create<MissionState>((set, get) => ({
  status: "idle",
  prompt: "",
  params: null,
  satIndex: null,
  stats: null,
  report: null,
  proximity: [],
  analyzing: false,
  error: null,

  parse: async (prompt: string) => {
    set({
      status: "parsing",
      prompt,
      params: null,
      satIndex: null,
      stats: null,
      report: null,
      proximity: [],
      error: null,
    });
    useUiStore.getState().setSelected(null);
    try {
      const res = await fetch("/api/parse-mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`parse failed: ${res.status}`);
      const params = (await res.json()) as ParsedMission;
      set({ status: "ready", params });
    } catch (err) {
      console.error(err);
      set({ status: "idle", error: "Couldn't parse that mission. Try rephrasing." });
    }
  },

  launch: () => {
    if (get().status !== "ready") return;
    // Launch plays out in real time.
    useSimStore.getState().setSpeed(1);
    useSimStore.getState().setPlaying(true);
    set({ status: "launching" });
  },

  insertSatellite: (elements: Elements) => {
    const { params } = get();
    const catalog = useCatalogStore.getState().catalog;
    if (!params || !catalog) return;
    const index = catalog.addSatellite(
      {
        noradId: nextNoradId++,
        name: params.missionName.toUpperCase(),
        operator: "Your mission",
        launched: true,
      },
      elements,
    );
    set({ satIndex: index });
  },

  finishLaunch: () => {
    const { satIndex } = get();
    if (satIndex !== null) useUiStore.getState().setSelected(satIndex);
    set({ status: "orbiting" });
    void get().analyze();
  },

  analyze: async () => {
    const { satIndex, params } = get();
    const catalog = useCatalogStore.getState().catalog;
    if (satIndex === null || !params || !catalog) return;

    set({ analyzing: true, report: null });
    const stats = analyzeTraffic(catalog, satIndex, params.massKg);
    set({ stats });
    catalog.recolor(useUiStore.getState().selectedIndex, new Set(stats.nearbyIndices));

    try {
      const res = await fetch("/api/analyze-mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mission: {
            name: params.missionName,
            massKg: params.massKg,
            orbitType: params.orbitType,
            altitudeKm: params.altitudeKm,
            inclinationDeg: params.inclinationDeg,
          },
          traffic: {
            satellitesWithin20km: stats.altBandCount,
            satellitesWithin2degInclination: stats.inclBandCount,
            estimatedConjunctionsPerYear: stats.estConjunctionsPerYear,
            density: stats.densityLabel,
            nearbyConstellations: stats.nearbyOperators,
            expectedLifetimeYears: stats.lifetimeYears,
            groundRevisitHours: stats.revisitHours,
          },
          candidateAltitudes: stats.candidates,
        }),
      });
      if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
      const report = (await res.json()) as MissionReport;
      set({ report, analyzing: false });
    } catch (err) {
      console.error(err);
      set({ analyzing: false, error: "Report generation failed." });
    }
  },

  setProximity: (proximity) => set({ proximity }),

  acceptRecommendation: () => {
    const { satIndex, params, report } = get();
    const catalog = useCatalogStore.getState().catalog;
    if (satIndex === null || !params || !report || !catalog) return;
    catalog.changeAltitude(satIndex, report.recommendedAltitudeKm, simClock.simTimeMs);
    set({
      params: {
        ...params,
        altitudeKm: report.recommendedAltitudeKm,
        inclinationDeg:
          params.orbitType === "SSO"
            ? 96.6 + report.recommendedAltitudeKm * 0.00185
            : params.inclinationDeg,
      },
    });
    void get().analyze();
  },

  reset: () => {
    const { satIndex } = get();
    const catalog = useCatalogStore.getState().catalog;
    const ui = useUiStore.getState();
    if (satIndex !== null && catalog) {
      if (ui.selectedIndex === satIndex) ui.setSelected(null);
      if (ui.hoveredIndex === satIndex) ui.setHovered(null);
      catalog.removeSatellite(satIndex);
    }
    catalog?.recolor(useUiStore.getState().selectedIndex);
    set({
      status: "idle",
      prompt: "",
      params: null,
      satIndex: null,
      stats: null,
      report: null,
      proximity: [],
      analyzing: false,
      error: null,
    });
  },
}));
