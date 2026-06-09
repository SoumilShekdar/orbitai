import { create } from "zustand";
import { SatCatalog, CompactCatalogRow } from "./catalog";
import { simClock } from "./clock";

interface CatalogState {
  catalog: SatCatalog | null;
  status: "idle" | "loading" | "ready" | "error";
  load: () => Promise<void>;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  catalog: null,
  status: "idle",
  load: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading" });
    try {
      const res = await fetch("/api/satellites");
      if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
      const rows = (await res.json()) as CompactCatalogRow[];
      const catalog = SatCatalog.fromCompact(rows, simClock.simTimeMs);
      catalog.updateCpuPositions(simClock.simTimeMs);
      set({ catalog, status: "ready" });
    } catch (err) {
      console.error(err);
      set({ status: "error" });
    }
  },
}));
