import { CubicBezierCurve3, Vector3 } from "three";
import { ROOM_DEPTH, type Vec3 } from "./config";
import {
  navigationObstaclesForRooms,
  segmentIsClear,
  type CameraMotionSample,
} from "./navigation";
import { overviewFov, type AmbientWalk } from "./tour";

const wrap = (x: number) => ((x % 1) + 1) % 1;
const angle = (a: number, b: number) =>
  Math.atan2(Math.sin(b - a), Math.cos(b - a));
const clamp = (x: number, min: number, max: number) =>
  Math.max(min, Math.min(max, x));
const vector = (v: Vec3) => new Vector3(...v);
const YAW_SPEED = Math.PI / 9;
const YAW_ACCELERATION = Math.PI / 5;

/** Close to an opening, keep entering the room ahead instead of turning back. */
export function continuationRoom(sample: CameraMotionSample, rooms: string[]) {
  const z = sample.position[2];
  const speed = Math.hypot(...sample.velocity);
  const current = Math.floor((z + ROOM_DEPTH / 2) / ROOM_DEPTH);
  if (speed < 0.035) return rooms[clamp(current, 0, rooms.length - 1)];
  // Look two metres along the actual travel tangent. The intersection must
  // fall inside the opening; being close to its wall is not enough.
  const ahead = z + (sample.velocity[2] / speed) * 2;
  const next = Math.floor((ahead + ROOM_DEPTH / 2) / ROOM_DEPTH);
  if (next !== current && Math.abs(sample.velocity[2]) > 0.001) {
    const portal = (Math.min(current, next) + 0.5) * ROOM_DEPTH;
    const crossingX =
      sample.position[0] +
      ((portal - z) * sample.velocity[0]) / sample.velocity[2];
    if (Math.abs(crossingX) < 1.28)
      return rooms[clamp(next, 0, rooms.length - 1)];
  }
  return rooms[clamp(current, 0, rooms.length - 1)];
}

interface Join {
  curve: CubicBezierCurve3;
  length: number;
  loopDistance: number;
  initialHeading: number;
  direction: number;
}
function loopPoint(walk: AmbientWalk, d: number) {
  return walk.curve.getPointAt(wrap(d / walk.length));
}
function loopTangent(walk: AmbientWalk, d: number) {
  return loopPoint(walk, d + 0.01)
    .sub(loopPoint(walk, d - 0.01))
    .normalize();
}

/** A forward tangent merge, chosen by path geometry, never by the old tour time. */
export function planPromenadeJoin(
  walk: AmbientWalk,
  from: CameraMotionSample,
  rooms: string[],
): Join {
  const start = vector(from.position);
  const speed = Math.hypot(...from.velocity);
  const forward =
    speed > 0.035
      ? vector(from.velocity).normalize()
      : new Vector3(Math.sin(from.yaw), 0, Math.cos(from.yaw));
  const obstacles = navigationObstaclesForRooms(rooms);
  let best: Join | undefined;
  let bestScore = Infinity;
  // A stationary visitor can first turn toward an aisle. A moving visitor keeps
  // precisely the incoming tangent; it cannot reverse on cancellation.
  const headings =
    speed > 0.035
      ? [0]
      : [0, -Math.PI / 4, Math.PI / 4, -Math.PI / 2, Math.PI / 2, Math.PI];
  for (const heading of headings) {
    const direction = forward
      .clone()
      .applyAxisAngle(new Vector3(0, 1, 0), heading);
    for (const circulation of [1, -1]) {
      for (let i = 0; i < 144; i++) {
        const loopDistance = (walk.length * i) / 144;
        const end = loopPoint(walk, loopDistance);
        const gap = end.distanceTo(start);
        if (gap < 0.35 || gap > 14) continue;
        const tangent = loopTangent(walk, loopDistance).multiplyScalar(
          circulation,
        );
        // Do not merge into the crosswise end of an oval just because it is
        // closest: that produces a left/right swerve immediately after the door.
        // Continue into an aisle whose circulation agrees with the approach.
        if (tangent.dot(direction) < 0.65) continue;
        for (const factor of [0.35, 0.65]) {
          const lead = clamp(gap * factor, 0.35, 4.5);
          const curve = new CubicBezierCurve3(
            start,
            start.clone().addScaledVector(direction, lead),
            end.clone().addScaledVector(tangent, -lead),
            end,
          );
          let previous = start;
          let lastDirection = direction;
          let length = 0;
          let turn = 0;
          let valid = true;
          for (let j = 1; j <= 64; j++) {
            const point = curve.getPoint(j / 64);
            const step = point.clone().sub(previous);
            const span = step.length();
            if (
              !segmentIsClear(
                previous.toArray() as Vec3,
                point.toArray() as Vec3,
                obstacles,
              ) ||
              span < 0.00001
            ) {
              valid = false;
              break;
            }
            step.divideScalar(span);
            const curvature =
              Math.acos(clamp(lastDirection.dot(step), -1, 1)) / span;
            // Reject hooks and tiny endpoint U-turns, even if collision-free.
            if (
              curvature > 3 ||
              direction.dot(point.clone().sub(start).normalize()) < -0.15
            ) {
              valid = false;
              break;
            }
            turn += Math.acos(clamp(lastDirection.dot(step), -1, 1));
            length += span;
            previous = point;
            lastDirection = step;
          }
          const score = length + turn * 0.9 + Math.abs(heading) * 3;
          if (valid && length < gap * 1.65 + 0.5 && score < bestScore) {
            curve.arcLengthDivisions = 512;
            best = {
              curve,
              length: curve.getLength(),
              loopDistance,
              direction: circulation,
              initialHeading: Math.atan2(direction.x, direction.z),
            };
            bestScore = score;
          }
        }
      }
    }
  }
  if (!best) throw new Error(`Aucune reprise avant libre dans ${walk.roomId}`);
  return best;
}

