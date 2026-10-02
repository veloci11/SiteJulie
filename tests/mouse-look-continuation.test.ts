import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { Artwork } from "../lib/data/types";
import {
  artworkPose,
  motionFromPose,
  navigationObstaclesForRooms,
  motionLookTarget,
  segmentIsClear,
} from "../lib/museum/navigation";
import {
  createAmbientWalk,
  pausedWalkSample,
  sampleAmbientWalk,
} from "../lib/museum/tour";
import {
  ContinuousPromenade,
  MANUAL_LOOK_PAUSE,
  manualContinuationRoom,
} from "../lib/museum/promenade";
import { manualLookSample } from "../lib/museum/manualLook";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/catalog.json", import.meta.url), "utf8"),
);
const artworks: Artwork[] = fixture.artworks;
const rooms: string[] = fixture.rooms;
const obstacles = navigationObstaclesForRooms(rooms);

describe("walking resumes from a visitor's chosen gaze", () => {
  for (const artwork of artworks) {
    for (const turn of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      it(`${artwork.id}, mouse turn ${turn.toFixed(2)}: stable release and clear route`, () => {
        const from = motionFromPose(artworkPose(artwork, 1440, 900));
        from.yaw += turn;
        const promenade = new ContinuousPromenade(
          createAmbientWalk(artwork.roomId, rooms, artworks),
          from,
          rooms,
          undefined,
          { manualLook: true },
        );
        expect(promenade.sample).toEqual(from);
        const forward = new Vector3(Math.sin(from.yaw), 0, Math.cos(from.yaw));
        if (
          segmentIsClear(
            from.position,
            new Vector3(...from.position)
              .addScaledVector(forward, 0.8)
              .toArray() as [number, number, number],
            obstacles,
          )
        ) {
          expect(
            Math.abs(
              Math.atan2(
                Math.sin(promenade.join!.initialHeading - from.yaw),
                Math.cos(promenade.join!.initialHeading - from.yaw),
              ),
            ),
          ).toBeLessThanOrEqual(Math.PI / 2 + 1e-6);
        }
        let previous = from;
        for (let frame = 0; frame < 30 * 60; frame++) {
          const next = promenade.step(1 / 60, 1440, 900);
          if (frame / 60 < MANUAL_LOOK_PAUSE - 1 / 60)
            expect(next).toEqual(from);
          expect(
            segmentIsClear(previous.position, next.position, obstacles),
          ).toBe(true);
          expect(
            Math.abs(
              Math.atan2(
                Math.sin(next.yaw - previous.yaw),
                Math.cos(next.yaw - previous.yaw),
              ),
            ),
          ).toBeLessThan(0.003);
          previous = next;
        }
        expect(promenade.distance).toBeGreaterThan(0.2);
      }, 20000);
    }
  }
});

it("chooses the room beyond an open doorway only when the chosen gaze can cross it", () => {
  const base = motionFromPose(artworkPose(artworks[2], 1440, 900));
  expect(
    manualContinuationRoom({ ...base, position: [0, 2.05, 8], yaw: 0 }, rooms),
  ).toBe("room-2");
  expect(
    manualContinuationRoom({ ...base, position: [3, 2.05, 8], yaw: 0 }, rooms),
  ).toBe("room-1");
  expect(
    manualContinuationRoom(
      { ...base, position: [0, 2.05, 10], yaw: Math.PI },
      rooms,
    ),
  ).toBe("room-1");
  expect(
    manualContinuationRoom(
      { ...base, position: [0, 2.05, 8], yaw: Math.PI },
      rooms,
    ),
  ).toBe("room-1");
});

it("the panorama follows a horizontal and vertical pointer drag", () => {
  const from = motionFromPose({
    position: [0, 2.05, 0],
    target: [0, 2.05, -10],
    roomId: "room-1",
    offsetPx: 0,
    offsetYPx: 0,
  });
  const marker = new Vector3(0, 2.05, -10);
  function project(sample: typeof from) {
    const camera = new PerspectiveCamera(60, 1440 / 900, 0.1, 100);
    camera.position.fromArray(sample.position);
    camera.lookAt(new Vector3(...motionLookTarget(sample)));
    camera.updateMatrixWorld();
    return marker.clone().project(camera);
  }
  expect(project(manualLookSample(from, 70, 0, 1440)).x).toBeGreaterThan(0);
  expect(project(manualLookSample(from, 0, 70, 1440)).y).toBeLessThan(0);
  const turned = manualLookSample(from, 400, 0, 1440);
  expect(((turned.yaw - from.yaw) * 180) / Math.PI).toBeCloseTo(65, 0);
  expect(manualLookSample(from, 0, 2000, 1440).pitch).toBe(0.5);
  expect(manualLookSample(from, 0, -2000, 1440).pitch).toBe(-0.5);
});

