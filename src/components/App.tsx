"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import TimeControls from "./ui/TimeControls";
import SearchBar from "./ui/SearchBar";
import SatellitePanel from "./ui/SatellitePanel";
import { useCatalogStore } from "@/lib/sim/catalogStore";
import { useUiStore } from "@/lib/sim/uiStore";

const SceneRoot = dynamic(() => import("./scene/SceneRoot"), { ssr: false });

function HoverTooltip() {
  const hoveredIndex = useUiStore((s) => s.hoveredIndex);
  const hoverScreen = useUiStore((s) => s.hoverScreen);
  const catalog = useCatalogStore((s) => s.catalog);
  if (hoveredIndex === null || !hoverScreen || !catalog) return null;
  const meta = catalog.meta[hoveredIndex];
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border border-white/10 bg-black/70 px-2.5 py-1 text-xs text-zinc-100 backdrop-blur"
      style={{ left: hoverScreen.x + 14, top: hoverScreen.y - 8 }}
    >
      {meta.name}
      {meta.operator !== "Unknown" && <span className="text-zinc-500"> · {meta.operator}</span>}
    </div>
  );
}

export default function App() {
  const load = useCatalogStore((s) => s.load);
  const status = useCatalogStore((s) => s.status);
  const catalog = useCatalogStore((s) => s.catalog);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="fixed inset-0 bg-black">
      <SceneRoot />
      <HoverTooltip />
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <div className="flex justify-center pt-5">
          <SearchBar />
        </div>
        <div className="flex flex-1 items-start justify-end p-5">
          <SatellitePanel />
        </div>
        <div className="flex justify-center pb-6">
          <TimeControls />
        </div>
      </div>
      <div className="pointer-events-none absolute left-5 top-5 text-xs text-zinc-500">
        {status === "loading" && <span className="animate-pulse">Loading orbital catalog…</span>}
        {status === "ready" && catalog && (
          <span>{catalog.count.toLocaleString()} active satellites</span>
        )}
        {status === "error" && <span className="text-red-400">Catalog failed to load</span>}
      </div>
    </main>
  );
}
