import { CatmullRomCurve3, Vector3 } from "three";
import type { Artwork, Destination, PublicData } from "@/lib/data/types";
import architectureManifest from "../../public/museum/manifest.json";
import companionPlants from "./companion-plants.json";
import {
  ROOM_DEPTH,
  FRAME_OUTSET,
  CARTEL_WIDTH,
  CARTEL_HEIGHT,
  CARTEL_GAP,
  FRAME_FRONT_DEPTH,
  ARTWORK_IMAGE_DEPTH,
  artworkSize,
  getSlots,
  roomOffset,
  slotForArtwork,
  type Vec3,
} from "./config";
export const CAMERA_RADIUS = 0.32;
export const CAMERA_FOV = 60;
export const MAX_CAMERA_SPEED = 3.2;
export const MAX_CAMERA_ANGULAR_SPEED = (40 * Math.PI) / 180;
export const CAMERA_EYE_HEIGHT = 2.05;
export const MAX_CAMERA_ANGULAR_ACCELERATION = Math.PI / 3;
export const MAX_CAMERA_TRANSLATION_ACCELERATION = 2;
export const MAX_CAMERA_LATERAL_ACCELERATION = 2.5;
export interface CameraPose {
  position: Vec3;
  target: Vec3;
  offsetPx: number;
  offsetYPx: number;
  roomId: string;
  fov?: number;
  /** A room change should face its walking route before leaving the current spot. */
  roomEntry?: boolean;
  artworkFocus?: boolean;
}
export interface Obstacle {
  min: Vec3;
  max: Vec3;
  name: string;
}
export const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  a.map((v, i) => v + (b[i] - v) * t) as Vec3;
export function roomForDestination(destination: Destination, data: PublicData) {
  if (destination.kind === "artwork")
    return (
      data.artworks.find((a) => a.id === destination.artworkId)?.roomId ??
      "room-1"
    );
  return destination.kind === "room" ? destination.roomId : "room-1";
}
export function artworkInsets(width: number, height: number) {
  const compactLandscape = height <= 520 && width > height;
  const portrait = width <= 700 && !compactLandscape;
  let top = portrait ? 128 : compactLandscape ? 120 : 96;
  let bottom = portrait ? 224 : 90;
  let right = portrait ? 0 : compactLandscape ? 280 : 330;
  const verticalBudget = Math.max(0, height - Math.max(96, height * 0.38));
  const verticalScale = Math.min(1, verticalBudget / (top + bottom));
  top *= verticalScale;
  bottom *= verticalScale;
  right = Math.min(right, width * (compactLandscape ? 0.4 : 0.42));
  return { top, bottom, right };
}
export function focusDistance(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  sidebar = 0,
  fov = CAMERA_FOV,
  top = 0,
  bottom = 0,
) {
  const tangent = Math.tan((fov * Math.PI) / 360);
  const availableHeight = Math.max(1, viewportHeight - top - bottom);
  const availableWidth = Math.max(1, viewportWidth - sidebar);
  return (
    Math.max(
      (height * viewportHeight) / (2 * tangent * availableHeight),
      (width * viewportHeight) / (2 * tangent * availableWidth),
    ) * 1.14
  );
}
export function artworkPose(
  artwork: Artwork,
  width: number,
  height: number,
  framing?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    breathingRoom?: number;
  },
): CameraPose {
  const slot = slotForArtwork(artwork);
  if (!slot) throw new Error(`Emplacement inconnu : ${artwork.slotId}`);
  const size = artworkSize(artwork, slot);
  const topExtent = size.height / 2 + FRAME_OUTSET / 2;
  const bottomExtent = size.height / 2 + CARTEL_GAP + CARTEL_HEIGHT / 2;
  const contentWidth = Math.max(size.width + FRAME_OUTSET, CARTEL_WIDTH);
  const contentHeight = topExtent + bottomExtent;
  const centerY = (topExtent - bottomExtent) / 2;
  const inset = framing ?? { ...artworkInsets(width, height), left: 0 };
  const target = slot.position.map(
    (v, i) =>
      v + slot.wallNormal[i] * ARTWORK_IMAGE_DEPTH + (i === 1 ? centerY : 0),
  ) as Vec3;
  const desired =
    focusDistance(
      contentWidth,
      contentHeight,
      width,
      height,
      inset.right + inset.left,
      CAMERA_FOV,
      inset.top,
      inset.bottom,
    ) * (framing?.breathingRoom ?? 1);
  const localZ = target[2] - roomOffset(artwork.roomId);
  // A tall/narrow viewport may request a distance behind the opposite wall.
  // Keep the whole camera inside this room, and widen only the optical field
  // needed to show the complete frame, rather than clipping or crossing rooms.
  const maxDistance =
    Math.abs(slot.wallNormal[0]) > 0.5
      ? 5.25 - target[0] * slot.wallNormal[0]
      : 8.25 - localZ * slot.wallNormal[2];
  const frontGap = FRAME_FRONT_DEPTH - ARTWORK_IMAGE_DEPTH;
  let d = Math.min(desired + frontGap, maxDistance);
  const obstacles = navigationObstaclesForRooms([artwork.roomId]);
  const positionAt = (value: number) =>
    target.map((x, i) =>
      i === 1 ? CAMERA_EYE_HEIGHT : x + slot.wallNormal[i] * value,
    ) as Vec3;
  // A larger plant can occupy the nominal focus point. Back away along the
  // artwork normal until the whole camera clears it, keeping the frame intact.
  while (
    d < maxDistance &&
    !segmentIsClear(positionAt(d), positionAt(d), obstacles)
  )
    d = Math.min(maxDistance, d + 0.05);
  const circulation = navigationNodes([artwork.roomId])
    .map((point) => [point[0], CAMERA_EYE_HEIGHT, point[2]] as Vec3)
    .find((point) => segmentIsClear(point, point, obstacles));
  const reachable = (value: number) => {
    if (!circulation) return false;
    if (!segmentIsClear(positionAt(value), positionAt(value), obstacles))
      return false;
    try {
      safeRoute(
        circulation,
        positionAt(value),
        [artwork.roomId],
      );
      return true;
    } catch {
      return false;
    }
  };
  // A point can clear every object yet sit in an enclosed pocket between
  // furniture. Use the accessible side and widen the lens when backing away
  // would strand the visitor behind the reading table/chair.
  let found = reachable(d);
  const nominal = Math.min(desired + frontGap, maxDistance);
  for (let step = 1; !found && step <= Math.ceil(maxDistance / 0.05); step++) {
    for (const value of [nominal + step * 0.05, nominal - step * 0.05]) {
      if (value > maxDistance || value <= CAMERA_RADIUS + frontGap) continue;
      if (reachable(value)) {
        d = value;
        found = true;
        break;
      }
    }
  }
  if (!found)
    throw new Error(`Aucun cadrage libre pour ${artwork.id}.`);
  const fov =
    desired + frontGap <= d
      ? CAMERA_FOV
      : (2 *
          Math.atan(
            (Math.tan((CAMERA_FOV * Math.PI) / 360) * desired) / (d - frontGap),
          ) *
          180) /
        Math.PI;
  return {
    position: positionAt(d),
    target,
    offsetPx: (inset.right - inset.left) / 2,
    offsetYPx: (inset.bottom - inset.top) / 2,
    roomId: artwork.roomId,
    artworkFocus: true,
    fov,
  };
}
export function destinationPose(
  destination: Destination,
  data: PublicData,
  width: number,
  height: number,
): CameraPose {
  if (destination.kind === "artwork") {
    const artwork = data.artworks.find((a) => a.id === destination.artworkId);
    if (!artwork) throw new Error("Cette œuvre n’est plus exposée.");
    return artworkPose(artwork, width, height);
  }
  if (destination.kind === "about" || destination.kind === "contact") {
    const side = destination.kind === "about" ? -1 : 1;
    const inset = artworkInsets(width, height);
    const d = focusDistance(
      2.6,
      1.7,
      width,
      height,
      inset.right,
      CAMERA_FOV,
      inset.top,
      inset.bottom,
    );
    return {
      position: [side * (9.8 - d), CAMERA_EYE_HEIGHT, -6.5],
      target: [side * 9.8, 2.8, -6.5],
      offsetPx: inset.right / 2,
      offsetYPx: (inset.bottom - inset.top) / 2,
      roomId: "room-1",
    };
  }
  const roomId = destination.kind === "room" ? destination.roomId : "room-1";
  const z = roomOffset(roomId);
  const portrait = width <= 700 && !(height <= 520 && width > height);
  return {
    position: portrait ? [0.35, 1.9, 5.5 + z] : [0.8, 1.8, 8.2 + z],
    target: [
      portrait ? (roomId === "room-1" ? -0.25 : -2.4) : -2.2,
      2.2,
      -6.5 + z,
    ],
    offsetPx: 0,
    offsetYPx: portrait ? 105 : 90,
    roomId,
  };
}
/** Arrive inside the requested doorway, facing the direction of travel. */
export function roomArrivalPose(
  roomId: string,
  from: CameraMotionSample,
  width: number,
  height: number,
  rooms: string[],
): CameraPose {
  const targetIndex = rooms.indexOf(roomId);
  if (targetIndex < 0) throw new Error("Salle inconnue");
  const sourceIndex = Math.max(
    0,
    Math.min(
      rooms.length - 1,
      Math.floor((from.position[2] + ROOM_DEPTH / 2) / ROOM_DEPTH),
    ),
  );
  const portrait = width <= 700 && height >= width;
  const lens = {
    offsetPx: 0,
    offsetYPx: portrait ? 20 : 34,
    fov: portrait ? 68 : 60,
  };
  if (sourceIndex === targetIndex) {
    return {
      ...lens,
      position: [...from.position],
      target: motionLookTarget(from),
      roomId,
    };
  }
  const direction = targetIndex > sourceIndex ? 1 : -1;
  const z = roomOffset(roomId) - direction * (ROOM_DEPTH / 2 - 1.8);
  return {
    ...lens,
    position: [0, CAMERA_EYE_HEIGHT, z],
    target: [0, 2.1, z + direction * 6],
    roomId,
    roomEntry: true,
  };
}
// Collision proxies match the generated architectural manifest; expanded by the
// camera volume (including its near plane), never only checked as a point.
interface ManifestObstacle {
  kind: string;
  min: number[];
  max: number[];
}
interface NavigationManifest {
  obstacles: ManifestObstacle[];
  obstaclesByModule?: {
    hall: ManifestObstacle[];
    extension: ManifestObstacle[];
  };
}
export function obstaclesForRooms(roomIds: string[]): Obstacle[] {
  const manifest = architectureManifest as NavigationManifest;
  const out: Obstacle[] = [];
  for (const roomId of roomIds) {
    const z = roomOffset(roomId);
    const add = (name: string, min: Vec3, max: Vec3) =>
      out.push({
        name: `${roomId}:${name}`,
        min: [min[0], min[1], min[2] + z],
        max: [max[0], max[1], max[2] + z],
      });
    for (const side of [-1, 1]) {
      const a = side === 1 ? 5.85 : -6.15,
        b = side === 1 ? 6.15 : -5.85;
      add("side-front", [a, 0, -5.2], [b, 7, 9]);
      add("side-back", [a, 0, -9], [b, 7, -7.8]);
      const lo = side === 1 ? 6 : -10,
        hi = side === 1 ? 10 : -6;
      add("alcove-front", [lo, 0, -4.15], [hi, 7, -3.85]);
      add("alcove-back", [lo, 0, -9.15], [hi, 7, -8.85]);
      add(
        "alcove-end",
        [side === 1 ? 9.85 : -10.15, 0, -9.15],
        [side === 1 ? 10.15 : -9.85, 7, -3.8],
      );
      // The camera volume must also clear the lintels, not just each 2D opening.
      add("side-lintel", [a, 3.5, -7.8], [b, 7, -5.2]);
    }
    const module = roomId === "room-1" ? "hall" : "extension";
    for (const plant of companionPlants[module]) {
      const species =
        companionPlants.species[
          plant.species as keyof typeof companionPlants.species
        ];
      const radius = species.radius * plant.scale;
      const [x, y, localZ] = plant.position;
      add(
        `plant-${plant.id}`,
        [x - radius, y, localZ - radius],
        [x + radius, y + species.height * plant.scale, localZ + radius],
      );
    }
    for (const obstacle of manifest.obstaclesByModule?.[module] ??
      manifest.obstacles)
      add(obstacle.kind, obstacle.min as Vec3, obstacle.max as Vec3);
    add("entrance-left", [-6, 0, 8.85], [-1.6, 7, 9.15]);
    add("entrance-right", [1.6, 0, 8.85], [6, 7, 9.15]);
    add("entrance-lintel", [-1.6, 3.8, 8.85], [1.6, 7, 9.15]);
    if (roomId === "room-1") add("back", [-6, 0, -9.15], [6, 7, -8.85]);
    else {
      add("back-left", [-6, 0, -9.15], [-1.6, 7, -8.85]);
      add("back-right", [1.6, 0, -9.15], [6, 7, -8.85]);
      add("back-lintel", [-1.6, 3.8, -9.15], [1.6, 7, -8.85]);
    }
  }
  const terminalZ = roomOffset(roomIds.at(-1) ?? "room-1") + ROOM_DEPTH / 2;
  out.push({
    name: "terminal-wall",
    min: [-6, 0, terminalZ - 0.15],
    max: [6, 7, terminalZ + 0.15],
  });
  return out;
}
/** A human-height camera must walk around low furniture, never fly over it. */
export function navigationObstaclesForRooms(roomIds: string[]): Obstacle[] {
  return obstaclesForRooms(roomIds).map((box) =>
    box.min[1] < CAMERA_EYE_HEIGHT && box.max[1] >= 0.3
      ? {
          ...box,
          max: [
            box.max[0],
            Math.max(box.max[1], CAMERA_EYE_HEIGHT + CAMERA_RADIUS),
            box.max[2],
          ] as Vec3,
        }
      : box,
  );
}
export function segmentIsClear(
  a: Vec3,
  b: Vec3,
  obstacles: Obstacle[],
  radius = CAMERA_RADIUS,
): boolean {
  for (const box of obstacles) {
    let low = 0,
      high = 1;
    for (let axis = 0; axis < 3; axis++) {
      const d = b[axis] - a[axis],
        min = box.min[axis] - radius,
        max = box.max[axis] + radius;
      if (Math.abs(d) < 1e-9) {
        if (a[axis] < min || a[axis] > max) {
          low = 2;
          break;
        }
      } else {
        let t1 = (min - a[axis]) / d,
          t2 = (max - a[axis]) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        low = Math.max(low, t1);
        high = Math.min(high, t2);
        if (low > high) break;
      }
    }
    if (low <= high && low <= 1 && high >= 0) return false;
  }
  return true;
}
export function navigationNodes(roomIds: string[]): Vec3[] {
  const interior = roomIds.flatMap((roomId) => {
    const z = roomOffset(roomId);
    return [7, 3, 0, -3, -6.5, -7.5, 9]
      .map((v) => [0, 2.65, v + z] as Vec3)
      .concat([
        [-8.4, 2.65, -6.5 + z],
        [8.4, 2.65, -6.5 + z],
      ]);
  });
  return interior.filter(
    (point) =>
      point[2] <
      roomOffset(roomIds.at(-1) ?? "room-1") + ROOM_DEPTH / 2 - CAMERA_RADIUS,
  );
}
export function safeRoute(start: Vec3, end: Vec3, roomIds: string[]): Vec3[] {
  const obstacles = navigationObstaclesForRooms(roomIds);
  if (segmentIsClear(start, end, obstacles)) return [start, end];
  // Visibility corners let a blocked diagonal skirt the actual obstruction,
  // rather than retreating to an arbitrary central rail several metres away.
  const midY = (start[1] + end[1]) / 2,
    margin = CAMERA_RADIUS + 0.38;
  const corners = obstacles
    .flatMap((box) => {
      if (
        midY < box.min[1] - CAMERA_RADIUS ||
        midY > box.max[1] + CAMERA_RADIUS
      )
        return [];
      return [box.min[0] - margin, box.max[0] + margin].flatMap((x) =>
        [box.min[2] - margin, box.max[2] + margin].map(
          (z) => [x, midY, z] as Vec3,
        ),
      );
    })
    .filter(
      (point) =>
        point[0] >= Math.min(start[0], end[0]) - 3 &&
        point[0] <= Math.max(start[0], end[0]) + 3 &&
        point[2] >= Math.min(start[2], end[2]) - 3 &&
        point[2] <= Math.max(start[2], end[2]) + 3 &&
        segmentIsClear(point, point, obstacles),
    );
  const nodes = [
    start,
    ...navigationNodes(roomIds).map((p) => [p[0], midY, p[2]] as Vec3),
    ...corners,
    end,
  ];
  const scores = nodes.map(() => Infinity),
    previous = nodes.map(() => -1),
    visited = new Set<number>();
  scores[0] = 0;
  for (let step = 0; step < nodes.length; step++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++)
      if (!visited.has(i) && (current === -1 || scores[i] < scores[current]))
        current = i;
    if (current < 0 || !Number.isFinite(scores[current])) break;
    if (current === nodes.length - 1) break;
    visited.add(current);
    for (let i = 1; i < nodes.length; i++)
      if (
        !visited.has(i) &&
        segmentIsClear(nodes[current], nodes[i], obstacles)
      ) {
        const next = scores[current] + distance(nodes[current], nodes[i]);
        if (next < scores[i]) {
          scores[i] = next;
          previous[i] = current;
        }
      }
  }
  if (!Number.isFinite(scores[nodes.length - 1]))
    throw new Error("Aucun trajet libre vers cette destination.");
  const path: Vec3[] = [];
  for (let at = nodes.length - 1; at !== -1; at = previous[at])
    path.unshift(nodes[at]);
  return roundedRoute(path, obstacles);
}
// Rounded corners are sampled AND collision checked. If a curve clips a column,
// the validated polyline remains the safe fallback.
export function roundedRoute(path: Vec3[], obstacles: Obstacle[]): Vec3[] {
  if (path.length < 3) return path;
  for (const radius of [1.5, 1, 0.65, 0.35, 0.12]) {
    const result: Vec3[] = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const [a, b, c] = [path[i - 1], path[i], path[i + 1]];
      const before = lerp(
        b,
        a,
        Math.min(0.35, radius / Math.max(0.001, distance(a, b))),
      );
      const after = lerp(
        b,
        c,
        Math.min(0.35, radius / Math.max(0.001, distance(b, c))),
      );
      result.push(before);
      for (let k = 1; k <= 24; k++) {
        const t = k / 24;
        result.push(lerp(lerp(before, b, t), lerp(b, after, t), t));
      }
    }
    result.push(path[path.length - 1]);
    if (
      result.every((p, i) => !i || segmentIsClear(result[i - 1], p, obstacles))
    )
      return result;
  }
  return path;
}
export function pointOnRoute(path: Vec3[], progress: number): Vec3 {
  if (path.length === 1) return path[0];
  const lengths = path.slice(1).map((p, i) => distance(path[i], p));
  let remaining =
    lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i])
      return lerp(
        path[i],
        path[i + 1],
        lengths[i] ? remaining / lengths[i] : 1,
      );
    remaining -= lengths[i];
  }
  return path[path.length - 1];
}
export function routeLength(path: Vec3[]) {
  return path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0);
}
export function validatePlacements(data: PublicData) {
  const ids = new Set<string>();
  for (const a of data.artworks) {
    if (ids.has(a.id))
      throw new Error(`Œuvre présente deux fois : ${a.id}`);
    ids.add(a.id);
    if (!getSlots(a.roomId).some((s) => s.id === a.slotId))
      throw new Error(`Emplacement absent : ${a.slotId}`);
  }
}

