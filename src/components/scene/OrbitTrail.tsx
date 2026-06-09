"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { SatCatalog } from "@/lib/sim/catalog";
import { simClock } from "@/lib/sim/clock";

const SAMPLES = 256;

// One full orbital period of the given satellite, drawn as a closed loop.
// The orbit is fixed in ECI apart from slow J2 precession, so computing it
// once per selection is plenty.
export default function OrbitTrail({
  catalog,
  index,
  color = "#67e8f9",
  opacity = 0.55,
}: {
  catalog: SatCatalog;
  index: number;
  color?: string;
  opacity?: number;
}) {
  const points = useMemo(() => {
    const el = catalog.elements[index];
    const periodMs = ((2 * Math.PI) / el.nRadS) * 1000;
    const t0 = simClock.simTimeMs;
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= SAMPLES; s++) {
      pts.push(catalog.positionScene(index, t0 + (s / SAMPLES) * periodMs, new THREE.Vector3()));
    }
    return pts;
  }, [catalog, index]);

  return (
    <Line points={points} color={color} transparent opacity={opacity} lineWidth={1.2} depthTest />
  );
}
