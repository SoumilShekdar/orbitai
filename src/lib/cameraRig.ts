import * as THREE from "three";
import type { CameraControls } from "@react-three/drei";

// Singleton bridge so DOM UI (outside the Canvas) can drive the camera.
type ControlsImpl = NonNullable<React.ComponentRef<typeof CameraControls>>;

export const cameraRig: { controls: ControlsImpl | null } = { controls: null };

const tmp = new THREE.Vector3();

// Fly so the satellite sits between the camera and Earth, slightly above it.
export function flyToPoint(target: THREE.Vector3, distance = 0.55) {
  const controls = cameraRig.controls;
  if (!controls) return;
  tmp.copy(target).normalize().multiplyScalar(target.length() + distance);
  controls.setLookAt(tmp.x, tmp.y, tmp.z, target.x, target.y, target.z, true);
}

export function flyToOverview() {
  const controls = cameraRig.controls;
  if (!controls) return;
  controls.setLookAt(0, 1.4, 3.2, 0, 0, 0, true);
}
