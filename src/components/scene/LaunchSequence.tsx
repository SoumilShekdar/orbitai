"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useMissionStore } from "@/lib/mission/missionStore";
import { planInsertion, makeAscentCurve, siteDirectionScene } from "@/lib/mission/orbit";
import { positionEciKm } from "@/lib/sim/kepler";
import { simClock } from "@/lib/sim/clock";
import { cameraRig } from "@/lib/cameraRig";
import { KM_TO_UNITS } from "@/lib/constants";

// Timeline (wall seconds, sim runs at 1x during launch)
const T_PAD = 3; // camera arrives at the pad
const T_ASCENT_END = 11; // separation / orbit insertion
const T_END = 14.5; // pull-back complete

const TRAIL_MAX = 700;
const ORBIT_SAMPLES = 256;

const easeInOut = (t: number) => t * t * (3 - 2 * t);

export default function LaunchSequence() {
  const params = useMissionStore((s) => s.params)!;
  const elapsed = useRef(0);
  const inserted = useRef(false);
  const finished = useRef(false);

  const plan = useMemo(() => {
    const t0 = simClock.simTimeMs;
    const insertionTimeMs = t0 + (T_ASCENT_END - T_PAD) * 1000;
    const siteDir = siteDirectionScene(params.launchSite.lat, params.launchSite.lon, t0);
    const insertion = planInsertion(
      params.altitudeKm,
      params.inclinationDeg,
      params.launchSite.lat,
      params.launchSite.lon,
      insertionTimeMs,
    );
    const curve = makeAscentCurve(siteDir, insertion.insertionPosScene);

    // Chase-camera basis around the ascent track.
    const up = siteDir.clone();
    const track = insertion.insertionPosScene.clone().normalize().sub(siteDir).normalize();
    const side = new THREE.Vector3().crossVectors(up, track).normalize();

    // Full target orbit, sampled for the animated draw-in.
    const orbitPts = new Float32Array((ORBIT_SAMPLES + 1) * 3);
    const periodMs = ((2 * Math.PI) / insertion.elements.nRadS) * 1000;
    const scratch: number[] = [0, 0, 0];
    for (let i = 0; i <= ORBIT_SAMPLES; i++) {
      const eci = positionEciKm(
        insertion.elements,
        insertionTimeMs + (i / ORBIT_SAMPLES) * periodMs,
        scratch,
      );
      orbitPts[i * 3] = eci[0] * KM_TO_UNITS;
      orbitPts[i * 3 + 1] = eci[2] * KM_TO_UNITS;
      orbitPts[i * 3 + 2] = -eci[1] * KM_TO_UNITS;
    }

    return { siteDir, insertion, curve, up, side, track, orbitPts };
  }, [params]);

  const { rocket, trailGeom, trailLine, orbitGeom, orbitLine, flash } = useMemo(() => {
    const rocket = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 16, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 5, 2.5), toneMapped: false }),
    );
    const trailGeom = new THREE.BufferGeometry();
    trailGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
    trailGeom.setDrawRange(0, 0);
    const trailLine = new THREE.Line(
      trailGeom,
      new THREE.LineBasicMaterial({
        color: new THREE.Color(2.2, 1.4, 0.7),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const orbitGeom = new THREE.BufferGeometry();
    orbitGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array((ORBIT_SAMPLES + 1) * 3), 3));
    orbitGeom.setDrawRange(0, 0);
    const orbitLine = new THREE.Line(
      orbitGeom,
      new THREE.LineBasicMaterial({
        color: new THREE.Color(1.8, 1.5, 0.5),
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 24),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(10, 8, 5),
        transparent: true,
        opacity: 0,
        toneMapped: false,
      }),
    );
    flash.scale.setScalar(0.0001);
    return { rocket, trailGeom, trailLine, orbitGeom, orbitLine, flash };
  }, []);

  // Camera state captured at mount; controls disabled for the duration.
  const camStart = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  useEffect(() => {
    const controls = cameraRig.controls;
    if (controls) {
      const pos = new THREE.Vector3();
      const target = new THREE.Vector3();
      controls.getPosition(pos);
      controls.getTarget(target);
      camStart.current = { pos, target };
      controls.enabled = false;
      controls.minDistance = 1.005;
    }
    (orbitGeom.getAttribute("position") as THREE.BufferAttribute).copyArray(plan.orbitPts);
    orbitGeom.getAttribute("position").needsUpdate = true;
    return () => {
      if (controls) {
        controls.enabled = true;
        controls.minDistance = 1.15;
      }
      trailGeom.dispose();
      orbitGeom.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trailCount = useRef(0);
  const v = useMemo(
    () => ({
      rocketPos: new THREE.Vector3(),
      camPos: new THREE.Vector3(),
      camTarget: new THREE.Vector3(),
      chasePos: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
    }),
    [],
  );

  const chaseCam = (rocketPos: THREE.Vector3, s: number, outPos: THREE.Vector3) => {
    // Slide from a tight pad view to a wider trailing view as the rocket climbs.
    const back = 0.05 + 0.1 * s;
    const out = 0.03 + 0.09 * s;
    const beside = 0.1 - 0.04 * s;
    return outPos
      .copy(rocketPos)
      .addScaledVector(plan.track, -back)
      .addScaledVector(plan.up, out)
      .addScaledVector(plan.side, beside);
  };

  useFrame((_, delta) => {
    const controls = cameraRig.controls;
    const store = useMissionStore.getState();
    // Cap delta so background-tab rAF throttling can't skip the cinematic.
    elapsed.current += Math.min(delta, 0.05);
    const t = elapsed.current;

    // Rocket progress: 0 until T_PAD, then along the ascent curve.
    const s = THREE.MathUtils.clamp((t - T_PAD) / (T_ASCENT_END - T_PAD), 0, 1);
    plan.curve(s, v.rocketPos);
    rocket.position.copy(v.rocketPos);
    rocket.visible = t >= T_PAD - 0.2 && t < T_ASCENT_END + 0.3;

    // Exhaust trail.
    if (t >= T_PAD && s < 1 && trailCount.current < TRAIL_MAX) {
      const attr = trailGeom.getAttribute("position") as THREE.BufferAttribute;
      attr.setXYZ(trailCount.current, v.rocketPos.x, v.rocketPos.y, v.rocketPos.z);
      attr.needsUpdate = true;
      trailCount.current++;
      trailGeom.setDrawRange(0, trailCount.current);
    }

    // Separation: insert the satellite into the live catalog, flash.
    if (t >= T_ASCENT_END && !inserted.current) {
      inserted.current = true;
      store.insertSatellite(plan.insertion.elements);
      flash.position.copy(plan.insertion.insertionPosScene);
    }
    if (inserted.current) {
      const ft = THREE.MathUtils.clamp((t - T_ASCENT_END) / 0.7, 0, 1);
      flash.scale.setScalar(0.001 + 0.05 * Math.sin(ft * Math.PI));
      (flash.material as THREE.MeshBasicMaterial).opacity = Math.sin(ft * Math.PI) * 0.9;
      const reveal = THREE.MathUtils.clamp((t - T_ASCENT_END - 0.2) / 2.2, 0, 1);
      orbitGeom.setDrawRange(0, Math.floor(easeInOut(reveal) * (ORBIT_SAMPLES + 1)));
    }

    // Camera choreography.
    if (controls && camStart.current) {
      if (t < T_PAD) {
        const k = easeInOut(t / T_PAD);
        chaseCam(plan.curve(0, v.tmp), 0, v.chasePos);
        v.camPos.lerpVectors(camStart.current.pos, v.chasePos, k);
        v.camTarget.lerpVectors(camStart.current.target, plan.curve(0, v.tmp), k);
      } else if (t < T_ASCENT_END + 0.6) {
        chaseCam(v.rocketPos, s, v.camPos);
        v.camTarget.copy(v.rocketPos);
      } else {
        const k = easeInOut(THREE.MathUtils.clamp((t - T_ASCENT_END - 0.6) / (T_END - T_ASCENT_END - 0.6), 0, 1));
        const orbitNormal = v.tmp.crossVectors(plan.insertion.insertionPosScene, plan.track).normalize();
        chaseCam(plan.insertion.insertionPosScene, 1, v.chasePos);
        const wide = plan.insertion.insertionPosScene
          .clone()
          .normalize()
          .multiplyScalar(3.6)
          .addScaledVector(orbitNormal, -1.2);
        v.camPos.lerpVectors(v.chasePos, wide, k);
        v.camTarget.lerpVectors(plan.insertion.insertionPosScene, new THREE.Vector3(0, 0, 0), k);
      }
      controls.setLookAt(v.camPos.x, v.camPos.y, v.camPos.z, v.camTarget.x, v.camTarget.y, v.camTarget.z, false);
    }

    if (t >= T_END && !finished.current) {
      finished.current = true;
      store.finishLaunch();
    }
  });

  return (
    <group>
      <primitive object={rocket} />
      <primitive object={trailLine} />
      <primitive object={orbitLine} />
      <primitive object={flash} />
    </group>
  );
}
