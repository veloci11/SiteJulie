import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import type { Artwork } from "../lib/data/types";
import type { CameraMotionSample } from "../lib/museum/navigation";
import {
  artworkPose,
  motionFromPose,
  navigationObstaclesForRooms,
  planCameraMotion,
  sampleCameraMotion,
  segmentIsClear,
} from "../lib/museum/navigation";
import { ContinuousPromenade, continuationRoom } from "../lib/museum/promenade";
import { createAmbientWalk, sampleAmbientWalk } from "../lib/museum/tour";

// Read geometry and publication status only; never write private local data.
const local = JSON.parse(
  readFileSync(new URL("../.local/data.json", import.meta.url), "utf8"),
);
const artworks: Artwork[] = local.artworks.filter(
  (a: Artwork & { publication: string }) => a.publication === "published",
);
const rooms: string[] = local.rooms;
const viewports = [
  [1440, 900],
  [390, 844],
] as const;
const obstacles = navigationObstaclesForRooms(rooms);
const vec = (v: number[]) => new Vector3(...v);
const dt = 1 / 60;

function verifyRun(
  from: CameraMotionSample,
  width: number,
  height: number,
  label: string,
  initialLoop = false,
) {
  const room = continuationRoom(from, rooms);
  const walk = createAmbientWalk(room, rooms, artworks);
  const tour = new ContinuousPromenade(
    walk,
    from,
    rooms,
    initialLoop ? 0 : undefined,
  );
  expect(
    tour.sample,
    `${label}: constructor changes the rendered pose`,
  ).toEqual(from);
  const incoming = vec(from.velocity);
  const initialSpeed = incoming.length();
  incoming.normalize();
  const failures = new Map<string, string>();
  const record = (failure: string) => {
    const category = failure.split(" t=")[0];
    if (!failures.has(category)) failures.set(category, failure);
  };
  let previous = tour.sample;
  let distanceAt30 = 0;
  const frames = initialLoop
    ? Math.ceil(((walk.length / walk.speed) * 2.5 + 60) / dt)
    : 35 * 60;
  let portalCrossings = 0;
  let portalSide = Math.sign(from.position[2] - 9);
  let crossings = 0;
  let previousLap = 0;
  for (let i = 1; i <= frames; i++) {
    const sample = tour.step(dt, width, height);
    const movement = vec(sample.position).sub(vec(previous.position));
    const speed = Math.hypot(...sample.velocity);
    const time = i * dt;
    const detail = `t=${time.toFixed(3)} room=${room} position=${sample.position.map((x) => x.toFixed(3)).join(",")}`;
    if (!segmentIsClear(previous.position, sample.position, obstacles))
      record(`collision ${detail}`);
    if (
      movement.length() >
      (Math.max(Math.hypot(...previous.velocity), speed) + 0.03) * dt + 0.002
    )
      record(`position jump ${detail} step=${movement.length().toFixed(4)}`);
    if (
      i === 1 &&
      vec(sample.velocity).distanceTo(vec(from.velocity)) >
        0.04 + initialSpeed * 0.8 * dt
    )
      record(
        `initial velocity discontinuity ${detail} delta=${vec(sample.velocity).distanceTo(vec(from.velocity)).toFixed(4)}`,
      );
    if (time <= 1 && initialSpeed > 0.035 && movement.dot(incoming) < -0.0001)
      record(`initial reversal ${detail}`);
    const forwardDot =
      speed > 0.025
        ? (Math.sin(sample.yaw) * sample.velocity[0] +
            Math.cos(sample.yaw) * sample.velocity[2]) /
          speed
        : 1;
    if (time >= 0.8 && forwardDot < -0.01)
      record(
        `backward gaze ${detail} alignment=${forwardDot.toFixed(3)} speed=${speed.toFixed(3)}`,
      );
    if (Math.abs(sample.position[2] - 9) > 0.005) {
      const side = Math.sign(sample.position[2] - 9);
      if (portalSide && side !== portalSide) portalCrossings++;
      portalSide = side;
      if (portalCrossings > 1) record(`door recrossing ${detail}`);
    }
    if (i === 30 * 60) distanceAt30 = tour.distance;
    const lap = Math.floor(tour.distance / walk.length);
    if (initialLoop && lap > previousLap) {
      crossings++;
      previousLap = lap;
    }
    previous = sample;
    // Keep failures actionable, rather than emitting thousands of identical frames.
    if (initialLoop && crossings >= 2) break;
  }
  expect([...failures.values()], label).toEqual([]);
  expect(tour.distance, `${label}: no resumed progression`).toBeGreaterThan(
    0.2,
  );
  if (initialLoop)
    expect(
      crossings,
      `${label}: initial loop does not repeat`,
    ).toBeGreaterThanOrEqual(2);
  else
    expect(
      tour.distance - distanceAt30,
      `${label}: stalled during the last five seconds`,
    ).toBeGreaterThan(0.15);
}

