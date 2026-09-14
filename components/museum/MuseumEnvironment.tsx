"use client";
import { useEffect } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import { CubeUVReflectionMapping } from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
const BRASS_PROBE = "/museum/brass-room-probe.hdr";
useLoader.preload(HDRLoader, BRASS_PROBE);
/** A tiny lighting probe for materials inside the closed gallery. */
export function MuseumEnvironment() {
  const probe = useLoader(HDRLoader, BRASS_PROBE);
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    // Three's RoomEnvironment was prefiltered by build-brass-probe.mjs. Keep
    // its CubeUV packing: the visitor does no environment capture or filtering.
    probe.mapping = CubeUVReflectionMapping;
    probe.flipY = false;
    probe.needsUpdate = true;
    gl.initTexture(probe);
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    scene.environment = probe;
    scene.environmentIntensity = 0.55;
    invalidate();
    return () => {
      scene.environment = previous;
      scene.environmentIntensity = previousIntensity;
    };
  }, [gl, scene, invalidate, probe]);
  return null;
}