// Interpolate viewing direction instead of world-space targets. Opposite-wall
// targets would otherwise coincide with the moving camera halfway through.
export function interpolateLookAt(
  position: Vec3,
  fromPosition: Vec3,
  fromTarget: Vec3,
  toPosition: Vec3,
  toTarget: Vec3,
  t: number,
): Vec3 {
  const a = fromTarget.map((v, i) => v - fromPosition[i]) as Vec3,
    b = toTarget.map((v, i) => v - toPosition[i]) as Vec3;
  const lenA = Math.max(0.001, Math.hypot(...a)),
    lenB = Math.max(0.001, Math.hypot(...b));
  const yawA = Math.atan2(a[0], a[2]),
    yawB = Math.atan2(b[0], b[2]);
  const yaw =
    yawA + Math.atan2(Math.sin(yawB - yawA), Math.cos(yawB - yawA)) * t;
  const pitchA = Math.asin(a[1] / lenA),
    pitchB = Math.asin(b[1] / lenB),
    pitch = pitchA + (pitchB - pitchA) * t;
  const length = Math.max(1, lenA + (lenB - lenA) * t);
  return [
    position[0] + Math.sin(yaw) * Math.cos(pitch) * length,
    position[1] + Math.sin(pitch) * length,
    position[2] + Math.cos(yaw) * Math.cos(pitch) * length,
  ];
}

