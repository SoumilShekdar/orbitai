"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import TimeControls from "./ui/TimeControls";
import { useCatalogStore } from "@/lib/sim/catalogStore";

const SceneRoot = dynamic(() => import("./scene/SceneRoot"), { ssr: false });

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
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <div className="flex-1" />
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
