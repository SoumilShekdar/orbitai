import { create } from "zustand";
import { ParsedMission } from "./types";
import { useCatalogStore } from "@/lib/sim/catalogStore";
import { useUiStore } from "@/lib/sim/uiStore";
import { useSimStore } from "@/lib/sim/store";
import { Elements } from "@/lib/sim/kepler";

export type MissionStatus = "idle" | "parsing" | "ready" | "launching" | "orbiting";

let nextNoradId = 90001;

interface MissionState {
  status: MissionStatus;
  prompt: string;
  params: ParsedMission | null;
  satIndex: number | null;
  error: string | null;
  parse: (prompt: string) => Promise<void>;
  launch: () => void;
  insertSatellite: (elements: Elements) => void;
  finishLaunch: () => void;
  reset: () => void;
}

export const useMissionStore = create<MissionState>((set, get) => ({
  status: "idle",
  prompt: "",
  params: null,
  satIndex: null,
  error: null,

  parse: async (prompt: string) => {
    set({ status: "parsing", prompt, params: null, satIndex: null, error: null });
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
  },

  reset: () => set({ status: "idle", prompt: "", params: null, satIndex: null, error: null }),
}));