export interface CameraMotionSample {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  yawVelocity: number;
  pitchVelocity: number;
  lookDistance: number;
  offsetX: number;
  offsetY: number;
  offsetVelocityX: number;
  offsetVelocityY: number;
  fov: number;
  fovVelocity: number;
}
interface TravelProfile {
  points: { time: number; distance: number; speed: number }[];
  duration: number;
}
export interface CameraMotion {
  initial: CameraMotionSample;
  coastDuration: number;
  stopped: CameraMotionSample;
  orientFrom: CameraMotionSample;
  orientDuration: number;
  focusTurn?: { yaw: number; pitch: number; duration: number };
  destination: CameraPose;
  path: Vec3[];
  length: number;
  duration: number;
  travelDuration: number;
  profile: TravelProfile;
  curve: CatmullRomCurve3 | null;
  endYaw: number;
  endPitch: number;
  endLookDistance: number;
  endYawDerivative: number;
  endPitchDerivative: number;
  roomLook: RoomLook | null;
  gazeVia: {
    yaw: number;
    pitch: number;
    enterEnd: number;
    leaveStart: number;
    routeProgress?: number;
  } | null;
}
const shortestAngle = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));
export function motionFromPose(pose: CameraPose): CameraMotionSample {
  const delta = pose.target.map((v, i) => v - pose.position[i]) as Vec3;
  const length = Math.max(0.001, Math.hypot(...delta));
  return {
    position: [...pose.position],
    velocity: [0, 0, 0],
    yaw: Math.atan2(delta[0], delta[2]),
    pitch: Math.asin(delta[1] / length),
    yawVelocity: 0,
    pitchVelocity: 0,
    lookDistance: length,
    offsetX: pose.offsetPx,
    offsetY: pose.offsetYPx,
    offsetVelocityX: 0,
    offsetVelocityY: 0,
    fov: pose.fov ?? CAMERA_FOV,
    fovVelocity: 0,
  };
}
function coastSample(
  initial: CameraMotionSample,
  duration: number,
  elapsed: number,
): CameraMotionSample {
  if (duration === 0)
    return {
      ...initial,
      velocity: [0, 0, 0],
      yawVelocity: 0,
      pitchVelocity: 0,
      offsetVelocityX: 0,
      offsetVelocityY: 0,
      fovVelocity: 0,
    };
  const t = Math.min(duration, Math.max(0, elapsed));
  const progress = t - (t * t) / (2 * duration);
  const remaining = 1 - t / duration;
  return {
    position: initial.position.map(
      (v, i) => v + initial.velocity[i] * progress,
    ) as Vec3,
    velocity: initial.velocity.map((v) => v * remaining) as Vec3,
    yaw: initial.yaw + initial.yawVelocity * progress,
    pitch: initial.pitch + initial.pitchVelocity * progress,
    yawVelocity: initial.yawVelocity * remaining,
    pitchVelocity: initial.pitchVelocity * remaining,
    lookDistance: initial.lookDistance,
    offsetX: initial.offsetX + initial.offsetVelocityX * progress,
    offsetY: initial.offsetY + initial.offsetVelocityY * progress,
    offsetVelocityX: initial.offsetVelocityX * remaining,
    offsetVelocityY: initial.offsetVelocityY * remaining,
    fov: initial.fov + initial.fovVelocity * progress,
    fovVelocity: initial.fovVelocity * remaining,
  };
}
interface RoomLook {
  yaw: number[];
  pitch: number[];
  length: number;
  endYawSlope: number;
  endPitchSlope: number;
}
function roomLookAt(look: RoomLook, metres: number) {
  const steps = look.yaw.length - 1,
    step = look.length / steps;
  const coordinate = Math.max(0, Math.min(steps, metres / step));
  const index = Math.min(steps - 1, Math.floor(coordinate)),
    t = coordinate - index;
  const interpolate = (values: number[], endSlope: number) => {
    const at = (i: number) => values[Math.max(0, Math.min(steps, i))];
    const slope = (i: number) =>
      i === 0 ? 0 : i === steps ? endSlope * step : (at(i + 1) - at(i - 1)) / 2;
    const second = (i: number) =>
      i === 0 || i === steps ? 0 : at(i + 1) - 2 * at(i) + at(i - 1);
    const a = at(index),
      b = at(index + 1),
      da = slope(index),
      db = slope(index + 1);
    const dda = second(index),
      ddb = second(index + 1),
      change = b - a;
    const c3 = 10 * change - 6 * da - 4 * db - 1.5 * dda + 0.5 * ddb;
    const c4 = -15 * change + 8 * da + 7 * db + 1.5 * dda - ddb;
    const c5 = 6 * change - 3 * da - 3 * db - 0.5 * dda + 0.5 * ddb;
    return {
      value: a + t * (da + t * (dda / 2 + t * (c3 + t * (c4 + t * c5)))),
      rate: (da + t * (dda + t * (3 * c3 + t * (4 * c4 + t * 5 * c5)))) / step,
      second:
        (dda + t * (6 * c3 + t * (12 * c4 + t * 20 * c5))) / (step * step),
    };
  };
  const yaw = interpolate(look.yaw, look.endYawSlope),
    pitch = interpolate(look.pitch, look.endPitchSlope);
  return {
    yaw: yaw.value,
    pitch: pitch.value,
    yawRate: yaw.rate,
    pitchRate: pitch.rate,
    yawSecond: yaw.second,
    pitchSecond: pitch.second,
  };
}
function makeRoomLook(
  path: Vec3[],
  curve: CatmullRomCurve3 | null,
  length: number,
  from: CameraMotionSample,
  to: CameraMotionSample,
  endSample?: CameraMotionSample,
): RoomLook {
  const steps = Math.max(256, Math.ceil(length * 32)),
    step = length / steps;
  const smooth = (u: number) => {
    const t = Math.max(0, Math.min(1, u));
    return t * t * t * (10 + t * (-15 + 6 * t));
  };
  const corridor = to.position[2] > from.position[2] ? 0 : Math.PI;
  let endYaw = from.yaw + shortestAngle(from.yaw, to.yaw);
  // The portal guide must not overshoot the receiving direction and turn back.
  const heading = Math.max(
    Math.min(from.yaw, endYaw),
    Math.min(
      Math.max(from.yaw, endYaw),
      from.yaw + shortestAngle(from.yaw, corridor),
    ),
  );
  const portalZ =
    (Math.floor(
      (Math.min(from.position[2], to.position[2]) + ROOM_DEPTH / 2) /
        ROOM_DEPTH,
    ) +
      0.5) *
    ROOM_DEPTH;
  let portalDistance = length;
  for (let i = 0; i <= steps; i++) {
    const p = curve
      ? curve.getPointAt(i / steps).toArray()
      : pointOnRoute(path, i / steps);
    if ((p[2] - portalZ) * Math.cos(corridor) >= 0) {
      portalDistance = i * step;
      break;
    }
  }
  const startSpan = Math.max(0.1, Math.min(4, length * 0.6, portalDistance));
  const road = Array.from(
    { length: steps + 1 },
    (_, i) => from.yaw + (heading - from.yaw) * smooth((i * step) / startSpan),
  );
  const sameRoom =
    Math.floor((from.position[2] + ROOM_DEPTH / 2) / ROOM_DEPTH) ===
    Math.floor((to.position[2] + ROOM_DEPTH / 2) / ROOM_DEPTH);
  if (sameRoom) {
    // A cancelled artwork visit rejoins local circulation. There is no portal
    // to look towards: accompany the actual route instead of aiming along Z.
    let previousHeading = from.yaw;
    const point = (metres: number) => {
      const u = Math.max(0, Math.min(1, metres / length));
      return curve ? curve.getPointAt(u).toArray() : pointOnRoute(path, u);
    };
    for (let i = 0; i <= steps; i++) {
      const s = i * step;
      const a = point(s - 0.35),
        b = point(s + 0.35);
      const heading = Math.atan2(b[0] - a[0], b[2] - a[2]);
      previousHeading += shortestAngle(previousHeading, heading);
      road[i] =
        from.yaw +
        (previousHeading - from.yaw) * smooth(s / Math.min(0.8, length * 0.35));
    }
    endYaw = road[steps] + shortestAngle(road[steps], to.yaw);
  }
  const endSpeed = endSample ? Math.hypot(...endSample.velocity) : 0;
  const endYawSlope = endSpeed ? endSample!.yawVelocity / endSpeed : 0;
  const endPitchSlope = endSpeed ? endSample!.pitchVelocity / endSpeed : 0;
  const endSpan = Math.min(2, length * 0.4);
  const yaw: number[] = [],
    pitch: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i * step,
      u = Math.max(0, Math.min(1, (s - (length - endSpan)) / endSpan));
    const blend = smooth(u),
      correction = -4 * u ** 3 + 7 * u ** 4 - 3 * u ** 5;
    const look = road[i];
    yaw.push(
      look + (endYaw - look) * blend + endYawSlope * endSpan * correction,
    );
    pitch.push(
      from.pitch +
        (to.pitch - from.pitch) * smooth(s / Math.min(3, length)) +
        endPitchSlope * endSpan * correction,
    );
  }
  return { yaw, pitch, length, endYawSlope, endPitchSlope };
}

