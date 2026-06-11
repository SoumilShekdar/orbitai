"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { SatCatalog } from "@/lib/sim/catalog";
import { useMissionStore, ProximityEntry } from "@/lib/mission/missionStore";
import { EARTH_RADIUS_KM } from "@/lib/constants";
import OrbitTrail from "./OrbitTrail";

const WATCH_COUNT = 5;
const UPDATE_MS = 500;

// Ranks the traffic-analysis "nearby" satellites by live range to the mission
// satellite, reading the same CPU position mirror picking uses so all numbers
// agree. Renders red orbit trails for the closest few so they can be traced.
export default function RiskOverlay({ catalog }: { catalog: SatCatalog }) {
  const status = useMissionStore((s) => s.status);
  const proximity = useMissionStore((s) => s.proximity);
  const lastUpdate = useRef(0);

  useFrame(() => {
    const { status, stats, satIndex, setProximity } = useMissionStore.getState();
    if (status !== "orbiting" || !stats || satIndex === null) return;
    const now = performance.now();
    if (now - lastUpdate.current < UPDATE_MS) return;
    lastUpdate.current = now;

    const pos = catalog.cpuPositions;
    const px = pos[satIndex * 3];
    const py = pos[satIndex * 3 + 1];
    const pz = pos[satIndex * 3 + 2];

    // Top-WATCH_COUNT closest, kept sorted ascending by squared distance.
    const top: { index: number; d2: number }[] = [];
    for (const i of stats.nearbyIndices) {
      const dx = pos[i * 3] - px;
      const dy = pos[i * 3 + 1] - py;
      const dz = pos[i * 3 + 2] - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (top.length === WATCH_COUNT && d2 >= top[top.length - 1].d2) continue;
      let at = top.length;
      while (at > 0 && top[at - 1].d2 > d2) at--;
      top.splice(at, 0, { index: i, d2 });
      if (top.length > WATCH_COUNT) top.pop();
    }

    const entries: ProximityEntry[] = top.map(({ index, d2 }) => ({
      index,
      rangeKm: Math.sqrt(d2) * EARTH_RADIUS_KM,
    }));
    setProximity(entries);
  });

  if (status !== "orbiting") return null;
  return (
    <>
      {proximity.map((p) => (
        <OrbitTrail key={p.index} catalog={catalog} index={p.index} color="#f87171" opacity={0.3} />
      ))}
    </>
  );
}
