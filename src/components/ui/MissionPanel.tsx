"use client";

import { useMissionStore } from "@/lib/mission/missionStore";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="font-mono text-xs tabular-nums text-zinc-200">{value}</span>
    </div>
  );
}

const ORBIT_LABEL = {
  SSO: "Sun-synchronous",
  polar: "Polar",
  equatorial: "Equatorial",
  inclined: "Inclined",
} as const;

export default function MissionPanel() {
  const status = useMissionStore((s) => s.status);
  const params = useMissionStore((s) => s.params);
  const launch = useMissionStore((s) => s.launch);
  const reset = useMissionStore((s) => s.reset);

  if (status === "idle") return null;

  return (
    <div className="pointer-events-auto w-80 rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur-xl">
      {status === "parsing" && (
        <div className="py-2">
          <p className="animate-pulse text-sm text-zinc-300">Parsing mission with AI…</p>
        </div>
      )}

      {params && (status === "ready" || status === "launching" || status === "orbiting") && (
        <>
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-zinc-50">
                {params.missionName}
              </h2>
              <p className="text-xs text-zinc-500">
                {status === "ready" && "Mission plan"}
                {status === "launching" && "Launch in progress"}
                {status === "orbiting" && "On orbit"}
              </p>
            </div>
            {status !== "launching" && (
              <button
                onClick={reset}
                className="rounded-full p-1 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
                aria-label="Dismiss mission"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M3 3l8 8M11 3l-8 8" />
                </svg>
              </button>
            )}
          </div>

          <div className="divide-y divide-white/5">
            <Row label="Mass" value={`${params.massKg} kg`} />
            <Row label="Orbit" value={ORBIT_LABEL[params.orbitType]} />
            <Row label="Altitude" value={`${Math.round(params.altitudeKm)} km`} />
            <Row label="Inclination" value={`${params.inclinationDeg.toFixed(2)}°`} />
            <Row label="Launch site" value={params.launchSite.name.split(",")[0]} />
          </div>

          {status === "ready" && (
            <button
              onClick={launch}
              className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Launch
            </button>
          )}

          {status === "launching" && (
            <div className="mt-4 flex items-center gap-2 text-xs text-amber-300/90">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
              Ascent under way — stand by for orbit insertion
            </div>
          )}
        </>
      )}
    </div>
  );
}
