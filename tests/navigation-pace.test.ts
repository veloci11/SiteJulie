import { expect, it } from "vitest";
import {
  destinationPose,
  motionFromPose,
  planCameraMotion,
  sampleCameraMotion,
  navigationObstaclesForRooms,
  segmentIsClear,
  distance,
  NAVIGATION_SPEED_MULTIPLIER,
} from "@/lib/museum/navigation";
import {
  createAmbientWalk,
  ambientWalkPosterPose,
  roomWalkEntrySample,
  roomWalkEntry,
} from "@/lib/museum/tour";
import seed from "./fixtures/catalog.json";
import type { PublicData, AdminArtwork } from "@/lib/data/types";
import { publicArtwork } from "@/lib/validation/artwork";

const data = {
  ...seed,
  mode: "demo",
  artworks: (seed.artworks as AdminArtwork[]).map(publicArtwork),
} as PublicData;
const pace = NAVIGATION_SPEED_MULTIPLIER;
const start = motionFromPose(
  ambientWalkPosterPose(
    createAmbientWalk("room-1", data.rooms, data.artworks),
    1600,
    1000,
  ),
);

it("makes artwork and room journeys another 15% faster while preserving their safe path", () => {
  expect(pace).toBeCloseTo(1.25 * 1.15, 8);
  const obstacles = navigationObstaclesForRooms(data.rooms);
  const targets = [
    ...data.artworks
      .slice(0, 3)
      .map((a) =>
        destinationPose({ kind: "artwork", artworkId: a.id }, data, 1600, 1000),
      ),
    {
      ...destinationPose({ kind: "room", roomId: "room-2" }, data, 1600, 1000),
      roomEntry: true,
    },
  ];
  for (const target of targets) {
    const normal = planCameraMotion(start, target, data.rooms);
    const previous = planCameraMotion(start, target, data.rooms, {
      pace: 1.25,
    });
    const faster = planCameraMotion(start, target, data.rooms, { pace });
    expect(faster.duration * pace).toBeCloseTo(normal.duration, 5);
    expect(faster.duration * 1.15).toBeCloseTo(previous.duration, 5);
    expect(faster.path).toEqual(normal.path);
    for (let i = 0; i <= 120; i++) {
      const sample = sampleCameraMotion(faster, (faster.duration * i) / 120);
      expect(segmentIsClear(sample.position, sample.position, obstacles)).toBe(
        true,
      );
      expect(
        distance(
          sample.position,
          sampleCameraMotion(normal, (normal.duration * i) / 120).position,
        ),
      ).toBeLessThan(0.0001);
    }
  }
});

it("preserves momentum when a faster journey is interrupted", () => {
  const target = destinationPose(
    { kind: "artwork", artworkId: data.artworks[0].id },
    data,
    1600,
    1000,
  );
  const current = planCameraMotion(start, target, data.rooms, { pace });
  const interrupted = sampleCameraMotion(current, current.duration * 0.45);
  const next = planCameraMotion(
    interrupted,
    destinationPose(
      { kind: "artwork", artworkId: data.artworks[1].id },
      data,
      1600,
      1000,
    ),
    data.rooms,
    { pace },
  );
  const initial = sampleCameraMotion(next, 0);
  expect(initial.position).toEqual(interrupted.position);
  expect(initial.velocity).toEqual(interrupted.velocity);
  expect(initial.yawVelocity).toBe(interrupted.yawVelocity);
});

it("joins the ambient walk at its unchanged speed", () => {
  const walk = createAmbientWalk("room-2", data.rooms, data.artworks);
  const arrival = destinationPose(
    { kind: "room", roomId: "room-2" },
    data,
    1600,
    1000,
  );
  const end = roomWalkEntrySample(
    walk,
    roomWalkEntry(walk, motionFromPose(arrival)),
    1600,
    1000,
  );
  const target = {
    ...arrival,
    position: end.position,
    target: [
      end.position[0] + Math.sin(end.yaw) * end.lookDistance,
      end.position[1] + Math.sin(end.pitch) * end.lookDistance,
      end.position[2] + Math.cos(end.yaw) * end.lookDistance,
    ] as [number, number, number],
    roomEntry: true,
  };
  const motion = planCameraMotion(start, target, data.rooms, {
    pace,
    endSample: end,
  });
  const joined = sampleCameraMotion(motion, motion.duration);
  expect(distance(joined.position, end.position)).toBeLessThan(0.001);
  expect(distance(joined.velocity, end.velocity)).toBeLessThan(0.001);
  expect(joined.yawVelocity).toBeCloseTo(end.yawVelocity, 3);
});
