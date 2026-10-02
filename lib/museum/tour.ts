import { CatmullRomCurve3, PerspectiveCamera, Vector3 } from "three";
import type { Artwork, Destination, PublicData } from "@/lib/data/types";
import { roomOffset, slotForArtwork, type Vec3 } from "./config";
import { hangingGroups } from "./hangingGroups";
import {
  motionLookTarget,
  obstaclesForRooms,
  segmentIsClear,
  CAMERA_EYE_HEIGHT,
  type CameraPose,
  type CameraMotionSample,
} from "./navigation";

export const TOUR_INITIAL_DELAY = 2;
export const WALK_ACCELERATION_TIME = 2;
export const MAX_WALK_SPEED = 0.34;
export const MAX_WALK_YAW_RATE = Math.PI / 15;
export const MAX_ARTWORK_GAZE_RATE = Math.PI / 15;
export const WALK_EYE_HEIGHT = CAMERA_EYE_HEIGHT;

export function canRunAmbientTour(
  destination: Destination,
  requested: boolean,
  reducedMotion: boolean,
  visible: boolean,
) {
  return (
    requested &&
    !reducedMotion &&
    visible &&
    (destination.kind === "home" || destination.kind === "room")
  );
}

/** Keep the visible pose, but discard momentum once walking has stopped. */
export function pausedWalkSample(
  sample: CameraMotionSample,
): CameraMotionSample {
  return {
    ...sample,
    velocity: [0, 0, 0],
    yawVelocity: 0,
    pitchVelocity: 0,
    offsetVelocityX: 0,
    offsetVelocityY: 0,
    fovVelocity: 0,
  };
}

