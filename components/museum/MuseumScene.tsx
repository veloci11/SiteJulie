"use client";
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Texture,
  type Group,
} from "three";
import type { Destination, PublicData } from "@/lib/data/types";
import { getSlots, roomOffset } from "@/lib/museum/config";
import {
  roomForDestination,
  validatePlacements,
} from "@/lib/museum/navigation";
import { CameraDirector } from "./CameraDirector";
import { ArtworkFrame } from "./ArtworkFrame";
import { visibleCartels } from "@/lib/museum/cartels";
import { MuseumLighting } from "./MuseumLighting";
import { RenderQuality } from "./RenderQuality";
import { architecturalMaterial } from "./bakedMaterials";
import { useSurfaceDetails } from "./SurfaceDetails";
import { CompanionPlants } from "./CompanionPlants";
const HALL = "/museum/hall-daylight.glb";
const SALON = "/museum/extension-contemporary.glb";
const TERMINAL = "/museum/extension-terminal-contemporary.glb";
const END_CAP = "/museum/end-cap-contemporary.glb";
const FIG_READING = "/museum/fig-reading.glb?v=distinct-ficus-soil-3";
const FIG_CENTRAL = "/museum/fig-central.glb?v=distinct-ficus-soil-3";
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
        // Suspended renders have no effect references yet. Evicting here
        // repeatedly reloads a catalogue larger than the cache budget.
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
    trimTextures();
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
  onLookResume?: (roomId: string) => void;
  allowManualLook?: boolean;
  onLookStateChange?: (
    state: "dragging" | "resuming" | "blocked" | "idle",
  ) => void;
  onPixelRatio?: (ratio: number) => void;
  /** Poster captures must include the rooms visible through the doorways. */
  captureAllRooms?: boolean;
  onRoomLoading?: (loading: boolean) => void;
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
      const name = `anchor_slot_${String(slot.anchorIndex ?? slot.geometryAnchorIndex ?? index + 1).padStart(2, "0")}`;
      const anchor = model.getObjectByName(name);
      if (!anchor) throw new Error(`Ancre GLB absente : ${name}`);
      const point = anchor.getWorldPosition(new Vector3());
      point.y += slot.anchorOffsetY ?? 0;
      point.x += slot.geometryAnchorOffsetX ?? 0;
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
        material.envMapIntensity = 0.32;
        // A quiet underside variation, without flashing pale faces as we pass.
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <color_fragment>",
            `#include <color_fragment>
            if (!gl_FrontFacing) {
              float leafLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(leafLuma), 0.13) * 1.06;
            }`,
          );
        };
        material.customProgramCacheKey = () => "ficus-muted-underside-v2";
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
class RoomBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("Museum room:", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function RoomContent({
  roomId,
  version,
  props,
  onReady,
  onError,
}: {
  roomId: string;
  version: string;
  props: MuseumProps;
  onReady: (version: string) => void;
  onError: () => void;
}) {
  const { data } = props;
  const terminal = roomId === data.rooms.at(-1);
  // Only this room's models compete with its paintings for network/decoder time.
  useGLTF.preload(
    roomId === "room-1" ? HALL : terminal ? TERMINAL : SALON,
    "/museum/draco/",
  );
  useGLTF.preload(
    roomId === "room-1" ? FIG_READING : FIG_CENTRAL,
    "/museum/draco/",
  );
  if (data.rooms.length === 1) useGLTF.preload(END_CAP, "/museum/draco/");
  const artworks = useMemo(
    () => data.artworks.filter((a) => a.roomId === roomId),
    [data, roomId],
  );
  const textures = useArtworkTextures(artworks.map((a) => a.image));
  const cartels = useMemo(() => visibleCartels(artworks), [artworks]);
  const group = useRef<Group>(null);
  const { gl, camera, scene, invalidate } = useThree();
  const failure = useRef(onError);
  failure.current = onError;
  useEffect(() => {
    let active = true;
    const root = group.current!;
    const uploaded = new Set<Texture>();
    for (const texture of textures)
      texture.anisotropy = gl.capabilities.getMaxAnisotropy();
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        for (const value of Object.values(material))
          if (
            value &&
            typeof value === "object" &&
            "isTexture" in value &&
            value.isTexture
          )
            uploaded.add(value as Texture);
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
      if (active) await gl.compileAsync(root, camera, scene);
      if (active) {
        invalidate(3);
        onReady(version);
      }
    };
    void prepare().catch((error) => {
      console.error("Museum room warmup:", error);
      if (active) failure.current();
    });
    return () => {
      active = false;
    };
    // version owns the room's resources and placements, not selection or camera state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, gl, camera, scene, invalidate, onReady]);
  return (
    <group ref={group}>
      <Architecture roomId={roomId} terminal={terminal} />
      {data.rooms.length === 1 && <ClosedEnd roomId={roomId} />}
      <RoomFigs roomId={roomId} />
      <CompanionPlants roomId={roomId} />
      {artworks.map((artwork, i) => (
        <ArtworkFrame
          key={artwork.id}
          artwork={artwork}
          texture={textures[i]}
          selected={props.selectedArtworkId === artwork.id}
          showCartel={cartels.has(artwork.id)}
          onSelect={props.onSelect}
        />
      ))}
    </group>
  );
}

export function MuseumScene(props: MuseumProps) {
  const { data, destination } = props;
  const targetRoom = roomForDestination(destination, data);
  const { gl, scene } = useThree();
  const callbacks = useRef(props);
  callbacks.current = props;
  const started = useRef(performance.now());
  const announced = useRef(false);
  const [mounted, setMounted] = useState<string[]>([targetRoom]);
  const [ready, setReady] = useState<Set<string>>(() => new Set());
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [committed, setCommitted] = useState<{
    destination: Destination;
    navigationId: number;
  } | null>(null);
  const versions = useMemo(() => {
    validatePlacements(data);
    return new Map(
      data.rooms.map((room) => [
        room,
        JSON.stringify([
          data.rooms,
          data.artworks.filter((a) => a.roomId === room),
        ]),
      ]),
    );
  }, [data]);
  // Every room crossed by the camera must be ready, including intermediate rooms.
  const currentRoom = committed
    ? roomForDestination(committed.destination, data)
    : targetRoom;
  const from = data.rooms.indexOf(currentRoom),
    to = data.rooms.indexOf(targetRoom);
  const required = data.rooms.slice(Math.min(from, to), Math.max(from, to) + 1);
  const visibleRooms = data.rooms.filter(
    (room) =>
      mounted.includes(room) ||
      required.includes(room) ||
      props.captureAllRooms,
  );
  const loadedRooms = data.rooms.filter((room) =>
    ready.has(versions.get(room)!),
  );
  const routeReady = required.every((room) => loadedRooms.includes(room));
  const allReady = loadedRooms.length === data.rooms.length;
  const readyKey = loadedRooms.join("|");
  const mountedKey = visibleRooms.join("|");
  const requiredKey = required.join("|");
  const onRoomReady = useCallback(
    (version: string) =>
      setReady((previous) => {
        if (previous.has(version)) return previous;
        return new Set(previous).add(version);
      }),
    [],
  );
  const onRoomError = useCallback(
    (version: string) =>
      setFailed((previous) => new Set(previous).add(version)),
    [],
  );
  useEffect(() => {
    setMounted((previous) => [...new Set([...previous, ...required])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredKey]);
  useEffect(() => {
    if (required.some((room) => failed.has(versions.get(room)!)))
      callbacks.current.onError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, versions, requiredKey]);
  useEffect(() => {
    if (routeReady)
      setCommitted({ destination, navigationId: props.navigationId });
    // destination and id are one navigation request; last request wins when loading finishes.
  }, [routeReady, destination, props.navigationId]);
  useEffect(() => {
    callbacks.current.onRoomLoading?.(!routeReady);
    gl.domElement.dataset.loadedRooms = readyKey;
    gl.domElement.dataset.allRoomsReady = String(allReady);
    gl.domElement.dataset.pendingRoom = routeReady ? "" : targetRoom;
    scene.userData.room = currentRoom;
    scene.userData.artworkCount = data.artworks.length;
    if (
      routeReady &&
      (!props.captureAllRooms || allReady) &&
      !announced.current
    ) {
      announced.current = true;
      gl.domElement.dataset.warmupMs = (
        performance.now() - started.current
      ).toFixed(1);
      gl.domElement.dataset.rendererReady = "true";
      performance.mark("museum-ready");
      callbacks.current.onReady();
    }
  }, [
    readyKey,
    allReady,
    routeReady,
    targetRoom,
    currentRoom,
    props.captureAllRooms,
    data,
    gl,
    scene,
  ]);
  useEffect(() => {
    if (!routeReady || props.captureAllRooms) return;
    // Let the entrance paint and accept input before fetching another room.
    if (
      visibleRooms.some(
        (room) =>
          !ready.has(versions.get(room)!) && !failed.has(versions.get(room)!),
      )
    )
      return;
    const next = data.rooms.find((room) => !visibleRooms.includes(room));
    if (!next) return;
    const timer = setTimeout(
      () => setMounted((previous) => [...new Set([...previous, next])]),
      650,
    );
    return () => clearTimeout(timer);
    // Room membership/version changes drive prefetch, not pointer/selection updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeReady,
    readyKey,
    mountedKey,
    versions,
    failed,
    props.captureAllRooms,
  ]);
  const frameStats = useRef({
    count: 0,
    lastReport: 0,
    samples: [] as number[],
  });
  useFrame((_, delta) => {
    const stats = frameStats.current;
    stats.count++;
    // Exclude idle demand-rendering gaps; collect real active frame timings.
    if (delta > 0 && delta < 0.15) stats.samples.push(delta * 1000);
    const now = performance.now();
    if (now - stats.lastReport < 1000) return;
    stats.lastReport = now;
    const canvas = gl.domElement;
    canvas.dataset.frameCount = String(stats.count);
    canvas.dataset.pixelRatio = gl.getPixelRatio().toFixed(4);
    canvas.dataset.drawingBuffer = `${canvas.width}x${canvas.height}`;
    canvas.dataset.drawCalls = String(gl.info.render.calls);
    canvas.dataset.triangles = String(gl.info.render.triangles);
    canvas.dataset.textures = String(gl.info.memory.textures);
    if (stats.samples.length >= 12) {
      const ordered = stats.samples.sort((a, b) => a - b);
      canvas.dataset.frameMedianMs =
        ordered[Math.floor(ordered.length * 0.5)].toFixed(1);
      canvas.dataset.frameP95Ms =
        ordered[
          Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))
        ].toFixed(1);
    }
    stats.samples.length = 0;
  }, -2);
  return (
    <>
      <MuseumLighting />
      <RenderQuality onPixelRatio={props.onPixelRatio} />
      {visibleRooms.map((roomId) => (
        <RoomBoundary
          key={roomId + versions.get(roomId)}
          onError={() => onRoomError(versions.get(roomId)!)}
        >
          <Suspense fallback={null}>
            <RoomContent
              roomId={roomId}
              version={versions.get(roomId)!}
              props={props}
              onReady={onRoomReady}
              onError={() => onRoomError(versions.get(roomId)!)}
            />
          </Suspense>
        </RoomBoundary>
      ))}
      {committed && (
        <CameraDirector
          {...props}
          {...committed}
          ambientTour={props.ambientTour && routeReady}
          onArrive={(id) => callbacks.current.onArrive(id)}
        />
      )}
    </>
  );
}
