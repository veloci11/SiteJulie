"use client";
import { useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import { TextureLoader, type Texture } from "three";

const PATH = "/museum/contemporary/details/";
const FILES = [
  "stone-base.webp",
  "stone-normal.webp",
  "stone-roughness.webp",
  "wood-base.webp",
  "wood-normal.webp",
  "wood-roughness.webp",
  "linen-base.webp",
  "linen-normal.webp",
  "jute-base.webp",
  "jute-normal.webp",
].map((file) => PATH + file);
export interface SurfaceTextures {
  base: Texture;
  normal: Texture;
  roughness?: Texture;
}
export type InteriorTextures = Record<string, SurfaceTextures>;
useLoader.preload(TextureLoader, FILES);
export function useSurfaceDetails(): InteriorTextures {
  const textures = useLoader(TextureLoader, FILES);
  return useMemo(
    () => ({
      stone: { base: textures[0], normal: textures[1], roughness: textures[2] },
      wood: { base: textures[3], normal: textures[4], roughness: textures[5] },
      linen: { base: textures[6], normal: textures[7] },
      jute: { base: textures[8], normal: textures[9] },
    }),
    [textures],
  );
}
