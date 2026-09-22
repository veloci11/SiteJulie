"use client";
import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import plants from "@/lib/museum/companion-plants.json";
import { roomOffset } from "@/lib/museum/config";

useGLTF.preload(plants.asset, "/museum/draco/");

export function CompanionPlants({ roomId }: { roomId: string }) {
  const { scene } = useGLTF(plants.asset, "/museum/draco/");
  const { gl } = useThree();
  const placements = roomId === "room-1" ? plants.hall : plants.extension;
  const specimens = useMemo(
    () =>
      placements.map((placement) => {
        const source = scene.getObjectByName(placement.species);
        if (!source) throw new Error(`Plante absente : ${placement.species}`);
        const copy = source.clone(true);
        copy.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          if (Array.isArray(object.material)) return;
          if (object.name.endsWith("_contact")) {
            object.material = new MeshBasicMaterial({
              color: "#35291e",
              vertexColors: true,
              transparent: true,
              opacity: 0.8,
              depthWrite: false,
              side: 2,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -1,
            });
            object.renderOrder = -1;
            return;
          }
          if (object.material instanceof MeshStandardMaterial) {
            const material = object.material.clone();
            material.envMapIntensity = object.name.includes("leaves")
              ? 0.3
              : 0.2;
            for (const texture of [material.map, material.normalMap])
              if (texture)
                texture.anisotropy = Math.min(
                  8,
                  gl.capabilities.getMaxAnisotropy(),
                );
            object.material = material;
          } else {
            // Soft contact patches belong on the floor, below the opaque pot.
            object.renderOrder = -1;
            object.material = object.material.clone();
            object.material.depthWrite = false;
          }
        });
        return copy;
      }),
    [scene, placements, gl],
  );
  useEffect(
    () => () => {
      for (const specimen of specimens)
        specimen.traverse((object) => {
          if (object instanceof Mesh && !Array.isArray(object.material))
            object.material.dispose();
        });
    },
    [specimens],
  );
  return (
    <group position={[0, 0, roomOffset(roomId)]}>
      {placements.map((placement, index) => (
        <primitive
          key={placement.id}
          object={specimens[index]}
          position={placement.position as [number, number, number]}
          rotation={[0, placement.rotation, 0]}
          scale={placement.scale}
        />
      ))}
    </group>
  );
}