it("honours the reproduced reverse heading instead of departing in the previous direction", () => {
  const from = {
    ...motionFromPose(artworkPose(artworks[2], 1440, 900)),
    position: [-2.058, 2.05, -4.953] as [number, number, number],
    yaw: -2.525,
  };
  const run = new ContinuousPromenade(
    createAmbientWalk("room-1", rooms, artworks),
    from,
    rooms,
    undefined,
    { manualLook: true },
  );
  expect(run.join?.initialHeading).toBeCloseTo(from.yaw, 6);
  for (let i = 0; i < 4 * 60; i++) run.step(1 / 60, 1440, 900);
  const displacement = new Vector3(...run.sample.position).sub(
    new Vector3(...from.position),
  );
  expect(displacement.x).toBeLessThan(-0.15);
  expect(
    displacement.dot(new Vector3(Math.sin(from.yaw), 0, Math.cos(from.yaw))),
  ).toBeGreaterThan(0.25);
});

it("alternating manual directions restarts from the live pose and remains safe", () => {
  const walk = createAmbientWalk("room-1", rooms, artworks);
  let from = pausedWalkSample(sampleAmbientWalk(walk, 25, 1440, 900));
  for (const turn of [
    Math.PI / 2,
    -Math.PI,
    Math.PI / 3,
    -Math.PI * 0.8,
    Math.PI * 0.8,
  ]) {
    from = { ...pausedWalkSample(from), yaw: from.yaw + turn };
    const run = new ContinuousPromenade(walk, from, rooms, undefined, {
      manualLook: true,
    });
    expect(run.sample).toEqual(from);
    let previous = from;
    for (let i = 0; i < 8 * 60; i++) {
      const next = run.step(1 / 60, 1440, 900);
      expect(segmentIsClear(previous.position, next.position, obstacles)).toBe(
        true,
      );
      const speed = Math.hypot(...next.velocity);
      if (speed > 0.03) {
        const forward = new Vector3(Math.sin(next.yaw), 0, Math.cos(next.yaw));
        expect(
          forward.dot(new Vector3(...next.velocity)) / speed,
        ).toBeGreaterThan(0);
      }
      expect(
        new Vector3(...next.position).distanceTo(
          new Vector3(...previous.position),
        ),
      ).toBeLessThan(0.006);
      previous = next;
    }
    expect(run.distance).toBeGreaterThan(0.04);
    from = run.sample;
  }
});

it("holds the pose when its origin cannot reach a collision-free path", () => {
  const from = {
    ...motionFromPose(artworkPose(artworks[2], 1440, 900)),
    position: [6, 2.05, 0] as [number, number, number],
  };
  const run = new ContinuousPromenade(
    createAmbientWalk("room-1", rooms, artworks),
    from,
    rooms,
    undefined,
    { manualLook: true },
  );
  expect(run.phase).toBe("blocked");
  for (let i = 0; i < 10; i++) expect(run.step(0.1, 1440, 900)).toEqual(from);
});

it("a pause discards live speed and restarts gradually on the same safe path", () => {
  const walk = createAmbientWalk("room-1", rooms, artworks);
  const from = pausedWalkSample(sampleAmbientWalk(walk, 25, 1440, 900));
  let run = new ContinuousPromenade(walk, from, rooms, undefined, {
    manualLook: true,
  });
  for (let i = 0; i < 10 * 60; i++) run.step(1 / 60, 1440, 900);
  expect(Math.hypot(...run.sample.velocity)).toBeGreaterThan(0.05);
  const position = [...run.sample.position];
  const yaw = run.sample.yaw;
  run = run.pause(rooms);
  expect(run.sample.position).toEqual(position);
  expect(run.sample.yaw).toBe(yaw);
  expect(run.sample.velocity).toEqual([0, 0, 0]);
  const next = run.step(1 / 60, 1440, 900);
  expect(Math.hypot(...next.velocity)).toBeLessThan(0.003);
  expect(
    new Vector3(...next.position).distanceTo(new Vector3(...position)),
  ).toBeLessThan(0.0001);
});
