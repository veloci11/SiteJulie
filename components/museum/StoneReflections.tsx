"use client";
import { useEffect, useMemo } from "react";
import { Color, PlaneGeometry, ShaderMaterial } from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { useThree } from "@react-three/fiber";
import { roomOffset } from "@/lib/museum/config";

/** A faint polished-stone reflection over the actual textured, jointed tiles. */
export function StoneReflections({ rooms }: { rooms: string[] }) {
  const { width, height } = useThree((state) => state.size);
  if (width <= 700 || height <= 520) return null;
  return <StoneSurface lastRoomId={rooms.at(-1) || "room-1"} />;
}

function StoneSurface({ lastRoomId }: { lastRoomId: string }) {
  const reflector = useMemo(() => {
    const surface = new Reflector(
      new PlaneGeometry(11.96, 17.96 + roomOffset(lastRoomId)),
      {
        textureWidth: 512,
        textureHeight: 512,
        clipBias: 0.002,
        color: new Color(0.5, 0.5, 0.5),
      },
    );
    surface.rotation.x = -Math.PI / 2;
    surface.position.set(0, 0.009, roomOffset(lastRoomId) / 2);
    const material = surface.material as ShaderMaterial;
    material.transparent = true;
    material.depthWrite = false;
    material.fragmentShader = material.fragmentShader
      .replace(
        "vec4 base = texture2DProj( tDiffuse, vUv );",
        `
        vec2 uv = vUv.xy / vUv.w;
        vec4 base = texture2D(tDiffuse, uv) * 0.4;
        base += texture2D(tDiffuse, uv + vec2(.003, 0.0)) * .15;
        base += texture2D(tDiffuse, uv - vec2(.003, 0.0)) * .15;
        base += texture2D(tDiffuse, uv + vec2(0.0, .003)) * .15;
        base += texture2D(tDiffuse, uv - vec2(0.0, .003)) * .15;
      `,
      )
      .replace(
        "blendOverlay( base.rgb, color ), 1.0",
        "blendOverlay( base.rgb, color ), 0.11",
      );
    return surface;
  }, [lastRoomId]);
  useEffect(
    () => () => {
      reflector.geometry.dispose();
      reflector.dispose();
    },
    [reflector],
  );
  return <primitive object={reflector} />;
}
