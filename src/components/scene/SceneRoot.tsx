"use client";

import { Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { CameraControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Earth from "./Earth";
import Atmosphere from "./Atmosphere";
import { simClock } from "@/lib/sim/clock";
import { useSimStore } from "@/lib/sim/store";

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
      <Stars radius={120} depth={60} count={6000} factor={3.5} saturation={0} fade speed={0.3} />
      <CameraControls
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
