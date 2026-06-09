"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { simClock } from "@/lib/sim/clock";
import { sunDirectionScene } from "@/lib/sun";

const VERTEX = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main() {
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 sunDirection;
uniform vec3 cameraPos;

varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDir = normalize(cameraPos - vWorldPos);

  // Rim glow: strongest at the limb (rendered on the back side).
  float rim = pow(1.0 - abs(dot(normal, viewDir)), 3.0);

  // Atmosphere lights up on the day side, fades through the terminator.
  float lit = clamp(dot(normal, sunDirection) * 0.5 + 0.5, 0.0, 1.0);
  float intensity = rim * (0.15 + 0.85 * lit);

  vec3 color = mix(vec3(0.1, 0.3, 0.9), vec3(0.35, 0.6, 1.0), lit);
  gl_FragColor = vec4(color, intensity * 0.9);
}
`;

export default function Atmosphere() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          sunDirection: { value: new THREE.Vector3(1, 0, 0) },
          cameraPos: { value: new THREE.Vector3() },
        },
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame(({ camera }) => {
    sunDirectionScene(simClock.simTimeMs, material.uniforms.sunDirection.value as THREE.Vector3);
    (material.uniforms.cameraPos.value as THREE.Vector3).copy(camera.position);
  });

  return (
    <mesh material={material} scale={1.045}>
      <sphereGeometry args={[1, 96, 96]} />
    </mesh>
  );
}
