"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { simClock } from "@/lib/sim/clock";
import { gmst, sunDirectionScene } from "@/lib/sun";

const VERTEX = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec2 vUv;

void main() {
  vUv = uv;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D waterMap;
uniform vec3 sunDirection;
uniform vec3 cameraPos;

varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec2 vUv;

void main() {
  vec3 normal = normalize(vWorldNormal);
  float ndl = dot(normal, sunDirection);

  vec3 dayColor = texture2D(dayMap, vUv).rgb;
  vec3 nightColor = texture2D(nightMap, vUv).rgb;
  float water = texture2D(waterMap, vUv).r;

  // Soft terminator between night and day.
  float dayMix = smoothstep(-0.12, 0.18, ndl);

  // Sun specular glint on oceans.
  vec3 viewDir = normalize(cameraPos - vWorldPos);
  vec3 halfDir = normalize(sunDirection + viewDir);
  float spec = pow(max(dot(normal, halfDir), 0.0), 48.0) * water * dayMix;

  vec3 day = dayColor * (0.18 + 0.95 * max(ndl, 0.0)) + vec3(0.9, 0.85, 0.7) * spec * 0.35;
  vec3 night = nightColor * vec3(1.0, 0.85, 0.6) * 1.6 + dayColor * 0.015;

  vec3 color = mix(night, day, dayMix);

  gl_FragColor = vec4(color, 1.0);
}
`;

export default function Earth() {
  const meshRef = useRef<THREE.Mesh>(null);
  const [dayMap, nightMap, waterMap] = useTexture([
    "/textures/earth-day.jpg",
    "/textures/earth-night.jpg",
    "/textures/earth-water.png",
  ]);

  const material = useMemo(() => {
    for (const tex of [dayMap, nightMap]) {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
    }
    waterMap.anisotropy = 4;
    return new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        dayMap: { value: dayMap },
        nightMap: { value: nightMap },
        waterMap: { value: waterMap },
        sunDirection: { value: new THREE.Vector3(1, 0, 0) },
        cameraPos: { value: new THREE.Vector3() },
      },
    });
  }, [dayMap, nightMap, waterMap]);

  useFrame(({ camera }) => {
    const sun = material.uniforms.sunDirection.value as THREE.Vector3;
    sunDirectionScene(simClock.simTimeMs, sun);
    (material.uniforms.cameraPos.value as THREE.Vector3).copy(camera.position);
    if (meshRef.current) {
      // Satellites live in ECI; spin the Earth under them by sidereal time.
      meshRef.current.rotation.y = gmst(simClock.simTimeMs);
    }
  });

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[1, 128, 128]} />
    </mesh>
  );
}