/** Paused or hidden wall-clock time never advances the promenade. */
export class TourTimeline {
  time = 0;
  private last: number | null = null;
  private running = false;
  update(now: number, running: boolean) {
    if (this.last !== null && this.running && running)
      this.time += Math.max(0, now - this.last);
    this.last = now;
    this.running = running;
    return this.time;
  }
}
export function tourArtworks(data: PublicData, roomId: string) {
  return data.artworks
    .filter((a) => a.roomId === roomId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
export function ambientTourInsets(width: number, height: number) {
  const landscape = height <= 520 && width > height,
    portrait = width <= 700 && !landscape;
  const top = portrait ? 88 : landscape ? 76 : 100;
  const bottom = portrait
    ? Math.min(height < 700 ? 310 : 400, Math.max(0, height * 0.62 - top))
    : landscape
      ? 85
      : 180;
  const left = portrait
    ? 0
    : landscape
      ? 258
      : width > 1100
        ? width * 0.065 + 380
        : width * 0.05 + 335;
  return { top, bottom, left, right: 0 };
}
export interface AmbientWalk {
  roomId: string;
  curve: CatmullRomCurve3;
  length: number;
  speed: number;
  period: number;
  gaze?: { yaw: number[]; pitch: number[]; winding: number };
  introductionPortrait?: AmbientWalk["introduction"];
  introduction?: {
    duration: number;
    yaw: number[];
    pitch: number[];
    yawShift: number;
  };
}
const wrap = (value: number) => ((value % 1) + 1) % 1;
const angleDelta = (a: number, b: number) =>
  Math.atan2(Math.sin(b - a), Math.cos(b - a));
function headingAt(
  walk: Pick<AmbientWalk, "curve" | "length" | "roomId">,
  metres: number,
) {
  const position = walk.curve.getPointAt(wrap(metres / walk.length));
  const ahead = walk.curve.getPointAt(wrap((metres + 1.6) / walk.length));
  const behind = walk.curve.getPointAt(wrap((metres - 0.4) / walk.length));
  const direction = ahead.sub(behind).normalize();
  const outward = new Vector3(
    position.x,
    0,
    position.z - roomOffset(walk.roomId) + 1.6,
  ).normalize();
  direction.addScaledVector(outward, 0.18).normalize();
  return { yaw: Math.atan2(direction.x, direction.z), pitch: 0.12 };
}

const TAU = Math.PI * 2;
const GAZE_SAMPLES = 720;
function periodicValue(values: number[], phase: number, winding = 0) {
  const coordinate = phase * values.length;
  const index = Math.floor(coordinate),
    t = coordinate - index;
  const at = (i: number) =>
    values[((i % values.length) + values.length) % values.length] +
    Math.floor(i / values.length) * winding;
  const a = at(index),
    b = at(index + 1);
  const da = (b - at(index - 1)) / 2,
    db = (at(index + 2) - a) / 2;
  const dda = b - 2 * a + at(index - 1),
    ddb = at(index + 2) - 2 * b + a;
  const change = b - a;
  // Quintic Hermite shares value, first derivative and second derivative at
  // every knot, including the wrap: the view direction is periodic C2.
  const c3 = 10 * change - 6 * da - 4 * db - 1.5 * dda + 0.5 * ddb;
  const c4 = -15 * change + 8 * da + 7 * db + 1.5 * dda - ddb;
  const c5 = 6 * change - 3 * da - 3 * db - 0.5 * dda + 0.5 * ddb;
  return a + t * (da + t * (dda / 2 + t * (c3 + t * (c4 + t * c5))));
}
function galleryHeading(walk: AmbientWalk, metres: number) {
  if (!walk.gaze) return headingAt(walk, metres);
  const phase = metres / walk.length;
  return {
    yaw: periodicValue(walk.gaze.yaw, phase, walk.gaze.winding),
    pitch: periodicValue(walk.gaze.pitch, phase),
  };
}

/** Attention moves between actual hanging positions while the feet keep walking.
 * A circular Gaussian blends the following directions, then periodic quintic Hermite
 * interpolation keeps angle, angular velocity and acceleration continuous.
 * Only the gaze is smoothed; walking speed and the collision-checked path stay fixed.
 */
function artworkGaze(walk: AmbientWalk, artworks: Artwork[]) {
  const choices = hangingGroups(artworks)
    .filter((group) => group.roomId === walk.roomId)
    .map((group) => {
      const wallAngle = Math.atan2(-group.normal[0], -group.normal[2]);
      const radialAngle = Math.atan2(
        group.position[0],
        group.position[2] - roomOffset(walk.roomId) + 1.6,
      );
      // Anticipate each wall by a quarter loop; lateral hanging changes encounter
      // time a little, and multiple works on a wall remain individually addressable.
      const phase = wrap(
        (wallAngle + angleDelta(wallAngle, radialAngle) * 0.2) / TAU - 0.25,
      );
      return { id: group.id, phase, position: group.position };
    })
    .sort((a, b) => a.phase - b.phase || a.id.localeCompare(b.id));
  if (!choices.length) return undefined;
  const rawYaw: number[] = [],
    rawPitch: number[] = [];
  for (let i = 0; i <= GAZE_SAMPLES; i++) {
    const phase = i / GAZE_SAMPLES,
      position = walk.curve.getPointAt(wrap(phase));
    const closest = choices.reduce((best, candidate) =>
      Math.abs(angleDelta(phase * TAU, candidate.phase * TAU)) <
      Math.abs(angleDelta(phase * TAU, best.phase * TAU))
        ? candidate
        : best,
    );
    const direction = new Vector3(...closest.position).sub(position);
    const yaw = Math.atan2(direction.x, direction.z);
    rawYaw.push(i ? rawYaw[i - 1] + angleDelta(rawYaw[i - 1], yaw) : yaw);
    rawPitch.push(
      Math.atan2(direction.y, Math.hypot(direction.x, direction.z)),
    );
  }
  const winding = Math.round((rawYaw.at(-1)! - rawYaw[0]) / TAU) * TAU;
  rawYaw.pop();
  rawPitch.pop();
  function smooth(values: number[], sigma: number, turns = 0) {
    const radius = Math.ceil(sigma * 3),
      weights = Array.from({ length: radius * 2 + 1 }, (_, i) =>
        Math.exp(-0.5 * ((i - radius) / sigma) ** 2),
      );
    const total = weights.reduce((a, b) => a + b, 0);
    return values.map(
      (_, index) =>
        weights.reduce((sum, weight, k) => {
          const offset = index + k - radius;
          return (
            sum +
            weight *
              (values[
                ((offset % values.length) + values.length) % values.length
              ] +
                Math.floor(offset / values.length) * turns)
          );
        }, 0) / total,
    );
  }
  let result = { yaw: rawYaw, pitch: rawPitch, winding };
  for (
    let sigma = GAZE_SAMPLES * 0.018;
    sigma <= GAZE_SAMPLES * 0.5;
    sigma *= 1.04
  ) {
    result = {
      yaw: smooth(rawYaw, sigma, winding),
      pitch: smooth(rawPitch, sigma),
      winding,
    };
    let peak = 0;
    for (let i = 0; i < GAZE_SAMPLES * 2; i++) {
      const phase = i / (GAZE_SAMPLES * 2),
        step = 1 / (GAZE_SAMPLES * 4);
      const yawRate =
        (periodicValue(result.yaw, phase + step, winding) -
          periodicValue(result.yaw, phase - step, winding)) /
        (step * 2 * walk.period);
      const pitchRate =
        (periodicValue(result.pitch, phase + step) -
          periodicValue(result.pitch, phase - step)) /
        (step * 2 * walk.period);
      peak = Math.max(peak, Math.hypot(yawRate, pitchRate));
    }
    if (peak <= MAX_ARTWORK_GAZE_RATE * 0.99) break;
  }
  return result;
}

export function createAmbientWalk(
  roomId: string,
  rooms: string[],
  artworks: Artwork[] = [],
): AmbientWalk {
  const z = roomOffset(roomId);
  // A broad arrival sees the full room from the entrance. The narrow neck at
  // z=4.25 passes beside the hall bench; the lower oval surrounds the salon's
  // central tree. Closing the same curve keeps subsequent laps seamless.
  const plan: [number, number][] = [
    [0, 7.2],
    [1.15, 6.65],
    [1.45, 5.45],
    [1.35, 4.05],
    [1.85, 2.5],
    [2.5, 0.65],
    [2.6, -1.6],
    [2.25, -3.7],
    [1.35, -5.25],
    [0, -5.8],
    [-1.35, -5.25],
    [-2.25, -3.7],
    [-2.6, -1.6],
    [-2.5, 0.65],
    [-1.7, 2.5],
    [-1.15, 4.05],
    [-1.4, 5.45],
    [-1.15, 6.65],
  ];
  if (roomId === "room-1") {
    // Start in the front-right quadrant to see the reading corner and back wall.
    // A rounded front arc joins the existing aisle; no out-and-back spur.
    plan.splice(0, 4, [3.3, 8.2], [3.4, 6.9], [2.4, 5.55], [1.65, 4.05]);
    plan.splice(
      plan.length - 2,
      2,
      [-1.4, 5.45],
      [-0.8, 7.1],
      [0.8, 8.2],
      [2.25, 8.45],
    );
  }
  const points = plan.map(
    ([x, localZ]) => new Vector3(x, WALK_EYE_HEIGHT, z + localZ),
  );
  const curve = new CatmullRomCurve3(points, true, "centripetal");
  curve.arcLengthDivisions = 4096;
  const length = curve.getLength();
  const base = { roomId, curve, length };
  const obstacles = obstaclesForRooms(rooms);
  let previous = curve.getPointAt(0).toArray() as Vec3;
  let maximumYawPerMetre = 0;
  for (let i = 1; i <= 1200; i++) {
    const point = curve.getPointAt(i / 1200).toArray() as Vec3;
    if (
      !segmentIsClear(previous, point, obstacles) ||
      !segmentIsClear(
        [previous[0], 0.8, previous[2]],
        [point[0], 0.8, point[2]],
        obstacles,
        0.38,
      )
    )
      throw new Error(`Promenade obstruée dans ${roomId}`);
    const metres = (length * i) / 1200;
    const a = headingAt(base, metres - 0.01),
      b = headingAt(base, metres + 0.01);
    maximumYawPerMetre = Math.max(
      maximumYawPerMetre,
      Math.abs(angleDelta(a.yaw, b.yaw)) / 0.02,
    );
    previous = point;
  }
  // When artworks guide attention, their periodic gaze below enforces the
  // angular cap independently of walking direction. Empty rooms use the
  // conservative tangent-derived speed instead.
  const speed = artworks.some((a) => a.roomId === roomId)
    ? MAX_WALK_SPEED
    : Math.min(MAX_WALK_SPEED, MAX_WALK_YAW_RATE / (maximumYawPerMetre * 1.01));
  const walk: AmbientWalk = { ...base, speed, period: length / speed };
  walk.gaze = artworkGaze(walk, artworks);
  walk.introduction = overviewIntroduction(
    walk,
    overviewOpeningYaw(roomId, 1600, 1000),
  );
  walk.introductionPortrait = overviewIntroduction(
    walk,
    overviewOpeningYaw(roomId, 430, 932),
  );
  return walk;
}

export function walkDistanceAt(walk: AmbientWalk, elapsed: number) {
  const t = Math.max(0, elapsed),
    ramp = WALK_ACCELERATION_TIME;
  if (t >= ramp)
    return { distance: walk.speed * (t - ramp / 2), speed: walk.speed };
  const u = t / ramp;
  return {
    distance: walk.speed * ramp * (u * u * u - (u * u * u * u) / 2),
    speed: walk.speed * u * u * (3 - 2 * u),
  };
}

export function overviewFov(width: number, height: number) {
  const portrait = width <= 700 && height >= width;
  const referenceAspect = portrait ? 430 / 932 : 1.6;
  const referenceFov = portrait ? 68 : 64;
  const aspect = width / height;
  return aspect <= referenceAspect
    ? referenceFov
    : Math.max(
        60,
        (2 *
          Math.atan(
            (Math.tan((referenceFov * Math.PI) / 360) * referenceAspect) /
              aspect,
          ) *
          180) /
          Math.PI,
      );
}
export function overviewLensOffset(width: number, height: number) {
  const portrait = width <= 700 && height >= width;
  const referenceWidth = portrait ? 430 : 1600,
    referenceHeight = portrait ? 932 : 1000;
  const inset = ambientTourInsets(referenceWidth, referenceHeight);
  const coverScale = Math.max(width / referenceWidth, height / referenceHeight);
  return {
    x: (portrait ? 0 : -40) * coverScale,
    y: ((inset.bottom - inset.top) / 2) * coverScale,
  };
}
const polynomial = (values: number[], u: number) =>
  values.reduceRight((sum, v) => sum * u + v, 0);
export function overviewOpeningYaw(
  roomId: string,
  width: number,
  height: number,
) {
  if (roomId !== "room-1") return Math.PI + Math.PI / 30;
  return ((width <= 700 && height >= width ? 244 : 225) * Math.PI) / 180;
}
function overviewIntroduction(
  walk: AmbientWalk,
  openingYaw: number,
  entryElapsed?: number,
  openingPitch = 0.05,
  entrySpeed = walk.speed,
) {
  const coefficients = (
    start: number,
    end: number,
    velocity: number,
    acceleration: number,
    duration: number,
  ) => {
    const delta = end - start,
      v = velocity * duration,
      a = acceleration * duration * duration;
    return [
      start,
      0,
      0,
      10 * delta - 4 * v + a / 2,
      -15 * delta + 7 * v - a,
      6 * delta - 3 * v + a / 2,
    ];
  };
  let result: NonNullable<AmbientWalk["introduction"]> | undefined;
  for (let duration = 18; duration <= walk.period; duration += 2) {
    const at = (t: number) =>
      entryElapsed === undefined
        ? galleryHeading(walk, walkDistanceAt(walk, t).distance)
        : walkingLook(
            walk,
            entryElapsed +
              joinedWalkDistanceAt(walk, t, entrySpeed).distance / walk.speed,
            false,
          );
    const end = at(duration),
      a = at(duration - 0.02),
      b = at(duration + 0.02);
    const endYaw = openingYaw + angleDelta(openingYaw, end.yaw);
    result = {
      duration,
      yawShift: endYaw - end.yaw,
      yaw: coefficients(
        openingYaw,
        endYaw,
        angleDelta(a.yaw, b.yaw) / 0.04,
        (b.yaw - 2 * end.yaw + a.yaw) / (0.02 * 0.02),
        duration,
      ),
      pitch: coefficients(
        openingPitch,
        end.pitch,
        (b.pitch - a.pitch) / 0.04,
        (b.pitch - 2 * end.pitch + a.pitch) / (0.02 * 0.02),
        duration,
      ),
    };
    let peak = 0,
      acceleration = 0;
    for (let i = 0; i <= 600; i++) {
      const u = i / 600;
      const derivative = (values: number[]) =>
        values.slice(1).map((v, k) => v * (k + 1));
      const dy = derivative(result.yaw),
        dp = derivative(result.pitch);
      peak = Math.max(
        peak,
        Math.hypot(polynomial(dy, u), polynomial(dp, u)) / duration,
      );
      acceleration = Math.max(
        acceleration,
        Math.hypot(
          polynomial(derivative(dy), u),
          polynomial(derivative(dp), u),
        ) /
          (duration * duration),
      );
    }
    if (peak < MAX_ARTWORK_GAZE_RATE * 0.985 && acceleration < 0.065) break;
  }
  return result;
}
function walkingLook(walk: AmbientWalk, elapsed: number, portrait: boolean) {
  const intro = portrait ? walk.introductionPortrait : walk.introduction;
  if (intro && elapsed < intro.duration) {
    const u = Math.max(0, elapsed / intro.duration);
    return { yaw: polynomial(intro.yaw, u), pitch: polynomial(intro.pitch, u) };
  }
  const gaze = galleryHeading(walk, walkDistanceAt(walk, elapsed).distance);
  return { ...gaze, yaw: gaze.yaw + (intro?.yawShift ?? 0) };
}

export function sampleAmbientWalk(
  walk: AmbientWalk,
  elapsed: number,
  width: number,
  height: number,
): CameraMotionSample {
  const travel = walkDistanceAt(walk, elapsed);
  const phase = wrap(travel.distance / walk.length);
  const position = walk.curve.getPointAt(phase).toArray() as Vec3;
  // Symmetric periodic derivative also at phase 0: Three's default tangent
  // clamps its finite difference at the endpoints, introducing a tiny seam.
  const tangent = walk.curve
    .getPointAt(wrap((travel.distance + 0.001) / walk.length))
    .sub(walk.curve.getPointAt(wrap((travel.distance - 0.001) / walk.length)))
    .normalize();
  const portrait = width <= 700 && height >= width;
  const intro = portrait ? walk.introductionPortrait : walk.introduction;
  const gaze = walkingLook(walk, elapsed, portrait);
  const before = walkingLook(walk, elapsed - 0.01, portrait),
    after = walkingLook(walk, elapsed + 0.01, portrait);
  const posterOffset = overviewLensOffset(width, height);
  const inset = ambientTourInsets(width, height);
  const u = Math.max(0, Math.min(1, elapsed / (intro?.duration ?? 18)));
  const blend = u * u * u * (10 + u * (-15 + 6 * u));
  const blendRate = (30 * u * u * (1 - u) * (1 - u)) / (intro?.duration ?? 18);
  const shiftX = (inset.right - inset.left) / 2 - posterOffset.x,
    shiftY = (inset.bottom - inset.top) / 2 - posterOffset.y;
  // The stationary arrival matches the CSS-cover poster exactly. During the
  // broad introductory walk, a tiny lens shift settles into the live UI area.
  // FOV remains constant; there is no automatic zoom.
  const offset = {
    x: posterOffset.x + shiftX * blend,
    y: posterOffset.y + shiftY * blend,
  };
  return {
    position,
    velocity: tangent.multiplyScalar(travel.speed).toArray() as Vec3,
    yaw: gaze.yaw,
    pitch: gaze.pitch,
    yawVelocity: angleDelta(before.yaw, after.yaw) / 0.02,
    pitchVelocity: (after.pitch - before.pitch) / 0.02,
    lookDistance: 6,
    offsetX: offset.x,
    offsetY: offset.y,
    offsetVelocityX: shiftX * blendRate,
    offsetVelocityY: shiftY * blendRate,
    fov: overviewFov(width, height),
    fovVelocity: 0,
  };
}
/** Join a room's existing loop from the nearby current view, never its poster. */
export function nearestWalkEntry(walk: AmbientWalk, from: CameraMotionSample) {
  let bestElapsed = 1 + walk.period,
    bestScore = Infinity;
  for (let i = 0; i < 360; i++) {
    const elapsed = 1 + walk.period * (1 + i / 360);
    const sample = sampleAmbientWalk(walk, elapsed, 1440, 900);
    const incoming = new Vector3(...sample.position).sub(
      new Vector3(...from.position),
    );
    const separation = incoming.length();
    const tangent = new Vector3(...sample.velocity).normalize();
    // Joining the geometrically closest point can require overshooting it and
    // coming back against the loop. Pick a nearby point ahead of its tangent.
    if (separation < 0.6 || incoming.normalize().dot(tangent) < 0.65) continue;
    const routeYaw = Math.atan2(incoming.x, incoming.z);
    const score = separation + Math.abs(angleDelta(from.yaw, routeYaw)) * 0.8;
    if (score < bestScore) {
      bestScore = score;
      bestElapsed = elapsed;
    }
  }
  return bestElapsed;
}
/** Enter a room where forward travel can merge with the loop's tangent. */
export function roomWalkEntry(walk: AmbientWalk, doorway: CameraMotionSample) {
  let best = 1 + walk.period,
    score = Infinity;
  // Judge the merge from the approach side of the portal, before crossing it.
  // Using the point already inside the room would reject close tangential
  // entries and send the visitor unnecessarily far into the gallery.
  const approach = new Vector3(...doorway.position).addScaledVector(
    new Vector3(Math.sin(doorway.yaw), 0, Math.cos(doorway.yaw)),
    -3.6,
  );
  for (let i = 0; i < 360; i++) {
    const elapsed = 1 + walk.period * (1 + i / 360);
    const sample = sampleAmbientWalk(walk, elapsed, 1440, 900);
    const direction = new Vector3(...sample.velocity).normalize();
    const forward = direction.z * Math.cos(doorway.yaw);
    const depth =
      (sample.position[2] -
        (doorway.position[2] - 1.8 * Math.cos(doorway.yaw))) *
      Math.cos(doorway.yaw);
    if (forward < 0.85 || depth < 2.5) continue;
    const incoming = new Vector3(...sample.position).sub(approach);
    const alignment = incoming
      .clone()
      .normalize()
      .dot(new Vector3(...sample.velocity).normalize());
    const candidate = incoming.length() + Math.max(0, 0.94 - alignment) * 30;
    if (candidate < score) {
      score = candidate;
      best = elapsed;
    }
  }
  return best;
}
/** Cross the opening looking along the walk, before looking at its paintings. */
export function roomWalkEntrySample(
  walk: AmbientWalk,
  elapsed: number,
  width: number,
  height: number,
): CameraMotionSample {
  const sample = sampleAmbientWalk(walk, elapsed, width, height);
  return {
    ...sample,
    yaw: Math.atan2(sample.velocity[0], sample.velocity[2]),
    pitch: 0,
    yawVelocity: 0,
    pitchVelocity: 0,
  };
}
/** Reuse the opening gaze curve; no second journey or independent timeline. */
export function roomWalkIntroduction(
  walk: AmbientWalk,
  elapsed: number,
  speed = walk.speed,
) {
  const entry = roomWalkEntrySample(walk, elapsed, 1440, 900);
  return overviewIntroduction(walk, entry.yaw, elapsed, entry.pitch, speed);
}
export function joinedWalkDistanceAt(
  walk: AmbientWalk,
  elapsed: number,
  startSpeed = 0,
) {
  const ramp = walkDistanceAt(walk, elapsed);
  const initial = Math.max(0, Math.min(walk.speed, startSpeed));
  const factor = initial / walk.speed;
  return {
    distance: initial * Math.max(0, elapsed) + ramp.distance * (1 - factor),
    speed: initial + ramp.speed * (1 - factor),
  };
}
/** A modal may start walking from a mid-loop position: ramp speed there too. */
export function sampleJoinedAmbientWalk(
  walk: AmbientWalk,
  elapsed: number,
  entryElapsed: number,
  width: number,
  height: number,
  startSpeed = 0,
  introduction?: AmbientWalk["introduction"],
): CameraMotionSample {
  const ramp = joinedWalkDistanceAt(walk, elapsed, startSpeed);
  const sample = sampleAmbientWalk(
    walk,
    entryElapsed + ramp.distance / walk.speed,
    width,
    height,
  );
  const factor = ramp.speed / walk.speed;
  if (introduction) {
    if (elapsed < introduction.duration) {
      const u = Math.max(0, elapsed / introduction.duration);
      const derivative = (values: number[]) =>
        values.slice(1).map((v, i) => v * (i + 1));
      sample.yaw = polynomial(introduction.yaw, u);
      sample.pitch = polynomial(introduction.pitch, u);
      sample.yawVelocity =
        polynomial(derivative(introduction.yaw), u) /
        introduction.duration /
        Math.max(1e-9, factor);
      sample.pitchVelocity =
        polynomial(derivative(introduction.pitch), u) /
        introduction.duration /
        Math.max(1e-9, factor);
    } else sample.yaw += introduction.yawShift;
  }
  return {
    ...sample,
    velocity: sample.velocity.map((v) => v * factor) as Vec3,
    yawVelocity: sample.yawVelocity * factor,
    pitchVelocity: sample.pitchVelocity * factor,
    offsetVelocityX: sample.offsetVelocityX * factor,
    offsetVelocityY: sample.offsetVelocityY * factor,
  };
}
export function ambientWalkPosterPose(
  walk: AmbientWalk,
  width: number,
  height: number,
): CameraPose {
  const sample = sampleAmbientWalk(walk, 0, width, height);
  return {
    position: sample.position,
    target: motionLookTarget(sample),
    offsetPx: sample.offsetX,
    offsetYPx: sample.offsetY,
    fov: sample.fov,
    roomId: walk.roomId,
  };
}

/** Metadata follows the visible room; it never drives the walking path. */
export function visibleWalkArtwork(
  sample: CameraMotionSample,
  artworks: Artwork[],
  width: number,
  height: number,
  previousId: string | null,
  inset = ambientTourInsets(width, height),
) {
  const camera = new PerspectiveCamera(sample.fov, width / height, 0.1, 120);
  camera.position.fromArray(sample.position);
  camera.lookAt(new Vector3(...motionLookTarget(sample)));
  camera.setViewOffset(
    width,
    height,
    sample.offsetX,
    sample.offsetY,
    width,
    height,
  );
  camera.updateMatrixWorld();
  const centerX = (inset.left + width - inset.right) / 2,
    centerY = (inset.top + height - inset.bottom) / 2;
  let best: string | null = null,
    score = Infinity;
  for (const artwork of artworks) {
    const slot = slotForArtwork(artwork);
    if (!slot) continue;
    const facing = slot.wallNormal.reduce(
      (sum, value, axis) =>
        sum + value * (sample.position[axis] - slot.position[axis]),
      0,
    );
    if (facing <= 0) continue;
    const projected = new Vector3(...slot.position).project(camera);
    const x = ((projected.x + 1) * width) / 2,
      y = ((1 - projected.y) * height) / 2;
    if (
      projected.z < -1 ||
      projected.z > 1 ||
      x < inset.left ||
      x > width - inset.right ||
      y < inset.top ||
      y > height - inset.bottom
    )
      continue;
    const candidate =
      Math.hypot((x - centerX) / width, (y - centerY) / height) -
      (previousId === artwork.id ? 0.06 : 0);
    if (candidate < score) {
      score = candidate;
      best = artwork.id;
    }
  }
  return best;
}
