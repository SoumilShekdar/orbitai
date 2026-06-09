"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SatCatalog } from "@/lib/sim/catalog";
import { simClock } from "@/lib/sim/clock";
import { useSimStore } from "@/lib/sim/store";

const VERTEX = /* glsl */ `
uniform float uTime;   // sim seconds since catalog refMs
uniform float uScale;  // point size factor (pixels * world units)
attribute vec4 elemA;  // a(units), e, inc, raan@ref
attribute vec4 elemB;  // argp@ref, M@ref, n, raanDot
attribute vec2 elemC;  // argpDot, size
attribute vec3 aColor;
varying vec3 vColor;

void main() {
  float a = elemA.x;
  float e = elemA.y;
  float inc = elemA.z;
  float raan = elemA.w + elemB.w * uTime;
  float argp = elemB.x + elemC.x * uTime;
  float M = elemB.y + elemB.z * uTime;

  // Kepler's equation, Newton iterations (e is small for nearly all sats).
  float E = M;
  for (int k = 0; k < 4; k++) {
    E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E));
  }
  float cosE = cos(E);
  float sinE = sin(E);
  float nu = atan(sqrt(1.0 - e * e) * sinE, cosE - e);
  float r = a * (1.0 - e * cosE);
  float u = argp + nu;

  float cosO = cos(raan);
  float sinO = sin(raan);
  float cosi = cos(inc);
  float sini = sin(inc);
  float cosu = cos(u);
  float sinu = sin(u);

  // ECI -> scene (y-up) mapping: (x, z, -y).
  vec3 pos = r * vec3(
    cosO * cosu - sinO * sinu * cosi,
    sinu * sini,
    -(sinO * cosu + cosO * sinu * cosi)
  );

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = clamp(elemC.y * uScale / -mv.z, 1.0, 64.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vColor;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float core = smoothstep(0.7, 0.0, d);
  float halo = smoothstep(1.0, 0.35, d) * 0.35;
  float alpha = core + halo;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(vColor, alpha);
}
`;

export default function Satellites({ catalog }: { catalog: SatCatalog }) {
  const size = useThree((s) => s.size);
  const viewport = useThree((s) => s.viewport);
  const versionRef = useRef(-1);

  const { geometry, material } = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    // Dummy positions: real positions are computed in the vertex shader.
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(catalog.capacity * 3), 3),
    );
    geometry.setAttribute("elemA", new THREE.BufferAttribute(catalog.elemA, 4));
    geometry.setAttribute("elemB", new THREE.BufferAttribute(catalog.elemB, 4));
    geometry.setAttribute("elemC", new THREE.BufferAttribute(catalog.elemC, 2));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(catalog.colors, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 10 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry, material };
  }, [catalog]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(() => {
    if (catalog.needsRebase(simClock.simTimeMs)) {
      catalog.rebase(simClock.simTimeMs);
    }
    if (versionRef.current !== catalog.version) {
      versionRef.current = catalog.version;
      geometry.setDrawRange(0, catalog.count);
      for (const name of ["elemA", "elemB", "elemC", "aColor"] as const) {
        geometry.getAttribute(name).needsUpdate = true;
      }
    }
    material.uniforms.uTime.value = (simClock.simTimeMs - catalog.refMs) / 1000;
    material.uniforms.uScale.value = size.height * viewport.dpr * 0.011;

    // Keep the CPU mirror fresh for picking and analysis.
    if (Math.abs(simClock.simTimeMs - catalog.cpuTimeMs) > 500 * simSpeedScale()) {
      catalog.updateCpuPositions(simClock.simTimeMs);
    }
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

// CPU mirror refresh threshold scales with sim speed so we refresh roughly
// twice per wall-clock second regardless of the time multiplier.
function simSpeedScale(): number {
  return Math.max(1, useSimStore.getState().speed);
}