describe("Continuous promenade cancellation with current published artwork geometry", () => {
  for (const [width, height] of viewports) {
    for (const artwork of artworks) {
      it(`resumes from ${artwork.id} at rest ${width}x${height}`, () => {
        verifyRun(
          motionFromPose(artworkPose(artwork, width, height)),
          width,
          height,
          artwork.id,
        );
      }, 20000);
      for (const otherRoom of [false, true]) {
        const destination = artworks.find(
          (a) =>
            a.id !== artwork.id && (a.roomId !== artwork.roomId) === otherRoom,
        )!;
        for (const phase of [0.2, 0.5, 0.8]) {
          it(`cancel ${artwork.id} → ${destination.id} phase ${phase} ${width}x${height}`, () => {
            const motion = planCameraMotion(
              motionFromPose(artworkPose(artwork, width, height)),
              artworkPose(destination, width, height),
              rooms,
            );
            const interrupted = sampleCameraMotion(
              motion,
              phase * motion.duration,
            );
            verifyRun(
              interrupted,
              width,
              height,
              `${artwork.id}→${destination.id} phase=${phase}`,
            );
          }, 20000);
        }
      }
    }
    for (const room of rooms)
      it(`initial loopStart=0 repeats twice without discontinuity ${room} ${width}x${height}`, () => {
        const walk = createAmbientWalk(room, rooms, artworks);
        verifyRun(
          sampleAmbientWalk(walk, 0, width, height),
          width,
          height,
          `initial ${room}`,
          true,
        );
      }, 20000);
  }
});

describe("Door-edge cancellation and repeated selections", () => {
  for (const [width, height] of viewports) {
    for (const [fromId, toId] of [
      ["oeuvre-03", "oeuvre-01"],
      ["oeuvre-01", "oeuvre-03"],
    ]) {
      const source = artworks.find((a) => a.id === fromId)!;
      const destination = artworks.find((a) => a.id === toId)!;
      const transfer = () =>
        planCameraMotion(
          motionFromPose(artworkPose(source, width, height)),
          artworkPose(destination, width, height),
          rooms,
        );
      for (const z of [7.5, 8.5, 8.95, 9.05, 9.5, 10.5]) {
        it(`cancel exact threshold ${fromId}→${toId} z=${z} ${width}x${height}`, () => {
          const motion = transfer();
          // Locate a real crossing of the requested plane, retaining velocity,
          // gaze and the full current motion state rather than fabricating a pose.
          let lower = -1,
            upper = -1;
          for (let i = 1; i <= 800; i++) {
            const a = (motion.duration * (i - 1)) / 800;
            const b = (motion.duration * i) / 800;
            if (
              (sampleCameraMotion(motion, a).position[2] - z) *
                (sampleCameraMotion(motion, b).position[2] - z) <=
              0
            ) {
              lower = a;
              upper = b;
              break;
            }
          }
          expect(
            lower,
            `transfer does not cross z=${z}`,
          ).toBeGreaterThanOrEqual(0);
          for (let i = 0; i < 32; i++) {
            const mid = (lower + upper) / 2;
            if (
              (sampleCameraMotion(motion, lower).position[2] - z) *
                (sampleCameraMotion(motion, mid).position[2] - z) <=
              0
            )
              upper = mid;
            else lower = mid;
          }
          const interrupted = sampleCameraMotion(motion, (lower + upper) / 2);
          expect(interrupted.position[2]).toBeCloseTo(z, 7);
          verifyRun(interrupted, width, height, `${fromId}→${toId} at z=${z}`);
        }, 20000);
      }
      for (const phase of [0.3, 0.6]) {
        it(`cancel, walk2s, select another room, cancel ${phase} ${fromId}→${toId} ${width}x${height}`, () => {
          const motion = transfer();
          const firstCancel = sampleCameraMotion(motion, motion.duration * 0.5);
          const room = continuationRoom(firstCancel, rooms);
          const promenade = new ContinuousPromenade(
            createAmbientWalk(room, rooms, artworks),
            firstCancel,
            rooms,
          );
          let previous = firstCancel;
          for (let i = 0; i < 120; i++) {
            const next = promenade.step(dt, width, height);
            expect(
              segmentIsClear(previous.position, next.position, obstacles),
              `first continuation frame ${i}`,
            ).toBe(true);
            previous = next;
          }
          const currentRoom = continuationRoom(promenade.sample, rooms);
          const newArtwork = artworks.find((a) => a.roomId !== currentRoom)!;
          const nextMotion = planCameraMotion(
            promenade.sample,
            artworkPose(newArtwork, width, height),
            rooms,
          );
          expect(sampleCameraMotion(nextMotion, 0)).toEqual(promenade.sample);
          const secondCancel = sampleCameraMotion(
            nextMotion,
            nextMotion.duration * phase,
          );
          verifyRun(
            secondCancel,
            width,
            height,
            `second cancel ${fromId}→${toId}→${newArtwork.id} phase=${phase}`,
          );
        }, 20000);
      }
    }
  }
});

it("closing a settled artwork never pans or zooms the lens back and forth", () => {
  const from = motionFromPose(artworkPose(artworks[0], 1440, 900));
  const walk = createAmbientWalk(
    from.position[2] > 9 ? "room-2" : "room-1",
    rooms,
    artworks,
  );
  const promenade = new ContinuousPromenade(walk, from, rooms);
  for (let i = 0; i < 600; i++) {
    const sample = promenade.step(1 / 60, 1440, 900);
    expect(sample.offsetX).toBe(from.offsetX);
    expect(sample.offsetY).toBe(from.offsetY);
    expect(sample.fov).toBe(from.fov);
  }
});
