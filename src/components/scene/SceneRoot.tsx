"use client";

import { Suspense, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { CameraControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Earth from "./Earth";
import Atmosphere from "./Atmosphere";
import Satellites from "./Satellites";
import Picking from "./Picking";
import OrbitTrail from "./OrbitTrail";
import LaunchSequence from "./LaunchSequence";
import { useMissionStore } from "@/lib/mission/missionStore";
import { simClock } from "@/lib/sim/clock";
import { useSimStore } from "@/lib/sim/store";
import { useCatalogStore } from "@/lib/sim/catalogStore";
import { useUiStore } from "@/lib/sim/uiStore";
import { cameraRig } from "@/lib/cameraRig";

function ClockTicker() {
  useFrame((_, delta) => {
    const { playing, speed } = useSimStore.getState();
    if (playing) {
      simClock.simTimeMs += Math.min(delta, 0.1) * 1000 * speed;
    }
  });
  return null;
}

export default function SceneRoot() {
  const catalog = useCatalogStore((s) => s.catalog);
  const selectedIndex = useUiStore((s) => s.selectedIndex);
  const missionStatus = useMissionStore((s) => s.status);
  const controlsRef = useRef<React.ComponentRef<typeof CameraControls>>(null);

  useEffect(() => {
    cameraRig.controls = controlsRef.current;
    return () => {
      cameraRig.controls = null;
    };
  });

  useEffect(() => {
    catalog?.recolor(selectedIndex);
  }, [catalog, selectedIndex]);

  return (
    <Canvas
      camera={{ position: [0, 1.4, 3.2], fov: 45, near: 0.01, far: 1000 }}
      gl={{ antialias: true }}
      dpr={[1, 2]}
    >
      <color attach="background" args={["#000004"]} />
      <ClockTicker />
      <Suspense fallback={null}>
        <Earth />
        <Atmosphere />
      </Suspense>
      {catalog && <Satellites catalog={catalog} />}
      {catalog && <Picking catalog={catalog} />}
      {catalog && selectedIndex !== null && <OrbitTrail catalog={catalog} index={selectedIndex} />}
      {missionStatus === "launching" && <LaunchSequence />}
      <Stars radius={120} depth={60} count={6000} factor={3.5} saturation={0} fade speed={0.3} />
      <CameraControls
        ref={controlsRef}
        makeDefault
        minDistance={1.15}
        maxDistance={30}
        smoothTime={0.4}
        draggingSmoothTime={0.12}
      />
      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.95} luminanceSmoothing={0.2} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
