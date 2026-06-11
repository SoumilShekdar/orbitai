"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useCatalogStore } from "@/lib/sim/catalogStore";
import { useUiStore } from "@/lib/sim/uiStore";
import { useMissionStore } from "@/lib/mission/missionStore";
import { simClock } from "@/lib/sim/clock";
import { flyToPoint } from "@/lib/cameraRig";
import type { SatMeta } from "@/lib/sim/catalog";

const tmp = new THREE.Vector3();

// Inputs that read like a sentence are treated as mission prompts;
// short fragments search the catalog.
function looksLikeMission(query: string): boolean {
  return query.trim().split(/\s+/).length >= 4;
}

export default function SearchBar() {
  const catalog = useCatalogStore((s) => s.catalog);
  const setSelected = useUiStore((s) => s.setSelected);
  const parseMission = useMissionStore((s) => s.parse);
  const missionStatus = useMissionStore((s) => s.status);
  const missionError = useMissionStore((s) => s.error);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const missionMode = looksLikeMission(query);

  const matches = useMemo(() => {
    if (!catalog || query.trim().length < 2 || missionMode) return [];
    const q = query.trim().toUpperCase();
    const result: SatMeta[] = [];
    for (const m of catalog.meta) {
      if (m.name.toUpperCase().includes(q) || String(m.noradId).startsWith(q)) {
        result.push(m);
        if (result.length >= 8) break;
      }
    }
    return result;
  }, [catalog, query, missionMode]);

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const selectSatellite = (meta: SatMeta) => {
    if (!catalog) return;
    setSelected(meta.index);
    flyToPoint(catalog.positionScene(meta.index, simClock.simTimeMs, tmp));
    setOpen(false);
    setQuery("");
  };

  const submitMission = () => {
    if (!query.trim() || missionStatus === "parsing") return;
    parseMission(query.trim());
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="pointer-events-auto relative w-[30rem] max-w-[90vw]">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            if (missionMode) submitMission();
            else if (matches[highlight]) selectSatellite(matches[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Describe your mission — or search satellites…"
        className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-2.5 text-base text-zinc-100 placeholder-zinc-500 backdrop-blur-xl outline-none transition focus:border-white/25 sm:text-sm"
      />

      {missionError && !open && (
        <p className="absolute left-2 top-12 text-xs text-red-400">{missionError}</p>
      )}

      {open && missionMode && query.trim() && (
        <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl">
          <button
            onClick={submitMission}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-zinc-100 transition hover:bg-white/10"
          >
            <span className="text-base">🛰</span>
            <span>
              Plan mission with AI
              <span className="block text-xs text-zinc-500">
                Parse parameters and prepare a launch
              </span>
            </span>
          </button>
        </div>
      )}

      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl">
          {matches.map((m, i) => (
            <button
              key={m.noradId}
              onClick={() => selectSatellite(m)}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                i === highlight ? "bg-white/10 text-zinc-50" : "text-zinc-300"
              }`}
            >
              <span>{m.name}</span>
              <span className="font-mono text-xs text-zinc-500">
                {m.operator !== "Unknown" ? `${m.operator} · ` : ""}
                {m.noradId}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
