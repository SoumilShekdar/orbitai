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

const RISK_COLOR = {
  Low: "text-emerald-400",
  Moderate: "text-amber-300",
  High: "text-red-400",
} as const;

const DENSITY_COLOR = {
  LOW: "text-emerald-400",
  MEDIUM: "text-amber-300",
  HIGH: "text-red-400",
} as const;

export default function MissionPanel() {
  const status = useMissionStore((s) => s.status);
  const params = useMissionStore((s) => s.params);
  const stats = useMissionStore((s) => s.stats);
  const report = useMissionStore((s) => s.report);
  const analyzing = useMissionStore((s) => s.analyzing);
  const launch = useMissionStore((s) => s.launch);
  const reset = useMissionStore((s) => s.reset);
  const acceptRecommendation = useMissionStore((s) => s.acceptRecommendation);

  if (status === "idle") return null;

  const showAccept =
    status === "orbiting" &&
    params &&
    report &&
    Math.abs(report.recommendedAltitudeKm - params.altitudeKm) > 5;

  return (
    <div className="pointer-events-auto max-h-[calc(100vh-12rem)] w-80 overflow-y-auto rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur-xl">
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

          {status === "orbiting" && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                Mission analysis
              </h3>

              {stats && (
                <div className="divide-y divide-white/5">
                  <Row label="Sats within ±20 km" value={String(stats.altBandCount)} />
                  <Row label="Same inclination band" value={String(stats.inclBandCount)} />
                  <Row label="Est. conjunctions / yr" value={String(stats.estConjunctionsPerYear)} />
                  <div className="flex items-baseline justify-between gap-4 py-1.5">
                    <span className="text-xs text-zinc-500">Orbit density</span>
                    <span
                      className={`font-mono text-xs font-semibold ${DENSITY_COLOR[stats.densityLabel]}`}
                    >
                      {stats.densityLabel}
                    </span>
                  </div>
                  {report && (
                    <div className="flex items-baseline justify-between gap-4 py-1.5">
                      <span className="text-xs text-zinc-500">Collision risk</span>
                      <span
                        className={`font-mono text-xs font-semibold ${RISK_COLOR[report.collisionRisk]}`}
                      >
                        {report.collisionRisk}
                      </span>
                    </div>
                  )}
                  <Row label="Expected lifetime" value={`${stats.lifetimeYears} yr`} />
                  <Row label="Ground revisit" value={`${stats.revisitHours} h`} />
                  {stats.nearbyOperators.length > 0 && (
                    <div className="py-1.5">
                      <span className="text-xs text-zinc-500">Nearby constellations</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {stats.nearbyOperators.map((o) => (
                          <span
                            key={o.operator}
                            className="rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[11px] text-red-300"
                          >
                            {o.operator} · {o.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {analyzing && (
                <p className="mt-2 animate-pulse text-xs text-zinc-400">
                  Generating AI report…
                </p>
              )}

              {report && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs leading-relaxed text-zinc-300">{report.summary}</p>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                    <span className="font-semibold text-zinc-200">Recommendation: </span>
                    {report.recommendationReason}
                  </p>
                  {showAccept && (
                    <button
                      onClick={acceptRecommendation}
                      className="mt-3 w-full rounded-lg bg-white py-2 text-xs font-semibold text-black transition hover:bg-zinc-200"
                    >
                      Move to {Math.round(report.recommendedAltitudeKm)} km
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
