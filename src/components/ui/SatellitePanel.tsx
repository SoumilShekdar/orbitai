"use client";

import { useEffect, useState } from "react";
import { useUiStore } from "@/lib/sim/uiStore";
import { useCatalogStore } from "@/lib/sim/catalogStore";
import { simClock } from "@/lib/sim/clock";
import { positionEciKm, speedKmS } from "@/lib/sim/kepler";
import { EARTH_RADIUS_KM } from "@/lib/constants";

const scratch: number[] = [0, 0, 0];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="font-mono text-xs tabular-nums text-zinc-200">{value}</span>
    </div>
  );
}

export default function SatellitePanel() {
  const selectedIndex = useUiStore((s) => s.selectedIndex);
  const setSelected = useUiStore((s) => s.setSelected);
  const catalog = useCatalogStore((s) => s.catalog);
  const [live, setLive] = useState({ altKm: 0, speed: 0 });

  useEffect(() => {
    if (selectedIndex === null || !catalog) return;
    const update = () => {
      const eci = positionEciKm(catalog.elements[selectedIndex], simClock.simTimeMs, scratch);
      const r = Math.hypot(eci[0], eci[1], eci[2]);
      setLive({ altKm: r - EARTH_RADIUS_KM, speed: speedKmS(catalog.elements[selectedIndex], r) });
    };
    update();
    const id = setInterval(update, 250);
    return () => clearInterval(id);
  }, [selectedIndex, catalog]);

  if (selectedIndex === null || !catalog) return null;
  const meta = catalog.meta[selectedIndex];
  const el = catalog.elements[selectedIndex];
  const periodMin = (2 * Math.PI) / el.nRadS / 60;

  return (
    <div className="pointer-events-auto min-h-0 max-h-[35dvh] w-full shrink overflow-y-auto rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur-xl sm:max-h-none sm:w-72">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-50">{meta.name}</h2>
          <p className="text-xs text-zinc-500">{meta.operator}</p>
        </div>
        <button
          onClick={() => setSelected(null)}
          className="rounded-full p-1 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>
      <div className="divide-y divide-white/5">
        <Row label="NORAD ID" value={String(meta.noradId)} />
        <Row label="Altitude" value={`${live.altKm.toFixed(1)} km`} />
        <Row label="Velocity" value={`${live.speed.toFixed(2)} km/s`} />
        <Row label="Inclination" value={`${((el.incRad * 180) / Math.PI).toFixed(2)}°`} />
        <Row label="Period" value={`${periodMin.toFixed(1)} min`} />
        <Row
          label="Apogee / Perigee"
          value={`${Math.round(el.aKm * (1 + el.e) - EARTH_RADIUS_KM)} / ${Math.round(
            el.aKm * (1 - el.e) - EARTH_RADIUS_KM,
          )} km`}
        />
      </div>
    </div>
  );
}
