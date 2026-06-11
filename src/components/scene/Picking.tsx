"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SatCatalog } from "@/lib/sim/catalog";
import { useUiStore } from "@/lib/sim/uiStore";

const PICK_RADIUS_PX = 14;
const TOUCH_PICK_RADIUS_PX = 28;

const vp = new THREE.Matrix4();
const v4 = new THREE.Vector4();
const camPos = new THREE.Vector3();
const d = new THREE.Vector3();
const closest = new THREE.Vector3();

// Screen-space picking against the CPU position mirror, with a sphere
// occlusion test so satellites behind the Earth can't be picked.
function pick(
  catalog: SatCatalog,
  camera: THREE.Camera,
  width: number,
  height: number,
  px: number,
  py: number,
  radiusPx: number,
): number | null {
  vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  camera.getWorldPosition(camPos);
  const pos = catalog.cpuPositions;
  let best = -1;
  let bestDist = radiusPx * radiusPx;
  for (let i = 0; i < catalog.count; i++) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    v4.set(x, y, z, 1).applyMatrix4(vp);
    if (v4.w <= 0) continue;
    const sx = (v4.x / v4.w + 1) * 0.5 * width;
    const sy = (1 - v4.y / v4.w) * 0.5 * height;
    const dx = sx - px;
    const dy = sy - py;
    const distSq = dx * dx + dy * dy;
    if (distSq >= bestDist) continue;

    // Occlusion: does the camera->satellite segment pass through the globe?
    d.set(x, y, z).sub(camPos);
    const t = THREE.MathUtils.clamp(-camPos.dot(d) / d.lengthSq(), 0, 1);
    closest.copy(camPos).addScaledVector(d, t);
    if (closest.length() < 0.995 && t < 1) continue;

    bestDist = distSq;
    best = i;
  }
  return best >= 0 ? best : null;
}

export default function Picking({ catalog }: { catalog: SatCatalog }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const pointer = useRef({ x: 0, y: 0, moved: false });

  useEffect(() => {
    const el = gl.domElement;
    let downAt = 0;
    let downPos = { x: 0, y: 0 };

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      pointer.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, moved: true };
    };
    const onDown = (e: PointerEvent) => {
      downAt = performance.now();
      downPos = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      // Only treat short, non-drag releases as clicks (orbiting uses drag).
      // Touch gets looser thresholds — fingers wobble more than mice.
      const touch = e.pointerType === "touch";
      const dt = performance.now() - downAt;
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (dt > 400 || dist > (touch ? 12 : 6)) return;
      const rect = el.getBoundingClientRect();
      const hit = pick(
        catalog,
        camera,
        rect.width,
        rect.height,
        e.clientX - rect.left,
        e.clientY - rect.top,
        touch ? TOUCH_PICK_RADIUS_PX : PICK_RADIUS_PX,
      );
      useUiStore.getState().setSelected(hit);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
    };
  }, [gl, camera, catalog]);

  useFrame(() => {
    if (!pointer.current.moved) return;
    pointer.current.moved = false;
    const { x, y } = pointer.current;
    const hit = pick(catalog, camera, size.width, size.height, x, y, PICK_RADIUS_PX);
    const ui = useUiStore.getState();
    if (hit !== ui.hoveredIndex || hit !== null) {
      ui.setHovered(hit, hit !== null ? { x, y } : null);
    }
    document.body.style.cursor = hit !== null ? "pointer" : "default";
  });

  return null;
}
