"use client";
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Mesh } from "three";
import { roomOffset } from "@/lib/museum/config";
import { architecturalMaterial } from "./bakedMaterials";

export function MuseumOutside({ lastRoomId }: { lastRoomId: string }) {
  const { scene } = useGLTF("/museum/outside-baked.glb", "/museum/draco/");
  const model = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((object) => {
      if (object instanceof Mesh) {
        object.material = Array.isArray(object.material)
          ? object.material.map((material) => architecturalMaterial(material))
          : architecturalMaterial(object.material);
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return copy;
  }, [scene]);
  return (
    <primitive object={model} position={[0, 0, roomOffset(lastRoomId) + 9]} />
  );
}
