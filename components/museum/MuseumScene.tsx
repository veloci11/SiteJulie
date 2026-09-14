"use client";
import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Texture,
} from "three";
import type { Destination, PublicData } from "@/lib/data/types";
import { getSlots, roomOffset } from "@/lib/museum/config";
import {
  roomForDestination,
  validatePlacements,
} from "@/lib/museum/navigation";
import { CameraDirector } from "./CameraDirector";
import { ArtworkFrame } from "./ArtworkFrame";
import { MuseumLighting } from "./MuseumLighting";
import { RenderQuality } from "./RenderQuality";
import { architecturalMaterial } from "./bakedMaterials";
import { useSurfaceDetails } from "./SurfaceDetails";
const HALL = "/museum/hall-contemporary.glb";
const SALON = "/museum/extension-contemporary.glb";
const TERMINAL = "/museum/extension-terminal-contemporary.glb";
const END_CAP = "/museum/end-cap-contemporary.glb";
const FIG_READING = "/museum/fig-reading.glb";
const FIG_CENTRAL = "/museum/fig-central.glb";
// Start geometry alongside the paintings instead of behind their Suspense read.
for (const path of [HALL, TERMINAL, FIG_READING, FIG_CENTRAL])
  useGLTF.preload(path, "/museum/draco/");
