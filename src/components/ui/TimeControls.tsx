"use client";

import { useEffect, useState } from "react";
import { useSimStore } from "@/lib/sim/store";
import { simClock } from "@/lib/sim/clock";
import { SPEED_OPTIONS } from "@/lib/constants";

function SimTimeReadout() {
  const [text, setText] = useState("");
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date(simClock.simTimeMs);
      setText(
        d.toLocaleString("en-US", {
          timeZone: "UTC",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }) + " UTC",
      );
    }, 250);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-xs tabular-nums text-zinc-400">{text}</span>;
}

const LIVE_TOLERANCE_MS = 2000;

// Shows a LIVE badge while sim time tracks wall-clock time; once the
// simulation diverges (speed, pause, or scrub), offers a one-click return.
function LiveIndicator() {
  const setPlaying = useSimStore((s) => s.setPlaying);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    const id = setInterval(
      () => setIsLive(Math.abs(simClock.simTimeMs - Date.now()) < LIVE_TOLERANCE_MS),
      250,
    );
    return () => clearInterval(id);
  }, []);

  if (isLive) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        LIVE
      </span>
    );
  }
  return (
    <button
      onClick={() => {
        simClock.simTimeMs = Date.now();
        setSpeed(1);
        setPlaying(true);
      }}
      className="flex items-center gap-1.5 rounded-full border border-amber-300/40 px-2.5 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-300/10"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300" />
      Go live
    </button>
  );
}

export default function TimeControls() {
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const setPlaying = useSimStore((s) => s.setPlaying);
  const setSpeed = useSimStore((s) => s.setSpeed);

  return (
    <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-2xl border border-white/10 bg-black/50 px-3 py-2 backdrop-blur-xl sm:px-4 sm:py-2.5">
      <button
        onClick={() => setPlaying(!playing)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-zinc-100 transition hover:bg-white/20"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor">
            <rect x="1" width="3.4" height="12" rx="1" />
            <rect x="6.6" width="3.4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2 1.1c0-.8.9-1.3 1.6-.9l8 4.9c.6.4.6 1.4 0 1.8l-8 4.9c-.7.4-1.6-.1-1.6-.9V1.1z" />
          </svg>
        )}
      </button>
      <div className="flex items-center gap-1">
        {SPEED_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSpeed(opt.value)}
            className={`rounded-full px-2.5 py-1.5 text-xs font-medium transition sm:py-1 ${
              speed === opt.value
                ? "bg-white/90 text-black"
                : "text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="hidden h-4 w-px bg-white/10 sm:block" />
      <SimTimeReadout />
      <LiveIndicator />
    </div>
  );
}