/** Walk facing the route; finish inspecting the wall only once translation ends. */
function artworkTravelLook(
  path: Vec3[],
  curve: CatmullRomCurve3 | null,
  length: number,
  from: CameraMotionSample,
  to: CameraMotionSample,
): RoomLook {
  const steps = Math.max(256, Math.ceil(length * 32)),
    step = length / steps;
  const point = (s: number) =>
    curve
      ? curve.getPointAt(Math.max(0, Math.min(1, s / length))).toArray()
      : pointOnRoute(path, s / length);
  const smooth = (u: number) => {
    const t = Math.max(0, Math.min(1, u));
    return t * t * t * (10 + t * (-15 + 6 * t));
  };
  let heading = from.yaw;
  const corridor = to.position[2] > from.position[2] ? 0 : Math.PI;
  const road = Array.from({ length: steps + 1 }, (_, i) => {
    const s = i * step,
      a = point(s - 0.7),
      b = point(s + 0.7);
    const body = Math.atan2(b[0] - a[0], b[2] - a[2]);
    const ahead =
      body +
      Math.max(
        -Math.PI / 5,
        Math.min(Math.PI / 5, shortestAngle(body, corridor)),
      );
    heading += shortestAngle(heading, ahead);
    return (
      from.yaw + (heading - from.yaw) * smooth(s / Math.min(3, length * 0.3))
    );
  });
  const last = road[steps];
  const endYaw =
    last +
    Math.max(-Math.PI / 5, Math.min(Math.PI / 5, shortestAngle(last, to.yaw)));
  const endSpan = Math.min(4, length * 0.4);
  const yaw = road.map(
    (value, i) =>
      value +
      (endYaw - value) * smooth((i * step - length + endSpan) / endSpan),
  );
  const pitch = road.map(
    (_, i) =>
      from.pitch +
      (to.pitch - from.pitch) * smooth((i * step) / Math.min(3, length)),
  );
  return { yaw, pitch, length, endYawSlope: 0, endPitchSlope: 0 };
}

