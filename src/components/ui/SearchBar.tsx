"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useCatalogStore } from "@/lib/sim/catalogStore";
import { useUiStore } from "@/lib/sim/uiStore";
import { simClock } from "@/lib/sim/clock";
import { flyToPoint } from "@/lib/cameraRig";
import type { SatMeta } from "@/lib/sim/catalog";

const tmp = new THREE.Vector3();

export default function SearchBar() {
  const catalog = useCatalogStore((s) => s.catalog);
  const setSelected = useUiStore((s) => s.setSelected);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    if (!catalog || query.trim().length < 2) return [];
    const q = query.trim().toUpperCase();
    const result: SatMeta[] = [];
    for (const m of catalog.meta) {
      if (m.name.toUpperCase().includes(q) || String(m.noradId).startsWith(q)) {
        result.push(m);
        if (result.length >= 8) break;
      }
    }
    return result;
  }, [catalog, query]);

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const select = (meta: SatMeta) => {
    if (!catalog) return;
    setSelected(meta.index);
    flyToPoint(catalog.positionScene(meta.index, simClock.simTimeMs, tmp));
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="pointer-events-auto relative w-[28rem] max-w-[90vw]">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && matches[highlight]) {
            select(matches[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search satellites…"
        className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 backdrop-blur-xl outline-none transition focus:border-white/25"
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl">
          {matches.map((m, i) => (
            <button
              key={m.noradId}
              onClick={() => select(m)}
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