/** One moving pose: route, speed and gaze advance together, including the merge. */
export class ContinuousPromenade {
  readonly join: Join | null;
  readonly walk: AmbientWalk;
  sample: CameraMotionSample;
  distance = 0;
  elapsed = 0;
  private speed: number;
  private loopStart: number;
  private viewport: { width: number; height: number } | null = null;
  private brake: {
    from: CameraMotionSample;
    duration: number;
    elapsed: number;
  } | null = null;
  constructor(
    walk: AmbientWalk,
    from: CameraMotionSample,
    rooms: string[],
    loopStart?: number,
  ) {
    this.walk = walk;
    this.sample = {
      ...from,
      position: [...from.position],
      velocity: [...from.velocity],
    };
    this.speed = Math.hypot(...from.velocity);
    let join: Join | null = null;
    if (loopStart === undefined) {
      try {
        if (this.speed > 0.6)
          throw new Error("Slow before changing the walking path");
        join = planPromenadeJoin(walk, from, rooms);
      } catch {
        // A short easing-out segment preserves momentum when an immediate bend
        // would be too tight. It never moves back to the previous artwork.
        const obstacles = navigationObstaclesForRooms(rooms);
        let duration = 0.65;
        let end = vector(from.position).addScaledVector(
          vector(from.velocity),
          duration / 2,
        );
        while (
          duration > 0.025 &&
          !segmentIsClear(from.position, end.toArray() as Vec3, obstacles)
        ) {
          duration *= 0.7;
          end = vector(from.position).addScaledVector(
            vector(from.velocity),
            duration / 2,
          );
        }
        const stopped: CameraMotionSample = {
          ...from,
          position: end.toArray() as Vec3,
          velocity: [0, 0, 0],
          yaw:
            this.speed > 0.035
              ? Math.atan2(from.velocity[0], from.velocity[2])
              : from.yaw,
        };
        join = planPromenadeJoin(walk, stopped, rooms);
        this.brake = { from, duration, elapsed: 0 };
      }
    }
    this.join = join;
    this.loopStart = this.join?.loopDistance ?? loopStart!;
  }
  private point(d: number) {
    if (this.join && d < this.join.length)
      return this.join.curve.getPointAt(clamp(d / this.join.length, 0, 1));
    return loopPoint(
      this.walk,
      this.loopStart +
        (this.join?.direction ?? 1) * (d - (this.join?.length ?? 0)),
    );
  }
  private tangent(d: number) {
    if (this.join && d < this.join.length)
      return this.join.curve
        .getTangentAt(clamp(d / this.join.length, 0, 1))
        .normalize();
    return loopTangent(
      this.walk,
      this.loopStart +
        (this.join?.direction ?? 1) * (d - (this.join?.length ?? 0)),
    ).multiplyScalar(this.join?.direction ?? 1);
  }
  step(seconds: number, width: number, height: number) {
    let remaining = Math.min(Math.max(0, seconds), 0.1);
    if (
      this.viewport &&
      (width !== this.viewport.width || height !== this.viewport.height)
    ) {
      this.sample.offsetX *= width / this.viewport.width;
      this.sample.offsetY *= height / this.viewport.height;
      this.sample.fov = overviewFov(width, height);
    }
    this.viewport = { width, height };
    while (remaining > 1e-7) {
      const dt = Math.min(1 / 120, remaining);
      remaining -= dt;
      const current = this.sample;
      const direction = this.brake
        ? vector(this.brake.from.velocity).normalize()
        : this.tangent(this.distance);
      const ahead = this.brake
        ? this.tangent(0)
        : this.point(this.distance + 0.7)
            .sub(this.point(this.distance))
            .normalize();
      const desiredYaw = Math.atan2(ahead.x, ahead.z);
      const yawError = angle(current.yaw, desiredYaw);
      const yawRate = clamp(yawError * 1.5, -YAW_SPEED, YAW_SPEED);
      const nextYawRate =
        current.yawVelocity +
        clamp(
          yawRate - current.yawVelocity,
          -YAW_ACCELERATION * dt,
          YAW_ACCELERATION * dt,
        );
      let position: Vec3;
      let velocity: Vec3;
      if (this.brake) {
        const brake = this.brake;
        brake.elapsed = Math.min(brake.duration, brake.elapsed + dt);
        const u = brake.elapsed / brake.duration;
        const factor = 1 - u * u * (3 - 2 * u);
        position = vector(brake.from.position)
          .addScaledVector(
            vector(brake.from.velocity),
            brake.duration * (u - u * u * u + 0.5 * u * u * u * u),
          )
          .toArray() as Vec3;
        velocity = vector(brake.from.velocity)
          .multiplyScalar(factor)
          .toArray() as Vec3;
        this.speed = Math.hypot(...velocity);
        if (u >= 1) this.brake = null;
      } else {
        // Wait for the eyes to face the aisle instead of walking backwards while turning.
        const alignment = Math.cos(
          angle(current.yaw, Math.atan2(direction.x, direction.z)),
        );
        const futureDirection = this.tangent(this.distance + 0.5);
        const turnAhead =
          Math.abs(
            angle(
              Math.atan2(direction.x, direction.z),
              Math.atan2(futureDirection.x, futureDirection.z),
            ),
          ) / 0.5;
        const cruise = Math.min(
          this.walk.speed,
          0.16 / Math.max(0.01, turnAhead),
        );
        const desiredSpeed = cruise * clamp((alignment - 0.2) / 0.65, 0, 1);
        const nextSpeed =
          this.speed + clamp(desiredSpeed - this.speed, -1.8 * dt, 0.28 * dt);
        this.distance += (this.speed + nextSpeed) * 0.5 * dt;
        this.speed = nextSpeed;
        position = this.point(this.distance).toArray() as Vec3;
        velocity = this.tangent(this.distance)
          .multiplyScalar(this.speed)
          .toArray() as Vec3;
      }
      const smooth = (value: number, target: number, rate: number) => {
        const acceleration = (target - value) * 4 - rate * 4;
        return rate + acceleration * dt;
      };
      const pitchRate = smooth(current.pitch, 0.025, current.pitchVelocity);
      // Closing a panel does not pan or zoom the lens in the opposite
      // direction. Any ongoing lens velocity simply eases out monotonically.
      const decay = Math.exp(-8 * dt);
      const ox = current.offsetVelocityX * decay;
      const oy = current.offsetVelocityY * decay;
      const fovRate = current.fovVelocity * decay;
      this.sample = {
        ...current,
        position,
        velocity,
        yaw: current.yaw + (current.yawVelocity + nextYawRate) * 0.5 * dt,
        yawVelocity: nextYawRate,
        pitch: current.pitch + pitchRate * dt,
        pitchVelocity: pitchRate,
        offsetX: current.offsetX + ox * dt,
        offsetY: current.offsetY + oy * dt,
        offsetVelocityX: ox,
        offsetVelocityY: oy,
        fov: current.fov + fovRate * dt,
        fovVelocity: fovRate,
      };
      this.elapsed += dt;
    }
    return this.sample;
  }
}
