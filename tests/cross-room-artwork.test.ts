import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import seed from "../.local/seed.json";
import type { Artwork } from "../lib/data/types";
import {
  artworkPose,
  motionFromPose,
  planCameraMotion,
  sampleCameraMotion,
  navigationObstaclesForRooms,
  segmentIsClear,
  distance,
  MAX_CAMERA_SPEED,
  MAX_CAMERA_ANGULAR_SPEED,
  type CameraMotionSample,
} from "../lib/museum/navigation";

const artworks = seed.artworks as Artwork[];
const rooms = ["room-1", "room-2"];
const angle = (a: number, b: number) =>
  Math.atan2(Math.sin(b - a), Math.cos(b - a));
describe("Cross-room artwork circulation with the real collection and manifest", () => {
  it("faces its route, crosses the opening once, and preserves focus/interruption continuity", () => {
    const obstacles = navigationObstaclesForRooms(rooms);
    const report: Record<string, unknown>[] = [];
    const check = (
      from: CameraMotionSample,
      art: Artwork,
      width: number,
      height: number,
      stage: string,
    ) => {
      const target = artworkPose(art, width, height);
      const motion = planCameraMotion(from, target, rooms);
      const beginning = sampleCameraMotion(motion, 0);
      expect(distance(beginning.position, from.position)).toBeLessThan(1e-8);
      expect(distance(beginning.velocity, from.velocity)).toBeLessThan(1e-8);
      expect(Math.abs(beginning.yawVelocity - from.yawVelocity)).toBeLessThan(
        1e-8,
      );
      let previous = beginning,
        minForward = 1,
        peakAngular = 0,
        peakSpeed = 0,
        crossings = 0,
        portalAngle = 0;
      for (let i = 1; i <= 600; i++) {
        const elapsed = (motion.duration * i) / 600,
          current = sampleCameraMotion(motion, elapsed);
        const speed = Math.hypot(...current.velocity);
        const angular = Math.hypot(current.yawVelocity, current.pitchVelocity);
        expect(
          segmentIsClear(previous.position, current.position, obstacles),
          `${art.id}/${stage} collision at ${elapsed}`,
        ).toBe(true);
        expect(speed).toBeLessThanOrEqual(MAX_CAMERA_SPEED + 1e-6);
        expect(angular).toBeLessThanOrEqual(MAX_CAMERA_ANGULAR_SPEED + 1e-6);
        peakAngular = Math.max(peakAngular, angular);
        peakSpeed = Math.max(peakSpeed, speed);
        if (speed > 0.05 && elapsed > motion.coastDuration) {
          const forward =
            (Math.sin(current.yaw) * current.velocity[0] +
              Math.cos(current.yaw) * current.velocity[2]) /
            speed;
          minForward = Math.min(minForward, forward);
          expect(
            forward,
            `${art.id}/${stage} backwards at ${elapsed}, ${forward}`,
          ).toBeGreaterThan(0);
          if (speed > 1)
            expect(
              forward,
              `${art.id}/${stage} sideways at ${elapsed}`,
            ).toBeGreaterThan(Math.SQRT1_2);
        }
        if ((previous.position[2] - 9) * (current.position[2] - 9) < 0) {
          crossings++;
          const mix =
            (9 - previous.position[2]) /
            (current.position[2] - previous.position[2]);
          expect(
            Math.abs(
              previous.position[0] +
                mix * (current.position[0] - previous.position[0]),
            ),
          ).toBeLessThan(1.28);
          portalAngle = Math.acos(
            Math.max(
              -1,
              Math.min(
                1,
                Math.cos(current.yaw) * (art.roomId === "room-2" ? 1 : -1),
              ),
            ),
          );
          expect(portalAngle).toBeLessThan(Math.PI / 4);
        }
        previous = current;
      }
      expect(crossings).toBe(1);
      expect(distance(previous.position, target.position)).toBeLessThan(1e-7);
      const desired = motionFromPose(target);
      expect(Math.abs(angle(previous.yaw, desired.yaw))).toBeLessThan(0.002);
      expect(Math.abs(previous.pitch - desired.pitch)).toBeLessThan(0.002);
      expect(previous.fov).toBeCloseTo(desired.fov, 8);
      expect(previous.offsetX).toBeCloseTo(desired.offsetX, 8);
      expect(previous.offsetY).toBeCloseTo(desired.offsetY, 8);
      report.push({
        art: art.id,
        stage,
        width,
        duration: motion.duration,
        travelDuration: motion.travelDuration,
        profileDuration: motion.profile.duration,
        preOrientation: motion.orientDuration,
        finalOrientation: motion.focusTurn?.duration || 0,
        minForward,
        peakAngular,
        peakSpeed,
        portalAngle,
        length: motion.length,
      });
      return motion;
    };
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
      [667, 375],
    ]) {
      for (const art of artworks) {
        const source = artworks.find((a) => a.roomId !== art.roomId)!;
        const motion = check(
          motionFromPose(artworkPose(source, width, height)),
          art,
          width,
          height,
          "initial",
        );
        for (const phase of [0.1, 0.45, 0.8]) {
          const from = sampleCameraMotion(motion, motion.duration * phase);
          const physicalRoom = from.position[2] < 9 ? "room-1" : "room-2";
          const next =
            artworks.find(
              (a) => a.roomId !== physicalRoom && a.id !== art.id,
            ) ?? art;
          check(from, next, width, height, `interrupt-${phase}`);
        }
      }
    }
    if (process.env.MUSEUM_WRITE_NAV_AUDIT) {
      mkdirSync("artifacts/museum", { recursive: true });
      writeFileSync(
        "artifacts/museum/cross-room-artwork-audit.json",
        JSON.stringify(report, null, 2),
      );
    }
  }, 60000);
});