interface TextureRecord {
  texture?: Texture;
  error?: Error;
  promise: Promise<void>;
  references: number;
  touched: number;
}
const texturePool = new Map<string, TextureRecord>();
function trimTextures(onlyUnused = false) {
  const candidates = [...texturePool.entries()]
    .filter(([, r]) => r.references === 0 && r.texture)
    .sort((a, b) => a[1].touched - b[1].touched);
  for (const [key, record] of candidates) {
    if (!onlyUnused && texturePool.size <= 24) break;
    record.texture?.dispose();
    texturePool.delete(key);
  }
}
function requestTexture(url: string): TextureRecord {
  const existing = texturePool.get(url);
  if (existing) {
    existing.touched = Date.now();
    return existing;
  }
  const record: TextureRecord = {
    promise: Promise.resolve(),
    references: 0,
    touched: Date.now(),
  };
  record.promise = new Promise((resolve) =>
    new TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 4;
        record.texture = texture;
        resolve();
        trimTextures();
      },
      undefined,
      (error) => {
        record.error =
          error instanceof Error ? error : new Error("Image indisponible");
        resolve();
      },
    ),
  );
  texturePool.set(url, record);
  return record;
}
function useArtworkTextures(urls: string[]) {
  // A stable URL owns one texture, regardless of changing room combinations.
  // Current + destination room are retained; superseded room textures are disposed.
  const records = urls.map(requestTexture);
  const pending = records.filter((r) => !r.texture && !r.error);
  if (pending.length) throw Promise.all(pending.map((r) => r.promise));
  for (const record of records) if (record.error) throw record.error;
  const key = urls.join("|");
  useEffect(() => {
    for (const record of records) record.references++;
    return () => {
      for (const record of records) record.references--;
      queueMicrotask(() => trimTextures(true));
    };
    // The URL key determines exactly the retained resources.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return records.map((r) => r.texture!);
}
export interface MuseumProps {
  data: PublicData;
  destination: Destination;
  navigationId: number;
  reducedMotion: boolean;
  onSelect: (destination: Destination) => void;
  onArrive: (id: number) => void;
  onReady: () => void;
  onError: () => void;
  skipTransition?: boolean;
  ambientTour?: boolean;
  roomAutoplay?: boolean;
  resumeFromCurrent?: boolean;
  selectedArtworkId: string | null;
  onPointerMissed: () => void;
  onTourArtwork?: (artworkId: string | null) => void;
  onPixelRatio?: (ratio: number) => void;
}
function Architecture({
  roomId,
  terminal,
}: {
  roomId: string;
  terminal: boolean;
}) {
  const details = useSurfaceDetails();
  const { scene } = useGLTF(
    roomId === "room-1" ? HALL : terminal ? TERMINAL : SALON,
    "/museum/draco/",
  );
  const model = useMemo(() => {
    const model = scene.clone(true);
    model.updateMatrixWorld(true);
    for (const [index, slot] of getSlots(roomId).entries()) {
      const name = `anchor_slot_${String(index + 1).padStart(2, "0")}`;
      const anchor = model.getObjectByName(name);
      if (!anchor) throw new Error(`Ancre GLB absente : ${name}`);
      const point = anchor.getWorldPosition(new Vector3());
      if (
        point.distanceTo(
          new Vector3(
            slot.position[0],
            slot.position[1],
            slot.position[2] - roomOffset(roomId),
          ),
        ) > 0.02
      )
        throw new Error(`Ancre GLB incompatible : ${name}`);
    }
    model.traverse((o) => {
      if (o instanceof Mesh) {
        o.material = Array.isArray(o.material)
          ? o.material.map((material) =>
              architecturalMaterial(material, details),
            )
          : architecturalMaterial(o.material, details);
      }
    });
    return model;
  }, [scene, roomId, details]);
  return <primitive object={model} position={[0, 0, roomOffset(roomId)]} />;
}
function ClosedEnd({ roomId }: { roomId: string }) {
  const details = useSurfaceDetails();
  const { scene } = useGLTF(END_CAP, "/museum/draco/");
  const model = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((object) => {
      if (object instanceof Mesh)
        object.material = Array.isArray(object.material)
          ? object.material.map((material) =>
              architecturalMaterial(material, details),
            )
          : architecturalMaterial(object.material, details);
    });
    return copy;
  }, [scene, details]);
  return <primitive object={model} position={[0, 0, roomOffset(roomId)]} />;
}
function RoomFigs({ roomId }: { roomId: string }) {
  const hall = roomId === "room-1";
  const { scene } = useGLTF(hall ? FIG_READING : FIG_CENTRAL, "/museum/draco/");
  const { gl } = useThree();
  const tree = useMemo(() => {
    const copy = scene.clone(true);
    const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    copy.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      if (
        object.material instanceof MeshStandardMaterial &&
        object.material.name.includes("curved lamina")
      ) {
        const material = object.material.clone();
        // A paler, less saturated underside on the same opaque leaf surface.
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <color_fragment>",
            `#include <color_fragment>
            if (!gl_FrontFacing) {
              float leafLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(leafLuma), 0.18) * 1.18;
            }`,
          );
        };
        material.customProgramCacheKey = () => "fig-pale-underside-v1";
        object.material = material;
      }
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials)
        for (const value of Object.values(material))
          if (
            value &&
            typeof value === "object" &&
            "isTexture" in value &&
            value.isTexture
          )
            (value as Texture).anisotropy = anisotropy;
    });
    return copy;
  }, [scene, gl]);
  // A side tree opens the first room; a central specimen anchors the salon.
  // Each specimen has its own branching, leaf sizes and canopy silhouette.
  return (
    <group position={[0, 0, roomOffset(roomId)]}>
      <primitive
        object={tree}
        position={hall ? [-4.7, 0.035, 4.35] : [0.55, 0.02, -1.35]}
        scale={hall ? 0.95 : 1}
        rotation={[0, hall ? 0.4 : 2.8, 0]}
      />
    </group>
  );
}
export function MuseumScene(props: MuseumProps) {
  const { data, destination, onReady, onArrive } = props;
  const targetRoom = roomForDestination(destination, data);
  // Eight works are ready before the first visit; changing room never suspends
  // the active camera or removes the previously visible paintings.
  const artworks = data.artworks;
  const textures = useArtworkTextures(artworks.map((a) => a.image));
  const { invalidate, gl, scene, camera } = useThree();
  const callbacks = useRef({ onReady, onArrive });
  callbacks.current = { onReady, onArrive };
  useMemo(() => {
    validatePlacements(data);
    for (const texture of textures) {
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = gl.capabilities.getMaxAnisotropy();
    }
  }, [data, textures, gl]);
  useEffect(() => {
    scene.userData.room = targetRoom;
  }, [scene, targetRoom]);
  useEffect(() => {
    let active = true;
    scene.userData.artworkCount = artworks.length;
    const started = performance.now();
    // Keep the main thread responsive while preparing both small room atlases.
    const uploaded = new Set<Texture>();
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (
            value &&
            typeof value === "object" &&
            "isTexture" in value &&
            value.isTexture &&
            !uploaded.has(value as Texture)
          ) {
            uploaded.add(value as Texture);
          }
        }
      }
    });
    const prepare = async () => {
      let slice = performance.now();
      for (const texture of uploaded) {
        if (!active) return;
        gl.initTexture(texture);
        if (performance.now() - slice > 8) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          slice = performance.now();
        }
      }
      if (active) await gl.compileAsync(scene, camera);
    };
    invalidate(2);
    void prepare()
      .then(() => {
        if (active) {
          invalidate(3);
          gl.domElement.dataset.warmupMs = (
            performance.now() - started
          ).toFixed(1);
          gl.domElement.dataset.rendererReady = "true";
          performance.mark("museum-ready");
          callbacks.current.onReady();
        }
      })
      .catch((error) => {
        console.error("Museum warmup:", error);
        if (active) props.onError();
      });
    return () => {
      active = false;
    };
    // onError is stable in MuseumShell; target changes only move the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, gl, camera, data, artworks.length, invalidate]);
  const frameCount = useRef(0);
  useFrame(() => {
    const canvas = gl.domElement;
    canvas.dataset.frameCount = String(++frameCount.current);
    canvas.dataset.pixelRatio = gl.getPixelRatio().toFixed(4);
    canvas.dataset.drawingBuffer = `${canvas.width}x${canvas.height}`;
    canvas.dataset.drawCalls = String(gl.info.render.calls);
    canvas.dataset.triangles = String(gl.info.render.triangles);
    canvas.dataset.textures = String(gl.info.memory.textures);
  }, -2);
  return (
    <>
      <MuseumLighting />
      <RenderQuality onPixelRatio={props.onPixelRatio} />
      {data.rooms.length === 1 && <ClosedEnd roomId="room-1" />}
      {data.rooms.map((roomId) => (
        <group key={roomId}>
          <Architecture
            roomId={roomId}
            terminal={roomId === data.rooms.at(-1)}
          />
          <RoomFigs roomId={roomId} />
        </group>
      ))}
      {artworks.map((artwork, i) => (
        <ArtworkFrame
          key={artwork.id}
          artwork={artwork}
          texture={textures[i]}
          selected={props.selectedArtworkId === artwork.id}
          onSelect={props.onSelect}
        />
      ))}
      <CameraDirector
        {...props}
        onArrive={(id) => {
          callbacks.current.onArrive(id);
        }}
      />
    </>
  );
}