function motionTravelProfile(
  path: Vec3[],
  curve: CatmullRomCurve3 | null,
  length: number,
  endSpeed = 0,
  look: RoomLook | null = null,
): TravelProfile {
  if (length < 0.00001)
    return { points: [{ time: 0, distance: 0, speed: 0 }], duration: 0 };
  const steps = Math.max(120, Math.min(1200, Math.ceil(length * 45))),
    step = length / steps;
  const tangents = Array.from({ length: steps + 1 }, (_, i) =>
    curve
      ? (curve.getTangentAt(i / steps).toArray() as Vec3)
      : routePointAndTangent(path, i / steps).tangent,
  );
  const looks = tangents.map((_, i) =>
    look ? roomLookAt(look, i * step) : null,
  );
  const speeds = tangents.map((_, i) => {
    const before = tangents[Math.max(0, i - 1)],
      after = tangents[Math.min(steps, i + 1)];
    const curvature =
      distance(before, after) / (step * (i === 0 || i === steps ? 1 : 2));
    const g = looks[i];
    const forward = g
      ? Math.sin(g.yaw) * tangents[i][0] + Math.cos(g.yaw) * tangents[i][2]
      : 1;
    return Math.min(
      g && forward < Math.cos((43 * Math.PI) / 180) ? 0.92 : MAX_CAMERA_SPEED,
      g
        ? (MAX_CAMERA_ANGULAR_SPEED * 0.95) /
            Math.max(0.00001, Math.hypot(g.yawRate, g.pitchRate))
        : Infinity,
      g
        ? Math.sqrt(
            (MAX_CAMERA_ANGULAR_ACCELERATION * 0.85) /
              Math.max(0.00001, Math.hypot(g.yawSecond, g.pitchSecond)),
          )
        : Infinity,
      Math.sqrt(
        (MAX_CAMERA_LATERAL_ACCELERATION * 0.8) / Math.max(0.00001, curvature),
      ),
    );
  });
  speeds[0] = 0;
  speeds[steps] = Math.min(speeds[steps], endSpeed);
  const reachable = (i: number, j: number, neighbor: number, limit: number) => {
    if (!look || limit <= neighbor)
      return Math.min(
        limit,
        Math.sqrt(
          neighbor ** 2 + 2 * MAX_CAMERA_TRANSLATION_ACCELERATION * step,
        ),
      );
    const rate =
      Math.max(
        Math.hypot(looks[i]!.yawRate, looks[i]!.pitchRate),
        Math.hypot(looks[j]!.yawRate, looks[j]!.pitchRate),
      ) * 1.02;
    const second =
      Math.max(
        Math.hypot(looks[i]!.yawSecond, looks[i]!.pitchSecond),
        Math.hypot(looks[j]!.yawSecond, looks[j]!.pitchSecond),
      ) * 1.05;
    let lo = neighbor,
      hi = limit;
    for (let k = 0; k < 20; k++) {
      const mid = (lo + hi) / 2;
      const available = Math.max(
        0,
        MAX_CAMERA_ANGULAR_ACCELERATION * 0.92 -
          second * Math.max(mid ** 2, neighbor ** 2),
      );
      const acceleration = Math.min(
        MAX_CAMERA_TRANSLATION_ACCELERATION,
        available / Math.max(0.00001, rate),
      );
      if (mid ** 2 <= neighbor ** 2 + 2 * acceleration * step) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  for (let i = 1; i <= steps; i++)
    speeds[i] = reachable(i, i - 1, speeds[i - 1], speeds[i]);
  for (let i = steps - 1; i >= 0; i--)
    speeds[i] = reachable(i, i + 1, speeds[i + 1], speeds[i]);
  let time = 0;
  const points = speeds.map((speed, i) => {
    if (i) time += (2 * step) / Math.max(0.00001, speeds[i - 1] + speed);
    return { time, distance: i * step, speed };
  });
  return { points, duration: time };
}
function travelProfileSample(profile: TravelProfile, time: number) {
  if (profile.points.length === 1)
    return { distance: 0, speed: 0, acceleration: 0 };
  if (time >= profile.duration)
    return { ...profile.points.at(-1)!, acceleration: 0 };
  let low = 0,
    high = profile.points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (profile.points[mid].time <= time) low = mid;
    else high = mid;
  }
  const a = profile.points[low],
    b = profile.points[high],
    dt = Math.max(0, time - a.time),
    span = b.time - a.time;
  const acceleration = (b.speed - a.speed) / span;
  return {
    distance: a.distance + a.speed * dt + 0.5 * acceleration * dt * dt,
    speed: a.speed + acceleration * dt,
    acceleration,
  };
}

export function planCameraMotion(
  initial: CameraMotionSample,
  destination: CameraPose,
  roomIds: string[],
  options: {
    duration?: number;
    speedScale?: number;
    endSample?: CameraMotionSample;
  } = {},
): CameraMotion {
  const moving =
    Math.hypot(...initial.velocity) +
      Math.abs(initial.yawVelocity) +
      Math.abs(initial.pitchVelocity) +
      Math.abs(initial.offsetVelocityX) / 100 +
      Math.abs(initial.offsetVelocityY) / 100 +
      Math.abs(initial.fovVelocity) / 10 >
    1e-8;
  let coastDuration = moving ? 0.24 : 0;
  const obstacles = navigationObstaclesForRooms(roomIds);
  // A new click preserves the exact velocity of the rendered pose. The short
  // inertial lead-in is shortened only if its camera volume would hit a wall.
  while (
    coastDuration > 0.001 &&
    !segmentIsClear(
      initial.position,
      coastSample(initial, coastDuration, coastDuration).position,
      obstacles,
    )
  )
    coastDuration *= 0.5;
  if (coastDuration <= 0.001) coastDuration = 0;
  let stopped = coastSample(initial, coastDuration, coastDuration);
  const orientFrom = stopped;
  let orientDuration = 0;
  let path = safeRoute(stopped.position, destination.position, roomIds);
  const endSpeed = options.endSample
    ? Math.hypot(...options.endSample.velocity)
    : 0;
  if (options.endSample && endSpeed > 0) {
    const tangent = options.endSample.velocity.map((v) => v / endSpeed);
    const nearbySpan = distance(stopped.position, destination.position);
    // A fixed 1.2m lead-in can land behind the current camera when cancelling
    // beside the loop. Scale it down so joining never creates a U-turn.
    for (const approachLength of [
      Math.min(1.2, nearbySpan * 0.45),
      Math.min(0.8, nearbySpan * 0.3),
      Math.min(0.4, nearbySpan * 0.15),
    ]) {
      const approach = destination.position.map(
        (v, i) => v - tangent[i] * approachLength,
      ) as Vec3;
      if (!segmentIsClear(approach, destination.position, obstacles)) continue;
      path = [
        ...safeRoute(stopped.position, approach, roomIds),
        destination.position,
      ];
      break;
    }
  }
  const startRoom = Math.max(
    0,
    Math.floor((stopped.position[2] + ROOM_DEPTH / 2) / ROOM_DEPTH),
  );
  const endRoom = Math.max(
    0,
    Math.round(roomOffset(destination.roomId) / ROOM_DEPTH),
  );
  const crossesRooms = startRoom !== endRoom;
  const guidedArtwork = crossesRooms && destination.artworkFocus === true;
  if ((destination.roomEntry || guidedArtwork) && path.length > 1) {
    const firstStep =
      path.find((p) => distance(p, stopped.position) > 0.1) ??
      destination.position;
    const heading = Math.atan2(
      firstStep[0] - stopped.position[0],
      firstStep[2] - stopped.position[2],
    );
    const turn = shortestAngle(stopped.yaw, heading);
    // First face the route. Starting a room change while looking behind must
    // not translate the visitor backwards toward an unseen opening. Retain a
    // 40-degree lead so orientation and the first steps can overlap naturally.
    const preTurn =
      Math.sign(turn) * Math.max(0, Math.abs(turn) - (40 * Math.PI) / 180);
    if (Math.abs(preTurn) > 0.01) {
      orientDuration = Math.max(
        (((Math.abs(preTurn) * 4) / 3) * 1.002) / MAX_CAMERA_ANGULAR_SPEED,
        Math.sqrt((Math.abs(preTurn) * 8) / MAX_CAMERA_ANGULAR_ACCELERATION) *
          1.005,
      );
      stopped = { ...stopped, yaw: stopped.yaw + preTurn };
    }
  }
  const final = motionFromPose(destination);
  let endYaw = stopped.yaw + shortestAngle(stopped.yaw, final.yaw);
  let gazeVia: CameraMotion["gazeVia"] = null;
  if (crossesRooms && !destination.roomEntry && !guidedArtwork) {
    // A doorway can guide the gaze if it lies on the natural short turn.
    // Never add a full rotation just to face an opening while passing through it.
    const heading =
      destination.position[2] >= stopped.position[2] ? 0 : Math.PI;
    const viaYaw = stopped.yaw + shortestAngle(stopped.yaw, heading);
    const throughYaw = viaYaw + shortestAngle(viaYaw, final.yaw);
    let knot = 0.5;
    if (crossesRooms) {
      const portalZ = (Math.min(startRoom, endRoom) + 0.5) * ROOM_DEPTH;
      let walked = 0;
      const total = routeLength(path);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1],
          b = path[i],
          segment = distance(a, b);
        if (
          (a[2] - portalZ) * (b[2] - portalZ) <= 0 &&
          Math.abs(b[2] - a[2]) > 1e-6
        ) {
          knot =
            (walked + (segment * (portalZ - a[2])) / (b[2] - a[2])) /
            Math.max(0.001, total);
          break;
        }
        walked += segment;
      }
    }
    const routeProgress = Math.max(0.001, Math.min(0.999, knot));
    knot = Math.max(0.2, Math.min(0.8, knot));
    const extraTurn =
      Math.abs(viaYaw - stopped.yaw) +
      Math.abs(throughYaw - viaYaw) -
      Math.abs(endYaw - stopped.yaw);
    if (
      extraTurn <= Math.PI / 3 &&
      Math.abs(viaYaw - stopped.yaw) > 0.2 &&
      Math.abs(throughYaw - viaYaw) > 0.2
    ) {
      endYaw = throughYaw;
      gazeVia = {
        yaw: viaYaw,
        pitch: stopped.pitch + (final.pitch - stopped.pitch) * routeProgress,
        enterEnd: knot,
        leaveStart: knot,
        ...(crossesRooms ? { routeProgress } : {}),
      };
    }
  }
  // Evaluate a C1 curve in arc-length space. The old sampled polyline changed
  // velocity direction at every sample, although its scalar speed was smooth.
  const candidate =
    path.length > 2
      ? new CatmullRomCurve3(
          path.map((p) => new Vector3(...p)),
          false,
          "centripetal",
        )
      : null;
  if (candidate) candidate.arcLengthDivisions = Math.max(240, path.length * 12);
  let curve = candidate;
  if (curve) {
    let previous = path[0];
    for (let i = 1; i <= 400; i++) {
      const next = curve.getPointAt(i / 400).toArray() as Vec3;
      if (!segmentIsClear(previous, next, obstacles)) {
        curve = null;
        break;
      }
      previous = next;
    }
  }
  const length = curve?.getLength() ?? routeLength(path);
  const roomLook =
    guidedArtwork && length > 0.01
      ? artworkTravelLook(path, curve, length, stopped, final)
      : destination.roomEntry && length > 0.01
        ? makeRoomLook(path, curve, length, stopped, final, options.endSample)
        : null;
  const profile = motionTravelProfile(path, curve, length, endSpeed, roomLook);
  const endYawDerivative =
    (options.endSample?.yawVelocity ?? 0) * profile.duration;
  const endPitchDerivative =
    (options.endSample?.pitchVelocity ?? 0) * profile.duration;
  if (gazeVia?.routeProgress !== undefined) {
    // Match the optional doorway glance to the actual speed profile. The
    // translation stays continuous and only slows where curvature requires it.
    if (curve) {
      const portalZ = (Math.min(startRoom, endRoom) + 0.5) * ROOM_DEPTH;
      let low = 0,
        high = 1;
      const forward = destination.position[2] > stopped.position[2];
      for (let i = 0; i < 32; i++) {
        const mid = (low + high) / 2;
        if (curve.getPointAt(mid).z < portalZ === forward) low = mid;
        else high = mid;
      }
      gazeVia.routeProgress = (low + high) / 2;
    }
    const portalDistance = gazeVia.routeProgress * length;
    let low = 0,
      high = profile.duration;
    for (let i = 0; i < 36; i++) {
      const mid = (low + high) / 2;
      if (travelProfileSample(profile, mid).distance < portalDistance)
        low = mid;
      else high = mid;
    }
    const knot = Math.max(
      0.05,
      Math.min(0.95, (low + high) / 2 / Math.max(0.001, profile.duration)),
    );
    gazeVia.enterEnd = knot;
    gazeVia.leaveStart = knot;
  }
  // Measure the derivative of the whole gaze curve, not just its net angle.
  let angularDerivative = 0,
    angularSecondDerivative = 0,
    previousRate: [number, number] | null = null;
  const angularSamples = roomLook ? 1200 : 240;
  for (let i = 0; i <= angularSamples; i++) {
    let gaze = gazeAt(
      stopped.yaw,
      stopped.pitch,
      endYaw,
      final.pitch,
      gazeVia,
      i / angularSamples,
      endYawDerivative,
      endPitchDerivative,
    );
    if (roomLook) {
      const travel = travelProfileSample(
          profile,
          (profile.duration * i) / angularSamples,
        ),
        g = roomLookAt(roomLook, travel.distance);
      gaze = {
        yaw: g.yaw,
        pitch: g.pitch,
        yawRate: g.yawRate * travel.speed * profile.duration,
        pitchRate: g.pitchRate * travel.speed * profile.duration,
      };
      angularSecondDerivative = Math.max(
        angularSecondDerivative,
        Math.hypot(
          g.yawSecond * travel.speed ** 2 + g.yawRate * travel.acceleration,
          g.pitchSecond * travel.speed ** 2 + g.pitchRate * travel.acceleration,
        ) *
          profile.duration ** 2,
      );
    }
    if (previousRate)
      angularSecondDerivative = Math.max(
        angularSecondDerivative,
        Math.hypot(
          gaze.yawRate - previousRate[0],
          gaze.pitchRate - previousRate[1],
        ) * angularSamples,
      );
    previousRate = [gaze.yawRate, gaze.pitchRate];
    angularDerivative = Math.max(
      angularDerivative,
      Math.hypot(gaze.yawRate, gaze.pitchRate),
    );
  }
  const angularDuration =
    (angularDerivative * 1.002) / MAX_CAMERA_ANGULAR_SPEED;
  const travelDuration =
    Math.max(
      options.duration ?? 1.65,
      profile.duration,
      angularDuration,
      Math.sqrt(angularSecondDerivative / MAX_CAMERA_ANGULAR_ACCELERATION) *
        (roomLook ? 1.015 : 1.005),
    ) / Math.max(0.1, Math.min(1, options.speedScale ?? 1));
  const lastLook = roomLook && roomLookAt(roomLook, length);
  const focusAngle =
    guidedArtwork && lastLook
      ? Math.hypot(
          shortestAngle(lastLook.yaw, final.yaw),
          final.pitch - lastLook.pitch,
        )
      : 0;
  const focusTurn =
    focusAngle > 0.001 && lastLook
      ? {
          yaw: lastLook.yaw + shortestAngle(lastLook.yaw, final.yaw),
          pitch: final.pitch,
          duration: Math.max(
            (((focusAngle * 4) / 3) * 1.002) / MAX_CAMERA_ANGULAR_SPEED,
            Math.sqrt((focusAngle * 8) / MAX_CAMERA_ANGULAR_ACCELERATION) *
              1.005,
          ),
        }
      : undefined;
  return {
    focusTurn,
    initial,
    coastDuration,
    stopped,
    orientFrom,
    orientDuration,
    destination,
    path,
    length,
    travelDuration,
    profile,
    curve,
    duration:
      coastDuration +
      orientDuration +
      travelDuration +
      (focusTurn?.duration ?? 0),
    endYaw,
    endPitch: final.pitch,
    endLookDistance: final.lookDistance,
    endYawDerivative,
    endPitchDerivative,
    roomLook,
    gazeVia,
  };
}
function knotValue(
  start: number,
  mid: number,
  end: number,
  knot: number,
  t: number,
) {
  const left = (mid - start) / knot,
    right = (end - mid) / (1 - knot);
  const tangent = left * right > 0 ? (2 * left * right) / (left + right) : 0;
  const before = t <= knot,
    span = before ? knot : 1 - knot;
  const u = (before ? t : t - knot) / span;
  const a = before ? start : mid,
    b = before ? mid : end;
  const m0 = before ? 0 : tangent * span,
    m1 = before ? tangent * span : 0;
  return {
    value:
      (2 * u * u * u - 3 * u * u + 1) * a +
      (u * u * u - 2 * u * u + u) * m0 +
      (-2 * u * u * u + 3 * u * u) * b +
      (u * u * u - u * u) * m1,
    rate:
      ((6 * u * u - 6 * u) * a +
        (3 * u * u - 4 * u + 1) * m0 +
        (-6 * u * u + 6 * u) * b +
        (3 * u * u - 2 * u) * m1) /
      span,
  };
}
function gazeAt(
  startYaw: number,
  startPitch: number,
  endYaw: number,
  endPitch: number,
  via: CameraMotion["gazeVia"],
  t: number,
  endYawDerivative = 0,
  endPitchDerivative = 0,
) {
  const value = (start: number, end: number, mid: number | undefined) => {
    if (mid === undefined || !via) {
      const ramp = 0.25,
        cruise = 1 / (1 - ramp);
      const integral = (u: number) => u * u * u - (u * u * u * u) / 2;
      let blend: number, rate: number;
      if (t < ramp) {
        const u = t / ramp;
        blend = cruise * ramp * integral(u);
        rate = cruise * u * u * (3 - 2 * u);
      } else if (t > 1 - ramp) {
        const u = (1 - t) / ramp;
        blend = 1 - cruise * ramp * integral(u);
        rate = cruise * u * u * (3 - 2 * u);
      } else {
        blend = cruise * (t - ramp / 2);
        rate = cruise;
      }
      return {
        value: start + (end - start) * blend,
        rate: (end - start) * rate,
      };
    }
    return knotValue(start, mid, end, via.enterEnd, t);
  };
  const yaw = value(startYaw, endYaw, via?.yaw),
    pitch = value(startPitch, endPitch, via?.pitch);
  const correction = -4 * t ** 3 + 7 * t ** 4 - 3 * t ** 5;
  const correctionRate = -12 * t ** 2 + 28 * t ** 3 - 15 * t ** 4;
  return {
    yaw: yaw.value + endYawDerivative * correction,
    pitch: pitch.value + endPitchDerivative * correction,
    yawRate: yaw.rate + endYawDerivative * correctionRate,
    pitchRate: pitch.rate + endPitchDerivative * correctionRate,
  };
}
function routePointAndTangent(
  path: Vec3[],
  progress: number,
): { position: Vec3; tangent: Vec3 } {
  const lengths = path.slice(1).map((p, i) => distance(path[i], p));
  let remaining =
    lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const length = lengths[i];
      return {
        position: lerp(
          path[i],
          path[i + 1],
          length ? Math.min(1, remaining / length) : 1,
        ),
        tangent: length
          ? (path[i + 1].map((v, axis) => (v - path[i][axis]) / length) as Vec3)
          : [0, 0, 0],
      };
    }
    remaining -= lengths[i];
  }
  return { position: path.at(-1)!, tangent: [0, 0, 0] };
}
export function sampleCameraMotion(
  motion: CameraMotion,
  elapsed: number,
): CameraMotionSample {
  if (elapsed < motion.coastDuration)
    return coastSample(motion.initial, motion.coastDuration, elapsed);
  if (elapsed < motion.coastDuration + motion.orientDuration) {
    const progress = (elapsed - motion.coastDuration) / motion.orientDuration;
    const gaze = gazeAt(
      motion.orientFrom.yaw,
      motion.orientFrom.pitch,
      motion.stopped.yaw,
      motion.stopped.pitch,
      null,
      progress,
    );
    return {
      ...motion.orientFrom,
      yaw: gaze.yaw,
      yawVelocity: gaze.yawRate / motion.orientDuration,
      pitch: gaze.pitch,
      pitchVelocity: gaze.pitchRate / motion.orientDuration,
    };
  }
  const movementEnd =
    motion.coastDuration + motion.orientDuration + motion.travelDuration;
  if (motion.focusTurn && elapsed >= movementEnd) {
    const from = roomLookAt(motion.roomLook!, motion.length);
    const t = Math.max(
      0,
      Math.min(1, (elapsed - movementEnd) / motion.focusTurn.duration),
    );
    const gaze = gazeAt(
      from.yaw,
      from.pitch,
      motion.focusTurn.yaw,
      motion.focusTurn.pitch,
      null,
      t,
    );
    return {
      ...motionFromPose(motion.destination),
      yaw: gaze.yaw,
      pitch: gaze.pitch,
      yawVelocity: gaze.yawRate / motion.focusTurn.duration,
      pitchVelocity: gaze.pitchRate / motion.focusTurn.duration,
    };
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      (elapsed - motion.coastDuration - motion.orientDuration) /
        motion.travelDuration,
    ),
  );
  const eased = t * t * t * (10 + t * (-15 + 6 * t));
  const speed = (30 * t * t * (1 - t) * (1 - t)) / motion.travelDuration;
  const profileScale = motion.profile.duration / motion.travelDuration;
  const travel = travelProfileSample(
    motion.profile,
    t * motion.profile.duration,
  );
  const travelled = travel.distance,
    linearSpeed = travel.speed * profileScale;
  const progress = motion.length
    ? Math.max(0, Math.min(1, travelled / motion.length))
    : t;
  const { position, tangent } = motion.curve
    ? {
        position: motion.curve.getPointAt(progress).toArray() as Vec3,
        tangent: motion.curve.getTangentAt(progress).toArray() as Vec3,
      }
    : routePointAndTangent(motion.path, progress);
  const from = motion.stopped;
  let gaze = gazeAt(
    from.yaw,
    from.pitch,
    motion.endYaw,
    motion.endPitch,
    motion.gazeVia,
    t,
    motion.endYawDerivative,
    motion.endPitchDerivative,
  );
  if (motion.roomLook) {
    const g = roomLookAt(motion.roomLook, travelled);
    gaze = {
      yaw: g.yaw,
      pitch: g.pitch,
      yawRate: g.yawRate * linearSpeed * motion.travelDuration,
      pitchRate: g.pitchRate * linearSpeed * motion.travelDuration,
    };
  }
  const yaw = gaze.yaw,
    pitch = gaze.pitch;
  const yawVelocity = gaze.yawRate / motion.travelDuration;
  const pitchVelocity = gaze.pitchRate / motion.travelDuration;
  return {
    position,
    velocity: tangent.map((v) => v * linearSpeed) as Vec3,
    yaw,
    pitch,
    yawVelocity,
    pitchVelocity,
    lookDistance:
      from.lookDistance + (motion.endLookDistance - from.lookDistance) * eased,
    offsetX:
      from.offsetX + (motion.destination.offsetPx - from.offsetX) * eased,
    offsetY:
      from.offsetY + (motion.destination.offsetYPx - from.offsetY) * eased,
    offsetVelocityX: (motion.destination.offsetPx - from.offsetX) * speed,
    offsetVelocityY: (motion.destination.offsetYPx - from.offsetY) * speed,
    fov: from.fov + ((motion.destination.fov ?? CAMERA_FOV) - from.fov) * eased,
    fovVelocity: ((motion.destination.fov ?? CAMERA_FOV) - from.fov) * speed,
  };
}
export function motionLookTarget(sample: CameraMotionSample): Vec3 {
  const length = Math.max(1, sample.lookDistance);
  return [
    sample.position[0] + Math.sin(sample.yaw) * Math.cos(sample.pitch) * length,
    sample.position[1] + Math.sin(sample.pitch) * length,
    sample.position[2] + Math.cos(sample.yaw) * Math.cos(sample.pitch) * length,
  ];
}
