import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import architectureManifest from "../public/museum/manifest.json";
import {
  artworkPose,
  artworkInsets,
  motionFromPose,
  planCameraMotion,
  sampleCameraMotion,
  motionLookTarget,
  destinationPose,
  roomArrivalPose,
  focusDistance,
  interpolateLookAt,
  distance,
  obstaclesForRooms,
  pointOnRoute,
  safeRoute,
  segmentIsClear,
  validatePlacements,
  CAMERA_FOV,
  MAX_CAMERA_SPEED,
  CAMERA_EYE_HEIGHT,
  MAX_CAMERA_ANGULAR_ACCELERATION,
  navigationObstaclesForRooms,
  MAX_CAMERA_ANGULAR_SPEED,
} from "../lib/museum/navigation";
import {
  ROOM_DEPTH,
  roomOffset,
  getRoomName,
  artworkSize,
  getSlots,
  slotForArtwork,
  FRAME_OUTSET,
  FRAME_FRONT_DEPTH,
} from "../lib/museum/config";
import type { Artwork, Destination, PublicData } from "../lib/data/types";
import {
  ambientWalkPosterPose,
  overviewFov,
  overviewOpeningYaw,
  ambientTourInsets,
  visibleWalkArtwork,
  MAX_ARTWORK_GAZE_RATE,
  createAmbientWalk,
  sampleAmbientWalk,
  nearestWalkEntry,
  roomWalkEntry,
  roomWalkEntrySample,
  roomWalkIntroduction,
  sampleJoinedAmbientWalk,
  pausedWalkSample,
  walkDistanceAt,
  canRunAmbientTour,
  TourTimeline,
  TOUR_INITIAL_DELAY,
  WALK_ACCELERATION_TIME,
  MAX_WALK_YAW_RATE,
  WALK_EYE_HEIGHT,
} from "../lib/museum/tour";
function art(slot = 0, ratio = 1, roomId = "room-1"): Artwork {
  return {
    id: `${roomId}-${slot}`,
    slug: `art-${slot}`,
    title: "Œuvre de test",
    description: "",
    technique: null,
    widthCm: null,
    heightCm: null,
    year: null,
    imageWidth: 1000 * ratio,
    imageHeight: 1000,
    image: "/test.webp",
    thumbnail: "/test.webp",
    detailImage: "/test.webp",
    alt: "Fixture",
    priceMinor: null,
    currency: "EUR",
    availability: "available",
    roomId,
    slotId: getSlots(roomId)[slot].id,
    frameStyle: "brass",
    order: slot,
    collection: "",
  };
}
const data = {
  artworks: ["room-1", "room-2"].flatMap((room) =>
    getSlots(room).map((_, i) => art(i, 1, room)),
  ),
  settings: {},
  rooms: ["room-1", "room-2"],
  mode: "demo",
} as PublicData;
describe("Museum collision and framing contracts", () => {
  it("routes every slot, both alcoves and the extension in both directions without intersecting camera volume", () => {
    const destinations: Destination[] = [
      { kind: "home" },
      { kind: "about" },
      { kind: "contact" },
      { kind: "room", roomId: "room-2" },
      ...data.artworks.map((a) => ({
        kind: "artwork" as const,
        artworkId: a.id,
      })),
    ];
    const obstacles = obstaclesForRooms(data.rooms);
    for (const a of destinations)
      for (const b of destinations) {
        const start = destinationPose(a, data, 1440, 900).position,
          end = destinationPose(b, data, 1440, 900).position;
        const route = safeRoute(start, end, data.rooms);
        expect(route[0]).toEqual(start);
        expect(route.at(-1)).toEqual(end);
        for (let i = 1; i < route.length; i++)
          expect(segmentIsClear(route[i - 1], route[i], obstacles)).toBe(true);
        for (let i = 0; i <= 100; i++) {
          const p = pointOnRoute(route, i / 100);
          expect(segmentIsClear(p, p, obstacles)).toBe(true);
        }
      }
  });
  it("replans from an interrupted current pose and never collapses opposite-wall viewing direction", () => {
    const poses = [0, 4, 8, 11].map((i) => artworkPose(art(i), 1440, 900));
    const initial = safeRoute(poses[0].position, poses[1].position, data.rooms);
    for (const t of [0.15, 0.5, 0.8]) {
      const current = pointOnRoute(initial, t);
      const latest = safeRoute(current, poses[2].position, data.rooms);
      expect(latest[0]).toEqual(current);
      expect(latest.at(-1)).toEqual(poses[2].position);
      const target = interpolateLookAt(
        current,
        poses[0].position,
        poses[0].target,
        poses[1].position,
        poses[1].target,
        t,
      );
      expect(distance(current, target)).toBeGreaterThan(1);
    }
  });
  it("rejects direct travel through a wall but permits the genuine alcove doorway", () => {
    const o = obstaclesForRooms(["room-1"]);
    expect(segmentIsClear([0, 2.65, 0], [9, 2.65, 0], o)).toBe(false);
    expect(segmentIsClear([0, 2.65, -6.5], [8.4, 2.65, -6.5], o)).toBe(true);
    expect(segmentIsClear([0, 2.65, 8], [0, 2.65, 10], o)).toBe(false);
    expect(
      segmentIsClear(
        [0, 2.65, 8],
        [0, 2.65, 10],
        obstaclesForRooms(data.rooms),
      ),
    ).toBe(true);
    expect(segmentIsClear([0, 3.6, 8], [0, 3.6, 10], o)).toBe(false);
    expect(segmentIsClear([0, 3.3, -6.5], [8.4, 3.3, -6.5], o)).toBe(false);
  });
  it("fits all four corners for square, landscape and portrait images across every wall and viewport", () => {
    for (const [width, height] of [
      [1440, 900],
      [1920, 1080],
      [390, 844],
      [375, 667],
      [430, 932],
      [667, 375],
      [844, 390],
    ])
      for (const ratio of [0.55, 1, 1.65])
        for (const index of [0, 4, 8, 11]) {
          const a = art(index, ratio),
            slot = slotForArtwork(a)!,
            size = artworkSize(a, slot),
            pose = artworkPose(a, width, height);
          const camera = new PerspectiveCamera(
            pose.fov ?? CAMERA_FOV,
            width / height,
            0.1,
            120,
          );
          camera.position.fromArray(pose.position);
          camera.lookAt(new Vector3(...pose.target));
          if (pose.offsetPx || pose.offsetYPx)
            camera.setViewOffset(
              width,
              height,
              pose.offsetPx,
              pose.offsetYPx,
              width,
              height,
            );
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
          for (const dx of [-1, 1])
            for (const dy of [-1, 1]) {
              const corner = new Vector3(
                slot.position[0] +
                  (Math.cos(slot.rotationY) *
                    dx *
                    (size.width + FRAME_OUTSET)) /
                    2,
                slot.position[1] + (dy * (size.height + FRAME_OUTSET)) / 2,
                slot.position[2] -
                  (Math.sin(slot.rotationY) *
                    dx *
                    (size.width + FRAME_OUTSET)) /
                    2,
              ).project(camera);
              const x = ((corner.x + 1) * width) / 2,
                y = ((1 - corner.y) * height) / 2;
              expect(x).toBeGreaterThan(0);
              const inset = artworkInsets(width, height);
              expect(x).toBeLessThan(width - inset.right);
              expect(y).toBeGreaterThan(inset.top);
              expect(y).toBeLessThan(height - inset.bottom);
            }
        }
  });
  it("changes focus distance with image ratio and usable screen size", () => {
    expect(focusDistance(4, 2, 390, 600)).toBeGreaterThan(
      focusDistance(4, 2, 1440, 600),
    );
    expect(focusDistance(2, 4, 1440, 600)).toBeGreaterThan(
      focusDistance(2, 2, 1440, 600),
    );
  });
  it("does not silently place unknown or duplicate anchors at the origin", () => {
    expect(() =>
      validatePlacements({
        ...data,
        artworks: [{ ...art(), slotId: "missing" }],
      }),
    ).toThrow();
    expect(() =>
      validatePlacements({ ...data, artworks: [art(), art()] }),
    ).toThrow();
  });
});

describe("Continuous camera motion", () => {
  const views = [0, 4, 8, 11].map((i) => artworkPose(art(i), 1440, 900));
  it("preserves rendered position, translation, angular and lens velocities on rapid retargets", () => {
    let state = motionFromPose(views[0]);
    for (const target of [views[1], views[2], views[3], views[0]]) {
      const motion = planCameraMotion(state, target, data.rooms);
      const start = sampleCameraMotion(motion, 0);
      expect(start.position).toEqual(state.position);
      expect(start.velocity).toEqual(state.velocity);
      expect(start.yawVelocity).toBeCloseTo(state.yawVelocity, 10);
      expect(start.pitchVelocity).toBeCloseTo(state.pitchVelocity, 10);
      expect(start.offsetVelocityX).toBeCloseTo(state.offsetVelocityX, 10);
      if (motion.coastDuration > 0.001) {
        const h = 0.00001;
        const next = sampleCameraMotion(motion, h);
        for (let axis = 0; axis < 3; axis++)
          expect((next.position[axis] - start.position[axis]) / h).toBeCloseTo(
            state.velocity[axis],
            2,
          );
      }
      state = sampleCameraMotion(motion, motion.duration * 0.36);
    }
  });
  it("samples the same clock time at 10 fps or 120 fps and finishes at the planned duration", () => {
    const motion = planCameraMotion(
      motionFromPose(views[0]),
      views[1],
      data.rooms,
    );
    for (let t = 0; t < 1; t += 0.1) sampleCameraMotion(motion, t);
    const slow = sampleCameraMotion(motion, 1);
    for (let t = 0; t < 1; t += 1 / 120) sampleCameraMotion(motion, t);
    expect(sampleCameraMotion(motion, 1)).toEqual(slow);
    const end = sampleCameraMotion(motion, motion.duration + 0.05);
    expect(distance(end.position, views[1].position)).toBeLessThan(1e-8);
    expect(Math.hypot(...end.velocity)).toBe(0);
    expect(end.yawVelocity).toBeCloseTo(0, 10);
    expect(distance(end.position, motionLookTarget(end))).toBeGreaterThan(1);
  });
  it("reframes from the current pose without a resize teleport", () => {
    const current = motionFromPose(views[0]);
    const narrow = artworkPose(art(0), 390, 844);
    const motion = planCameraMotion(current, narrow, data.rooms, {
      duration: 0.7,
    });
    expect(sampleCameraMotion(motion, 0).position).toEqual(current.position);
    expect(
      distance(sampleCameraMotion(motion, 0.01).position, current.position),
    ).toBeLessThan(0.002);
    expect(motion.duration).toBeGreaterThanOrEqual(0.7);
    const arrived = sampleCameraMotion(motion, motion.duration);
    expect(distance(arrived.position, narrow.position)).toBeLessThan(1e-8);
    expect(arrived.offsetY).toBeCloseTo(narrow.offsetYPx, 8);
  });
  it("keeps inertial lead-ins and rounded route segments clear through interrupted opposing-wall routes", () => {
    const obstacles = obstaclesForRooms(data.rooms);
    for (const start of views)
      for (const target of views) {
        const first = planCameraMotion(
          motionFromPose(start),
          target,
          data.rooms,
        );
        for (const fraction of [0.2, 0.5, 0.8]) {
          const interrupted = sampleCameraMotion(
            first,
            first.duration * fraction,
          );
          const next = planCameraMotion(interrupted, views[2], data.rooms);
          let previous = interrupted.position;
          for (let i = 0; i <= 120; i++) {
            const point = sampleCameraMotion(
              next,
              (next.duration * i) / 120,
            ).position;
            expect(segmentIsClear(previous, point, obstacles)).toBe(true);
            previous = point;
          }
        }
      }
  });
});

describe("Two intimate rooms and mobile navigation", () => {
  const actual = [
    art(1, 1),
    art(5, 1.32),
    art(9, 0.73),
    art(3, 1.4),
    art(1, 0.73, "room-2"),
    art(5, 0.71, "room-2"),
    art(8, 0.81, "room-2"),
    art(10, 0.74, "room-2"),
  ];
  it("keeps stable named slots and eighteen-metre room offsets", () => {
    expect(ROOM_DEPTH).toBe(18);
    expect(roomOffset("room-2")).toBe(18);
    expect(getRoomName("room-1")).toBe("La galerie");
    expect(getRoomName("room-2")).toBe("Le salon");
    expect(getSlots()[1].position).toEqual([-5.86, 2.65, 2]);
    expect(getSlots("room-2")[9].position).toEqual([-3.5, 2.65, 26.86]);
    expect(getSlots("room-2")[9].rotationY).toBe(Math.PI);
  });
  it("matches every runtime slot to the freshly generated GLB anchor manifest", () => {
    expect(architectureManifest.roomOffsetZ).toBe(ROOM_DEPTH);
    for (const roomId of ["room-1", "room-2"]) {
      const module = roomId === "room-1" ? "hall" : "extension";
      const anchors = architectureManifest.anchors[module] as Record<
        string,
        number[]
      >;
      for (const [i, slot] of getSlots(roomId).entries()) {
        const anchor =
          anchors[
            `slot_${String(slot.anchorIndex ?? slot.geometryAnchorIndex ?? i + 1).padStart(2, "0")}`
          ];
        expect(anchor).toBeDefined();
        expect(
          Math.hypot(
            anchor[0] + (slot.geometryAnchorOffsetX ?? 0) - slot.position[0],
            anchor[1] + (slot.anchorOffsetY ?? 0) - slot.position[1],
            anchor[2] + roomOffset(roomId) - slot.position[2],
          ),
        ).toBeLessThan(0.0001);
      }
    }
  });
  it("uses a real landscape rectangle on a 667 by 375 phone", () => {
    expect(artworkInsets(390, 844)).toEqual({
      top: 128,
      bottom: 224,
      right: 0,
    });
    expect(artworkInsets(667, 375)).toEqual({
      top: 120,
      bottom: 90,
      right: 266.8,
    });
    expect(artworkInsets(1440, 900)).toEqual({
      top: 96,
      bottom: 90,
      right: 330,
    });
  });
  it("finds collision-free portrait and landscape trips between all eight exhibited paintings", () => {
    const obstacles = obstaclesForRooms(data.rooms);
    for (const [width, height] of [
      [390, 844],
      [375, 667],
      [430, 932],
      [667, 375],
      [844, 390],
    ]) {
      const poses = actual.map((a) => artworkPose(a, width, height));
      for (const start of poses)
        for (const end of poses) {
          const motion = planCameraMotion(
            motionFromPose(start),
            end,
            data.rooms,
          );
          let previous = start.position;
          for (let i = 0; i <= 100; i++) {
            const point = sampleCameraMotion(
              motion,
              (motion.duration * i) / 100,
            ).position;
            expect(segmentIsClear(previous, point, obstacles)).toBe(true);
            previous = point;
          }
        }
    }
  });
  it("looks toward the connecting doorway on a long journey, then faces the selected painting", () => {
    const start = artworkPose(actual[0], 390, 844),
      end = artworkPose(actual[5], 390, 844);
    const motion = planCameraMotion(motionFromPose(start), end, data.rooms);
    expect(motion.roomLook).not.toBeNull();
    const samples = Array.from({ length: 301 }, (_, i) =>
      sampleCameraMotion(motion, (motion.duration * i) / 300),
    );
    const doorway = samples.reduce((best, item) =>
      Math.abs(item.position[2] - 9) < Math.abs(best.position[2] - 9)
        ? item
        : best,
    );
    expect(Math.abs(doorway.position[0])).toBeLessThan(1.28);
    expect(Math.cos(doorway.yaw)).toBeGreaterThan(0.9);
    const arrived = samples.at(-1)!;
    const final = motionFromPose(end);
    expect(Math.cos(arrived.yaw - final.yaw)).toBeCloseTo(1, 8);
    expect(distance(arrived.position, end.position)).toBeLessThan(1e-8);
  });
});

describe("Framed wall surfaces and bounded camera movement", () => {
  it("fits the full backing inside each real wall bay and keeps its back in front of the plaster", () => {
    const zBounds = [
      [4.32, 8.8],
      [0.17, 3.88],
      [-2.78, -0.27],
      [-5.15, -3.22],
    ];
    for (const roomId of data.rooms)
      for (let index = 0; index < 12; index++) {
        for (const ratio of [0.4, 0.7, 1, 1.7, 3.2]) {
          const a = art(index, ratio, roomId);
          const anchor = getSlots(roomId)[index];
          const slot = slotForArtwork(a)!;
          const size = artworkSize(a, slot);
          const framedWidth = size.width + FRAME_OUTSET;
          expect(framedWidth).toBeLessThanOrEqual(
            slot.maxWidthM + FRAME_OUTSET + 1e-9,
          );
          expect(size.height + FRAME_OUTSET).toBeLessThanOrEqual(
            slot.maxHeightM + FRAME_OUTSET + 1e-9,
          );
          expect(size.width / size.height).toBeCloseTo(ratio, 10);
          // The original anchor is 1cm behind the planar plaster face.
          const backGap =
            slot.position.reduce(
              (sum, value, axis) =>
                sum + (value - anchor.position[axis]) * slot.wallNormal[axis],
              0,
            ) - 0.01;
          expect(backGap).toBeCloseTo(0.025, 10);
          if (index < 8) {
            const z = slot.position[2] - roomOffset(roomId);
            const [min, max] = zBounds[index % 4];
            expect(z - framedWidth / 2).toBeGreaterThanOrEqual(min - 1e-9);
            expect(z + framedWidth / 2).toBeLessThanOrEqual(max + 1e-9);
          }
        }
      }
  });
  it("keeps narrow-screen camera poses inside the assigned room while showing all four front frame corners", () => {
    const obstacles = obstaclesForRooms(data.rooms);
    let opticalAdjustments = 0;
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [667, 375],
      [320, 1400],
      [800, 2000],
    ]) {
      for (const roomId of data.rooms)
        for (const index of [0, 3, 4, 7, 8, 9, 11])
          for (const ratio of [0.45, 1, 2.2]) {
            const a = art(index, ratio, roomId),
              slot = slotForArtwork(a)!,
              size = artworkSize(a, slot);
            const pose = artworkPose(a, width, height);
            expect(Math.abs(pose.position[0])).toBeLessThanOrEqual(5.25 + 1e-8);
            expect(
              Math.abs(pose.position[2] - roomOffset(roomId)),
            ).toBeLessThanOrEqual(8.25 + 1e-8);
            expect(
              segmentIsClear(pose.position, pose.position, obstacles),
            ).toBe(true);
            if (pose.fov! > CAMERA_FOV) opticalAdjustments++;
            const camera = new PerspectiveCamera(
              pose.fov,
              width / height,
              0.1,
              120,
            );
            camera.position.fromArray(pose.position);
            camera.lookAt(new Vector3(...pose.target));
            camera.setViewOffset(
              width,
              height,
              pose.offsetPx,
              pose.offsetYPx,
              width,
              height,
            );
            camera.updateMatrixWorld();
            const inset = artworkInsets(width, height);
            for (const x of [-1, 1])
              for (const y of [-1, 1]) {
                const corner = new Vector3(
                  slot.position[0] +
                    slot.wallNormal[0] * FRAME_FRONT_DEPTH +
                    (Math.cos(slot.rotationY) *
                      x *
                      (size.width + FRAME_OUTSET)) /
                      2,
                  slot.position[1] + (y * (size.height + FRAME_OUTSET)) / 2,
                  slot.position[2] +
                    slot.wallNormal[2] * FRAME_FRONT_DEPTH -
                    (Math.sin(slot.rotationY) *
                      x *
                      (size.width + FRAME_OUTSET)) /
                      2,
                ).project(camera);
                expect(((corner.x + 1) * width) / 2).toBeGreaterThan(0);
                expect(((corner.x + 1) * width) / 2).toBeLessThan(
                  width - inset.right,
                );
                expect(((1 - corner.y) * height) / 2).toBeGreaterThan(
                  inset.top,
                );
                expect(((1 - corner.y) * height) / 2).toBeLessThan(
                  height - inset.bottom,
                );
              }
          }
    }
    expect(opticalAdjustments).toBeGreaterThan(0);
  });
  it("closes the terminal wall but leaves the real internal portal passable", () => {
    const obstacles = obstaclesForRooms(data.rooms);
    expect(segmentIsClear([0, 2.65, 8], [0, 2.65, 10], obstacles)).toBe(true);
    expect(segmentIsClear([0, 2.65, 26], [0, 2.65, 28], obstacles)).toBe(false);
    expect(
      obstacles.some((obstacle) => obstacle.name.startsWith("terrace:")),
    ).toBe(false);
    expect(() => safeRoute([0, 2.65, 24], [0, 2.65, 30], data.rooms)).toThrow();
  });
  it("holds a bounded cruise speed without stopping at route nodes and bounds turns on long journeys", () => {
    const start = artworkPose(art(3, 1.4), 390, 844);
    const end = artworkPose(art(8, 0.7, "room-2"), 390, 844);
    const motion = planCameraMotion(motionFromPose(start), end, data.rooms);
    expect(motion.curve).not.toBeNull();
    let peakSpeed = 0,
      peakAngularSpeed = 0;
    for (let i = 0; i <= 1000; i++) {
      const sample = sampleCameraMotion(motion, (motion.duration * i) / 1000);
      const speed = Math.hypot(...sample.velocity);
      peakSpeed = Math.max(peakSpeed, speed);
      peakAngularSpeed = Math.max(
        peakAngularSpeed,
        Math.abs(sample.yawVelocity),
      );
      const walkingProgress =
        ((motion.duration * i) / 1000 -
          motion.coastDuration -
          motion.orientDuration) /
        motion.travelDuration;
      if (walkingProgress >= 0.2 && walkingProgress <= 0.8)
        expect(speed).toBeGreaterThan(0.5);
    }
    expect(peakSpeed).toBeLessThanOrEqual(MAX_CAMERA_SPEED + 1e-8);
    expect(peakAngularSpeed).toBeLessThanOrEqual(
      MAX_CAMERA_ANGULAR_SPEED + 1e-8,
    );
    // Velocity is continuous across every interior curve parameter, including
    // former polyline joins; dense numerical derivatives catch hidden jumps.
    for (let i = 1; i < 100; i++) {
      const t = (motion.duration * i) / 100;
      const a = sampleCameraMotion(motion, t - 0.0001),
        b = sampleCameraMotion(motion, t + 0.0001);
      expect(distance(a.velocity, b.velocity)).toBeLessThan(0.1);
    }
  });
});

describe("Anticipated gaze and ambient cinematic visit", () => {
  it("faces the circulation before returning to same-facing paintings in another room", () => {
    const from = artworkPose(art(1), 390, 844),
      to = artworkPose(art(1, 1, "room-2"), 390, 844);
    const motion = planCameraMotion(motionFromPose(from), to, data.rooms);
    expect(motion.gazeVia).toBeNull();
    expect(motion.roomLook).not.toBeNull();
    // Charge the actual path and necessary stationary turns separately. A
    // 1m/s mean walking budget leaves room for smooth acceleration and bends.
    expect(motion.duration).toBeLessThan(
      motion.length +
        motion.orientDuration +
        (motion.focusTurn?.duration ?? 0) +
        3.2,
    );
    for (let i = 0; i <= 100; i++) {
      const sample = sampleCameraMotion(motion, (motion.duration * i) / 100);
      expect(Math.abs(sample.yawVelocity)).toBeLessThanOrEqual(
        MAX_CAMERA_ANGULAR_SPEED,
      );
      expect(sample.position[1]).toBe(CAMERA_EYE_HEIGHT);
    }
  });
  it("enables the tour only for an unpaused visible overview without reduced motion", () => {
    for (const destination of [
      { kind: "home" },
      { kind: "room", roomId: "room-2" },
    ] as Destination[]) {
      expect(canRunAmbientTour(destination, true, false, true)).toBe(true);
      expect(canRunAmbientTour(destination, false, false, true)).toBe(false);
      expect(canRunAmbientTour(destination, true, true, true)).toBe(false);
      expect(canRunAmbientTour(destination, true, false, false)).toBe(false);
    }
    for (const destination of [
      { kind: "artwork", artworkId: data.artworks[0].id },
      { kind: "about" },
      { kind: "contact" },
    ] as Destination[])
      expect(canRunAmbientTour(destination, true, false, true)).toBe(false);
  });
  it("waits two active seconds and never consumes hidden or paused time", () => {
    const clock = new TourTimeline();
    clock.update(0, true);
    clock.update(1, true);
    expect(clock.time).toBeLessThan(TOUR_INITIAL_DELAY);
    clock.update(1, false);
    clock.update(500, false);
    clock.update(501, true);
    expect(clock.time).toBe(1);
    clock.update(502, true);
    expect(clock.time).toBe(TOUR_INITIAL_DELAY);
    const walk = createAmbientWalk("room-1", data.rooms);
    const frozen = sampleAmbientWalk(walk, clock.time, 390, 844);
    clock.update(503, false);
    clock.update(1000, false);
    clock.update(1001, true);
    expect(sampleAmbientWalk(walk, clock.time, 390, 844)).toEqual(frozen);
  });
  it("walks the entire closed loop at constant speed with no head bob, body collisions or abrupt turns", () => {
    const obstacles = obstaclesForRooms(data.rooms);
    for (const roomId of data.rooms) {
      const walk = createAmbientWalk(roomId, data.rooms);
      expect(walk.period).toBeGreaterThan(35);
      expect(walk.period).toBeLessThan(180);
      let previous = sampleAmbientWalk(walk, WALK_ACCELERATION_TIME, 390, 844);
      for (let i = 1; i <= 2400; i++) {
        const current = sampleAmbientWalk(
          walk,
          WALK_ACCELERATION_TIME + (walk.period * i) / 1200,
          390,
          844,
        );
        expect(Math.hypot(...current.velocity)).toBeCloseTo(walk.speed, 8);
        expect(current.position[1]).toBe(WALK_EYE_HEIGHT);
        expect(Math.abs(current.pitchVelocity)).toBeLessThan(
          MAX_ARTWORK_GAZE_RATE,
        );
        expect(Math.abs(current.yawVelocity)).toBeLessThanOrEqual(
          MAX_WALK_YAW_RATE,
        );
        expect(
          segmentIsClear(previous.position, current.position, obstacles),
        ).toBe(true);
        expect(
          segmentIsClear(
            [previous.position[0], 0.8, previous.position[2]],
            [current.position[0], 0.8, current.position[2]],
            obstacles,
            0.38,
          ),
        ).toBe(true);
        expect(
          new Vector3(...previous.velocity).dot(
            new Vector3(...current.velocity),
          ),
        ).toBeGreaterThan(0);
        previous = current;
      }
      const seam = walk.period + WALK_ACCELERATION_TIME / 2;
      const before = sampleAmbientWalk(walk, seam - 0.0001, 390, 844);
      const after = sampleAmbientWalk(walk, seam + 0.0001, 390, 844);
      expect(distance(before.position, after.position)).toBeLessThan(0.0002);
      expect(distance(before.velocity, after.velocity)).toBeLessThan(0.0002);
      expect(
        Math.abs(
          Math.atan2(
            Math.sin(after.yaw - before.yaw),
            Math.cos(after.yaw - before.yaw),
          ),
        ),
      ).toBeLessThan(0.0001);
      expect(Math.abs(after.yawVelocity - before.yawVelocity)).toBeLessThan(
        0.002,
      );
    }
  });
  it("accelerates only on entry; the poster and every cycle join share the same pose", () => {
    const walk = createAmbientWalk("room-1", data.rooms);
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
      [320, 568],
      [667, 375],
    ]) {
      const initial = sampleAmbientWalk(walk, 0, width, height);
      const poster = ambientWalkPosterPose(walk, width, height);
      expect(poster.position).toEqual(initial.position);
      expect(poster.target).toEqual(motionLookTarget(initial));
      expect(Math.hypot(...initial.velocity)).toBe(0);
      const seam = sampleAmbientWalk(
        walk,
        walk.period + WALK_ACCELERATION_TIME / 2,
        width,
        height,
      );
      expect(distance(initial.position, seam.position)).toBeLessThan(0.00001);
      expect(Math.hypot(...seam.velocity)).toBeCloseTo(walk.speed, 8);
      expect(initial.fov).toBe(overviewFov(width, height));
    }
    expect(walkDistanceAt(walk, 1).speed).toBeCloseTo(walk.speed / 2, 8);
    expect(walkDistanceAt(walk, 2).speed).toBe(walk.speed);
  });
  it("starts manual selection from rest after a pause without losing live walking inertia", () => {
    const walk = createAmbientWalk("room-1", data.rooms);
    const moving = sampleAmbientWalk(walk, 12, 390, 844);
    const paused = pausedWalkSample(moving);
    expect(paused.position).toEqual(moving.position);
    expect(paused.yaw).toBe(moving.yaw);
    expect(paused.fov).toBe(moving.fov);
    const target = artworkPose(art(1), 390, 844);
    const afterPause = sampleCameraMotion(
      planCameraMotion(paused, target, data.rooms),
      0,
    );
    const inFlight = sampleCameraMotion(
      planCameraMotion(moving, target, data.rooms),
      0,
    );
    expect(Math.hypot(...afterPause.velocity)).toBe(0);
    expect(Math.abs(afterPause.yawVelocity)).toBe(0);
    expect(Math.hypot(...inFlight.velocity)).toBeCloseTo(walk.speed, 8);
    expect(inFlight.yawVelocity).toBeCloseTo(moving.yawVelocity, 8);
    const resizedPause = pausedWalkSample(
      sampleAmbientWalk(walk, 12, 667, 375),
    );
    expect(resizedPause.velocity).toEqual([0, 0, 0]);
    expect(resizedPause.position).toEqual(paused.position);
  });
  it("keeps the walking phase on responsive pause and gives manual navigation its current velocity", () => {
    const walk = createAmbientWalk("room-2", data.rooms);
    for (const fraction of [0.1, 0.35, 0.65, 0.95]) {
      const elapsed = 2 + walk.period * fraction;
      const portrait = sampleAmbientWalk(walk, elapsed, 390, 844);
      const landscape = sampleAmbientWalk(walk, elapsed, 667, 375);
      expect(landscape.position).toEqual(portrait.position);
      expect(landscape.yaw).toBe(portrait.yaw);
      expect(landscape.fov).not.toBe(portrait.fov);
      const manual = planCameraMotion(
        portrait,
        artworkPose(art(1), 390, 844),
        data.rooms,
      );
      const first = sampleCameraMotion(manual, 0);
      expect(distance(first.position, portrait.position)).toBeLessThan(0.00001);
      expect(distance(first.velocity, portrait.velocity)).toBeLessThan(0.00001);
      expect(first.yawVelocity).toBeCloseTo(portrait.yawVelocity, 8);
      let previous = first.position;
      for (let i = 1; i <= 300; i++) {
        const current = sampleCameraMotion(manual, (manual.duration * i) / 300);
        expect(
          segmentIsClear(
            previous,
            current.position,
            obstaclesForRooms(data.rooms),
          ),
        ).toBe(true);
        previous = current.position;
      }
    }
  });
});

describe("Comfortable walking attention", () => {
  const placements = [5, 9, 1, 11].map((slot, i) => ({
    ...art(slot, [0.65, 0.74, 0.7, 0.56][i]),
    id: `walking-art-${i}`,
  }));
  it("keeps all four published wall directions visible while continuing to walk", () => {
    const walk = createAmbientWalk("room-1", data.rooms, placements);
    const empty = createAmbientWalk("room-1", data.rooms);
    expect(walk.period).toBeGreaterThan(80);
    expect(walk.period).toBeLessThan(140);
    expect(walk.speed).toBe(0.28);
    expect(empty.speed).toBeLessThanOrEqual(walk.speed);
    for (const [width, height] of [
      [390, 844],
      [320, 568],
      [1440, 900],
      [667, 375],
    ]) {
      let centers = 0,
        fullFrames = 0;
      const seen = new Set<string>(),
        inset = ambientTourInsets(width, height);
      for (let i = 0; i < 600; i++) {
        const elapsed = 1 + walk.period + (walk.period * i) / 600,
          sample = sampleAmbientWalk(walk, elapsed, width, height);
        const reference = sampleAmbientWalk(
          empty,
          1 + ((elapsed - 1) * walk.speed) / empty.speed,
          width,
          height,
        );
        expect(distance(sample.position, reference.position)).toBeLessThan(
          1e-8,
        );
        expect(
          new Vector3(...sample.velocity)
            .normalize()
            .distanceTo(new Vector3(...reference.velocity).normalize()),
        ).toBeLessThan(1e-8);
        expect(
          Math.hypot(sample.yawVelocity, sample.pitchVelocity),
        ).toBeLessThan(MAX_ARTWORK_GAZE_RATE);
        const id = visibleWalkArtwork(sample, placements, width, height, null);
        if (id) {
          centers++;
          seen.add(id);
        }
        const camera = new PerspectiveCamera(
          sample.fov,
          width / height,
          0.1,
          120,
        );
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
        const entire = placements.some((a) => {
          const slot = slotForArtwork(a)!,
            size = artworkSize(a, slot);
          return [-1, 1].every((x) =>
            [-1, 1].every((y) => {
              const point = new Vector3(
                (x * (size.width + FRAME_OUTSET)) / 2,
                (y * (size.height + FRAME_OUTSET)) / 2,
                FRAME_FRONT_DEPTH,
              )
                .applyAxisAngle(new Vector3(0, 1, 0), slot.rotationY)
                .add(new Vector3(...slot.position))
                .project(camera);
              const px = ((point.x + 1) * width) / 2,
                py = ((1 - point.y) * height) / 2;
              return (
                point.z >= -1 &&
                point.z <= 1 &&
                px >= inset.left &&
                px <= width - inset.right &&
                py >= inset.top &&
                py <= height - inset.bottom
              );
            }),
          );
        });
        if (entire) fullFrames++;
      }
      expect(seen.size).toBe(4);
      expect(centers / 600).toBeGreaterThan(
        width <= 700 && height > width ? 0.6 : 0.83,
      );
      expect(fullFrames / 600).toBeGreaterThan(
        width <= 700 && height > width ? 0.23 : height <= 520 ? 0.6 : 0.65,
      );
    }
  });
  it("uses a periodic C2 gaze with gentle acceleration and no zoom or vertical oscillation", () => {
    const walk = createAmbientWalk("room-1", data.rooms, placements);
    const before = sampleAmbientWalk(walk, walk.period + 1 - 0.0001, 390, 844),
      after = sampleAmbientWalk(walk, walk.period + 1 + 0.0001, 390, 844);
    expect(
      Math.abs(
        Math.atan2(
          Math.sin(after.yaw - before.yaw),
          Math.cos(after.yaw - before.yaw),
        ),
      ),
    ).toBeLessThan(0.0001);
    expect(Math.abs(after.yawVelocity - before.yawVelocity)).toBeLessThan(
      0.0001,
    );
    let peakAcceleration = 0;
    for (let i = 0; i < 1200; i++) {
      const t = 2 + (walk.period * i) / 1200;
      const a = sampleAmbientWalk(walk, t - 0.01, 390, 844),
        b = sampleAmbientWalk(walk, t + 0.01, 390, 844);
      peakAcceleration = Math.max(
        peakAcceleration,
        Math.hypot(
          b.yawVelocity - a.yawVelocity,
          b.pitchVelocity - a.pitchVelocity,
        ) / 0.02,
      );
      expect(a.position[1]).toBe(WALK_EYE_HEIGHT);
      expect(a.velocity[1]).toBe(0);
      expect(a.fov).toBe(overviewFov(390, 844));
      expect(a.fovVelocity).toBe(0);
    }
    expect((peakAcceleration * 180) / Math.PI).toBeLessThan(4);
  });
  it("derives attention from arbitrary placements and falls back safely for empty rooms", () => {
    const fallback = createAmbientWalk("room-1", data.rooms);
    expect(fallback.gaze).toBeUndefined();
    for (const artworks of [
      [art(1)],
      [art(1), art(5)],
      data.artworks.filter((a) => a.roomId === "room-1"),
    ]) {
      const walk = createAmbientWalk("room-1", data.rooms, artworks);
      expect(walk.gaze).toBeDefined();
      for (let i = 0; i < 720; i++) {
        const sample = sampleAmbientWalk(
          walk,
          2 + (walk.period * i) / 720,
          390,
          844,
        );
        expect(Number.isFinite(sample.yaw)).toBe(true);
        expect(
          Math.hypot(sample.yawVelocity, sample.pitchVelocity),
        ).toBeLessThan(MAX_ARTWORK_GAZE_RATE);
      }
    }
  });
});

describe("Near-portal home departure timing", () => {
  it("crosses the nearby portal without imposing a long artificial U-turn", () => {
    const start = destinationPose({ kind: "home" }, data, 1440, 900);
    const end = artworkPose(art(10, 893 / 1600, "room-2"), 1440, 900);
    const motion = planCameraMotion(motionFromPose(start), end, data.rooms);
    expect(motion.duration).toBeGreaterThan(1.65);
    expect(motion.duration).toBeLessThan(
      motion.length +
        motion.orientDuration +
        (motion.focusTurn?.duration ?? 0) +
        3.2,
    );
    expect(motion.gazeVia).toBeNull();
    let low = 0,
      high = motion.duration;
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2;
      if (sampleCameraMotion(motion, mid).position[2] < 9) low = mid;
      else high = mid;
    }
    const crossing = sampleCameraMotion(motion, (low + high) / 2);
    expect(crossing.position[2]).toBeCloseTo(9, 5);
    expect(Math.abs(crossing.position[0])).toBeLessThan(1.28);
    expect(Math.hypot(...crossing.velocity)).toBeGreaterThan(0.2);
    const obstacles = obstaclesForRooms(data.rooms);
    let previous = start.position;
    for (let i = 0; i <= 1000; i++) {
      const sample = sampleCameraMotion(motion, (motion.duration * i) / 1000);
      expect(segmentIsClear(previous, sample.position, obstacles)).toBe(true);
      expect(Math.hypot(...sample.velocity)).toBeLessThanOrEqual(
        MAX_CAMERA_SPEED + 1e-8,
      );
      expect(
        Math.hypot(sample.yawVelocity, sample.pitchVelocity),
      ).toBeLessThanOrEqual(MAX_CAMERA_ANGULAR_SPEED + 1e-8);
      previous = sample.position;
    }
    expect(distance(previous, end.position)).toBeLessThan(1e-8);
    for (const fraction of [0.1, 0.48, 0.8]) {
      const current = sampleCameraMotion(motion, motion.duration * fraction);
      const redirected = planCameraMotion(
        current,
        artworkPose(art(1), 1440, 900),
        data.rooms,
      );
      const resumed = sampleCameraMotion(redirected, 0);
      expect(resumed.position).toEqual(current.position);
      expect(resumed.velocity).toEqual(current.velocity);
      let previous = current.position;
      for (let i = 0; i <= 200; i++) {
        const sample = sampleCameraMotion(
          redirected,
          (redirected.duration * i) / 200,
        );
        expect(segmentIsClear(previous, sample.position, obstacles)).toBe(true);
        previous = sample.position;
      }
    }
  });
});

describe("Direct manual journeys and exact arrival", () => {
  it("takes an unobstructed diagonal directly and turns a local half-turn in about six seconds", () => {
    const from = artworkPose(art(9, 0.74), 1440, 900),
      to = artworkPose(art(11, 0.56), 1440, 900);
    const motion = planCameraMotion(motionFromPose(from), to, data.rooms);
    expect(motion.gazeVia).toBeNull();
    expect(motion.length / distance(from.position, to.position)).toBeLessThan(
      1.03,
    );
    expect(motion.duration).toBeGreaterThan(4.5);
    expect(motion.duration).toBeLessThan(6.5);
    let previous = sampleCameraMotion(motion, 0);
    for (let i = 1; i <= 1000; i++) {
      const sample = sampleCameraMotion(motion, (motion.duration * i) / 1000);
      expect(
        Math.hypot(sample.yawVelocity, sample.pitchVelocity),
      ).toBeLessThanOrEqual(MAX_CAMERA_ANGULAR_SPEED);
      expect(
        Math.hypot(
          sample.yawVelocity - previous.yawVelocity,
          sample.pitchVelocity - previous.pitchVelocity,
        ) /
          (motion.duration / 1000),
      ).toBeLessThan(MAX_CAMERA_ANGULAR_ACCELERATION * 1.01);
      expect(sample.position[1]).toBe(CAMERA_EYE_HEIGHT);
      previous = sample;
    }
  });
  it("keeps the actual body clear of furniture on all gallery routes", () => {
    const choices = [1, 5, 8, 11].flatMap((slot) =>
      data.rooms.map((room) => art(slot, 0.75, room)),
    );
    const obstacles = navigationObstaclesForRooms(data.rooms);
    for (const a of choices)
      for (const b of choices) {
        const motion = planCameraMotion(
          motionFromPose(artworkPose(a, 390, 844)),
          artworkPose(b, 390, 844),
          data.rooms,
        );
        let previous = motion.initial.position;
        for (let i = 1; i <= 150; i++) {
          const position = sampleCameraMotion(
            motion,
            (motion.duration * i) / 150,
          ).position;
          expect(segmentIsClear(previous, position, obstacles)).toBe(true);
          previous = position;
        }
      }
  });
  it("slows locally around a central obstruction without stopping or snapping sideways", () => {
    const from = artworkPose(art(1, 0.8, "room-2"), 1440, 900),
      to = artworkPose(art(11, 0.6), 1440, 900);
    const motion = planCameraMotion(motionFromPose(from), to, data.rooms);
    let previous = sampleCameraMotion(motion, 0);
    for (let i = 1; i <= 1200; i++) {
      const current = sampleCameraMotion(motion, (motion.duration * i) / 1200),
        dt = motion.duration / 1200;
      const acceleration = distance(current.velocity, previous.velocity) / dt;
      expect(acceleration).toBeLessThan(3.5);
      const walkingProgress =
        ((motion.duration * i) / 1200 -
          motion.coastDuration -
          motion.orientDuration) /
        motion.travelDuration;
      if (walkingProgress > 0.05 && walkingProgress < 0.95)
        expect(Math.hypot(...current.velocity)).toBeGreaterThan(0.1);
      previous = current;
    }
  });
  it("keeps displayed angular speed bounded when JavaScript callbacks start late", () => {
    const from = artworkPose(art(8, 1.7, "room-2"), 1440, 1000);
    const to = artworkPose(art(11, 0.65), 1440, 1000);
    const motion = planCameraMotion(motionFromPose(from), to, data.rooms);
    const angle = (a: number, b: number) =>
      Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
    // The recorded fault advanced the curve 22.704 ms in a 16.7 ms display
    // interval, then only 10.499 ms. The shared RAF timestamp stays uniform.
    const dt = 0.0167;
    let start = 0,
      fastest = 0;
    for (let i = 0; i < 1000; i++) {
      const t = (motion.duration * i) / 1000,
        speed = Math.abs(sampleCameraMotion(motion, t).yawVelocity);
      if (speed > fastest) {
        fastest = speed;
        start = t;
      }
    }
    let peakRaf = 0,
      peakCallback = 0;
    const delays = [0, 0, 0.006004, -0.000197, 0];
    for (let i = 1; i < delays.length; i++) {
      const at = (index: number, delayed: boolean) =>
        sampleCameraMotion(
          motion,
          start + dt * index + (delayed ? delays[index] : 0),
        ).yaw;
      peakRaf = Math.max(peakRaf, angle(at(i - 1, false), at(i, false)) / dt);
      peakCallback = Math.max(
        peakCallback,
        angle(at(i - 1, true), at(i, true)) / dt,
      );
    }
    expect(peakRaf).toBeLessThanOrEqual(MAX_CAMERA_ANGULAR_SPEED);
    expect(peakCallback).toBeGreaterThan(MAX_CAMERA_ANGULAR_SPEED * 1.25);
  });
  it("shows the salon tree and three wall directions from the recessed arrival", () => {
    const walk = createAmbientWalk("room-2", data.rooms, data.artworks);
    const pose = ambientWalkPosterPose(walk, 1600, 1000);
    const camera = new PerspectiveCamera(pose.fov, 1.6, 0.1, 120);
    camera.position.fromArray(pose.position);
    camera.lookAt(new Vector3(...pose.target));
    camera.setViewOffset(
      1600,
      1000,
      pose.offsetPx!,
      pose.offsetYPx!,
      1600,
      1000,
    );
    camera.updateMatrixWorld();
    // Conservative full crown volume from the actual salon manifest.
    for (const x of [-0.55, 1.65])
      for (const y of [0, 4.37])
        for (const localZ of [-2.45, -0.25]) {
          const p = new Vector3(x, y, roomOffset("room-2") + localZ).project(
            camera,
          );
          expect(Math.abs(p.x)).toBeLessThan(0.85);
          expect(Math.abs(p.y)).toBeLessThan(0.85);
        }
    for (const [x, localZ] of [
      [-5.86, -3],
      [5.86, -3],
      [-3.5, -8.86],
    ]) {
      const p = new Vector3(x, 2.65, roomOffset("room-2") + localZ).project(
        camera,
      );
      expect(Math.abs(p.x)).toBeLessThan(1);
      expect(Math.abs(p.y)).toBeLessThan(1);
    }
  });
  it("starts with the identical broad poster view and preserves object-fit cover framing", () => {
    const walk = createAmbientWalk("room-1", data.rooms, data.artworks);
    for (const [width, height] of [
      [1600, 1000],
      [430, 932],
      [1440, 900],
      [390, 844],
      [320, 568],
      [667, 375],
      [650, 550],
    ]) {
      const pose = ambientWalkPosterPose(walk, width, height),
        sample = sampleAmbientWalk(walk, 0, width, height);
      expect(pose.position).toEqual(sample.position);
      expect(pose.target).toEqual(motionLookTarget(sample));
      expect(sample.yaw).toBeCloseTo(
        overviewOpeningYaw("room-1", width, height),
        10,
      );
      expect(pose.target[0]).toBeLessThan(0);
      expect(sample.position[0]).toBe(3.3);
      expect(sample.position[2]).toBeCloseTo(8.2, 10);
      expect(sample.position[1]).toBe(CAMERA_EYE_HEIGHT);
      expect(pose.fov).toBe(overviewFov(width, height));
      if (width <= 700 && height >= width) {
        const camera = new PerspectiveCamera(
          pose.fov,
          width / height,
          0.1,
          120,
        );
        camera.position.fromArray(pose.position);
        camera.lookAt(new Vector3(...pose.target));
        camera.setViewOffset(
          width,
          height,
          pose.offsetPx!,
          pose.offsetYPx!,
          width,
          height,
        );
        camera.updateMatrixWorld();
        const lower = new Vector3(-5.7, 1.15, 2).project(camera);
        const upper = new Vector3(-5.7, 4.15, 2).project(camera);
        // Even a 3 m side-wall portrait occupies under a third of the screen;
        // the arrival reads as a room overview rather than a selected artwork.
        expect(Math.abs(upper.y - lower.y) / 2).toBeLessThan(1 / 3);
      }
      const isPortrait = width <= 700 && height > width,
        referenceWidth = isPortrait ? 430 : 1600,
        referenceHeight = isPortrait ? 932 : 1000;
      const reference = sampleAmbientWalk(
          walk,
          0,
          referenceWidth,
          referenceHeight,
        ),
        scale = Math.max(width / referenceWidth, height / referenceHeight);
      expect(sample.offsetX).toBeCloseTo(reference.offsetX * scale, 10);
      expect(sample.offsetY).toBeCloseTo(reference.offsetY * scale, 10);
      const portrait = width <= 700 && height > width,
        ref = portrait ? 430 / 932 : 1.6,
        base = portrait ? 68 : 60;
      expect(Math.tan((pose.fov! * Math.PI) / 360)).toBeCloseTo(
        Math.tan((base * Math.PI) / 360) * Math.min(1, ref / (width / height)),
        10,
      );
    }
  });
});

describe("Directional room arrivals and explicit editorial walking", () => {
  it("arrives just beyond the actual threshold facing travel, never at the far room entrance", () => {
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
      [667, 375],
    ]) {
      const home = motionFromPose(
        ambientWalkPosterPose(
          createAmbientWalk("room-1", data.rooms, data.artworks),
          width,
          height,
        ),
      );
      const salon = roomArrivalPose("room-2", home, width, height, data.rooms);
      expect(salon.position).toEqual([0, CAMERA_EYE_HEIGHT, 10.8]);
      expect(salon.target[2]).toBeGreaterThan(salon.position[2]);
      const back = roomArrivalPose(
        "room-1",
        motionFromPose(salon),
        width,
        height,
        data.rooms,
      );
      expect(back.position).toEqual([0, CAMERA_EYE_HEIGHT, 7.2]);
      expect(back.target[2]).toBeLessThan(back.position[2]);
      expect(
        canRunAmbientTour(
          { kind: "room", roomId: "room-2" },
          false,
          false,
          true,
        ),
      ).toBe(false);
    }
  });
  it("turns toward the door before walking, keeps angular comfort and crosses only the portal", () => {
    const starts = [
      motionFromPose(
        ambientWalkPosterPose(
          createAmbientWalk("room-1", data.rooms, data.artworks),
          1440,
          900,
        ),
      ),
      ...[1, 5, 8, 11].flatMap((slot) =>
        data.rooms.map((room) =>
          motionFromPose(artworkPose(art(slot, 0.8, room), 1440, 900)),
        ),
      ),
    ];
    const obstacles = navigationObstaclesForRooms(data.rooms);
    for (const from of starts) {
      const targetRoom = from.position[2] < 9 ? "room-2" : "room-1";
      const pose = roomArrivalPose(targetRoom, from, 1440, 900, data.rooms);
      const motion = planCameraMotion(from, pose, data.rooms);
      expect(motion.duration).toBeLessThan(14);
      let previous = sampleCameraMotion(motion, 0);
      for (let i = 1; i <= 800; i++) {
        const sample = sampleCameraMotion(motion, (motion.duration * i) / 800);
        expect(
          segmentIsClear(previous.position, sample.position, obstacles),
        ).toBe(true);
        expect(
          Math.hypot(sample.yawVelocity, sample.pitchVelocity),
        ).toBeLessThanOrEqual(MAX_CAMERA_ANGULAR_SPEED);
        if (Math.hypot(...sample.velocity) > 0.03) {
          const heading = new Vector3(
            Math.sin(sample.yaw),
            0,
            Math.cos(sample.yaw),
          );
          const movement = new Vector3(...sample.velocity).normalize();
          expect(heading.dot(movement)).toBeGreaterThan(0);
        }
        if ((previous.position[2] - 9) * (sample.position[2] - 9) < 0) {
          expect(Math.abs(sample.position[0])).toBeLessThan(1.28);
          expect(
            Math.cos(sample.yaw) * (targetRoom === "room-2" ? 1 : -1),
          ).toBeGreaterThan(0.5);
        }
        previous = sample;
      }
      expect(distance(previous.position, pose.position)).toBeLessThan(1e-7);
    }
  });
  it("keeps the current view when the current room is selected, including responsive reframing", () => {
    const from = motionFromPose(artworkPose(art(5, 0.75, "room-2"), 1440, 900));
    const pose = roomArrivalPose("room-2", from, 390, 844, data.rooms);
    expect(pose.position).toEqual(from.position);
    expect(pose.target).toEqual(motionLookTarget(from));
    expect(pose.roomEntry).toBeUndefined();
  });
  it("joins a nearby point of the room loop with no initial teleport and ramps walking there", () => {
    for (const roomId of data.rooms) {
      const walk = createAmbientWalk(roomId, data.rooms, data.artworks);
      const from = motionFromPose(artworkPose(art(1, 0.8, roomId), 1440, 900));
      const entry = nearestWalkEntry(walk, from);
      const zero = sampleJoinedAmbientWalk(walk, 0, entry, 1440, 900);
      const base = sampleAmbientWalk(walk, entry, 1440, 900);
      expect(zero.position).toEqual(base.position);
      expect(Math.hypot(...zero.velocity)).toBe(0);
      expect(
        Math.hypot(
          ...sampleJoinedAmbientWalk(walk, 1, entry, 1440, 900).velocity,
        ),
      ).toBeCloseTo(walk.speed / 2, 8);
      expect(
        Math.hypot(
          ...sampleJoinedAmbientWalk(walk, 2, entry, 1440, 900).velocity,
        ),
      ).toBeCloseTo(walk.speed, 8);
      const join = planCameraMotion(
        from,
        {
          position: zero.position,
          target: motionLookTarget(zero),
          offsetPx: zero.offsetX,
          offsetYPx: zero.offsetY,
          fov: zero.fov,
          roomId,
        },
        data.rooms,
      );
      expect(sampleCameraMotion(join, 0).position).toEqual(from.position);
      expect(
        distance(
          sampleCameraMotion(join, join.duration).position,
          zero.position,
        ),
      ).toBeLessThan(1e-7);
      const clock = new TourTimeline();
      clock.update(0, true);
      clock.update(1, true);
      clock.update(2, false);
      clock.update(500, false);
      clock.update(501, true);
      expect(clock.time).toBe(1);
    }
  });
});

describe("Full painting and cartel framing", () => {
  it("keeps the complete fixed-width cartel above the dock for small, moved and sold artworks", () => {
    const viewports = [
      [1440, 900],
      [390, 844],
      [320, 568],
      [667, 375],
    ];
    for (const [width, height] of viewports)
      for (const roomId of data.rooms)
        for (const index of [0, 1, 3, 4, 5, 7, 8, 9, 11])
          for (const scale of [0.1, 0.35, 0.6, 1]) {
            const artwork = {
              ...art(index, [0.6, 1, 2.2][index % 3], roomId),
              displayScale: scale,
              placementOffsetY: 0.15,
              availability: "sold" as const,
            };
            const slot = slotForArtwork(artwork)!,
              size = artworkSize(artwork, slot),
              p = artworkPose(artwork, width, height);
            const camera = new PerspectiveCamera(
              p.fov,
              width / height,
              0.1,
              120,
            );
            camera.position.fromArray(p.position);
            camera.lookAt(new Vector3(...p.target));
            camera.setViewOffset(
              width,
              height,
              p.offsetPx,
              p.offsetYPx,
              width,
              height,
            );
            camera.updateMatrixWorld();
            const inset = artworkInsets(width, height);
            for (const [halfW, minY, maxY, depth] of [
              [
                (size.width + FRAME_OUTSET) / 2,
                -(size.height + FRAME_OUTSET) / 2,
                (size.height + FRAME_OUTSET) / 2,
                FRAME_FRONT_DEPTH,
              ],
              [
                0.31,
                -size.height / 2 - 0.345,
                -size.height / 2 - 0.155,
                -0.012,
              ],
            ])
              for (const x of [-halfW, halfW])
                for (const y of [minY, maxY]) {
                  const point = new Vector3(
                    slot.position[0] +
                      Math.cos(slot.rotationY) * x +
                      slot.wallNormal[0] * depth,
                    slot.position[1] + y,
                    slot.position[2] -
                      Math.sin(slot.rotationY) * x +
                      slot.wallNormal[2] * depth,
                  ).project(camera);
                  const px = ((point.x + 1) * width) / 2,
                    py = ((1 - point.y) * height) / 2;
                  expect(px).toBeGreaterThan(0);
                  expect(px).toBeLessThan(width - inset.right);
                  expect(py).toBeGreaterThan(inset.top);
                  expect(py).toBeLessThan(height - inset.bottom);
                }
          }
  });
  it("reproduces sold03 slot05 offsets .2/.15 scale.6 with every cartel corner visible", () => {
    const artwork = {
      ...art(4, 0.74),
      displayScale: 0.6,
      placementOffsetX: 0.2,
      placementOffsetY: 0.15,
      availability: "sold" as const,
    };
    const p = artworkPose(artwork, 1440, 900),
      slot = slotForArtwork(artwork)!,
      size = artworkSize(artwork, slot);
    const camera = new PerspectiveCamera(p.fov, 1.6, 0.1, 120);
    camera.position.fromArray(p.position);
    camera.lookAt(new Vector3(...p.target));
    camera.setViewOffset(1440, 900, p.offsetPx, p.offsetYPx, 1440, 900);
    camera.updateMatrixWorld();
    const bottom = new Vector3(
      slot.position[0] + slot.wallNormal[0] * -0.012,
      slot.position[1] - size.height / 2 - 0.345,
      slot.position[2] + slot.wallNormal[2] * -0.012,
    ).project(camera);
    expect((1 - bottom.y) * 450).toBeLessThan(
      900 - artworkInsets(1440, 900).bottom - 12,
    );
  });
});

describe("Direct physical room arrivals", () => {
  it("keeps the receiving gaze monotone and joins the existing introduction without a seam", () => {
    for (const roomId of data.rooms) {
      const walk = createAmbientWalk(roomId, data.rooms, data.artworks);
      const other = createAmbientWalk(
        roomId === "room-1" ? "room-2" : "room-1",
        data.rooms,
        data.artworks,
      );
      const source = motionFromPose(ambientWalkPosterPose(other, 1440, 900));
      const doorway = motionFromPose(
        roomArrivalPose(roomId, source, 1440, 900, data.rooms),
      );
      const entry = roomWalkEntry(walk, doorway);
      const end = roomWalkEntrySample(walk, entry, 1440, 900);
      const motion = planCameraMotion(
        source,
        {
          position: end.position,
          target: motionLookTarget(end),
          roomId,
          roomEntry: true,
          offsetPx: end.offsetX,
          offsetYPx: end.offsetY,
          fov: end.fov,
        },
        data.rooms,
        { endSample: end },
      );
      const yaw = motion.roomLook!.yaw,
        direction = Math.sign(yaw.at(-1)! - yaw[0]);
      expect(
        yaw.slice(1).every((value, i) => (value - yaw[i]) * direction >= -1e-9),
      ).toBe(true);
      expect(
        (end.position[2] - 9) * (roomId === "room-2" ? 1 : -1),
      ).toBeGreaterThan(2.5);
      if (roomId === "room-2") expect(motion.duration).toBeLessThan(8);
      const speed = Math.hypot(
        ...sampleCameraMotion(motion, motion.duration).velocity,
      );
      const introduction = roomWalkIntroduction(walk, entry, speed)!;
      let previous = sampleJoinedAmbientWalk(
        walk,
        0,
        entry,
        1440,
        900,
        speed,
        introduction,
      );
      expect(Math.abs(previous.yaw - end.yaw)).toBeLessThan(1e-8);
      for (let t = 0.05; t <= introduction.duration + 1; t += 0.05) {
        const sample = sampleJoinedAmbientWalk(
          walk,
          t,
          entry,
          1440,
          900,
          speed,
          introduction,
        );
        const turn = Math.atan2(
          Math.sin(sample.yaw - previous.yaw),
          Math.cos(sample.yaw - previous.yaw),
        );
        expect(Math.abs(turn) / 0.05).toBeLessThan(MAX_WALK_YAW_RATE * 1.015);
        expect(Math.hypot(...sample.velocity)).toBeGreaterThan(0.1);
        previous = sample;
      }
    }
  });

  it("merges into the room loop with continuous position, speed and gaze through the real doorway", () => {
    const obstacles = navigationObstaclesForRooms(data.rooms);
    for (const roomId of data.rooms) {
      const walk = createAmbientWalk(roomId, data.rooms, data.artworks);
      const other = roomId === "room-1" ? "room-2" : "room-1";
      for (const [width, height] of [
        [1440, 900],
        [390, 844],
        [320, 568],
        [667, 375],
      ]) {
        for (const slot of [1, 5, 8, 11]) {
          const source = motionFromPose(
            artworkPose(art(slot, 0.8, other), width, height),
          );
          const doorway = motionFromPose(
            roomArrivalPose(roomId, source, width, height, data.rooms),
          );
          const entry = roomWalkEntry(walk, doorway);
          const end = roomWalkEntrySample(walk, entry, width, height);
          const target = {
            position: end.position,
            target: motionLookTarget(end),
            roomId,
            fov: end.fov,
            offsetPx: end.offsetX,
            offsetYPx: end.offsetY,
            roomEntry: true,
          };
          const motion = planCameraMotion(source, target, data.rooms, {
            endSample: end,
          });
          expect(motion.duration).toBeLessThan(15);
          let previous = sampleCameraMotion(motion, 0),
            crossings = 0;
          for (let i = 1; i <= 800; i++) {
            const sample = sampleCameraMotion(
              motion,
              (motion.duration * i) / 800,
            );
            expect(
              segmentIsClear(previous.position, sample.position, obstacles),
            ).toBe(true);
            expect(Math.hypot(...sample.velocity)).toBeLessThanOrEqual(
              MAX_CAMERA_SPEED + 1e-6,
            );
            expect(
              Math.hypot(sample.yawVelocity, sample.pitchVelocity),
            ).toBeLessThanOrEqual(MAX_CAMERA_ANGULAR_SPEED);
            if (Math.hypot(...sample.velocity) > 0.05)
              expect(
                new Vector3(Math.sin(sample.yaw), 0, Math.cos(sample.yaw)).dot(
                  new Vector3(...sample.velocity).normalize(),
                ),
              ).toBeGreaterThan(0);
            if (Math.hypot(...sample.velocity) > 1)
              expect(
                new Vector3(Math.sin(sample.yaw), 0, Math.cos(sample.yaw)).dot(
                  new Vector3(...sample.velocity).normalize(),
                ),
              ).toBeGreaterThan(Math.SQRT1_2);
            expect(
              Math.hypot(
                sample.yawVelocity - previous.yawVelocity,
                sample.pitchVelocity - previous.pitchVelocity,
              ) /
                (motion.duration / 800),
            ).toBeLessThan(MAX_CAMERA_ANGULAR_ACCELERATION * 1.015);
            if ((previous.position[2] - 9) * (sample.position[2] - 9) < 0) {
              expect(
                Math.cos(sample.yaw) * (roomId === "room-2" ? 1 : -1),
              ).toBeGreaterThan(Math.SQRT1_2);
              crossings++;
              expect(Math.abs(sample.position[0])).toBeLessThan(1.28);
            }
            previous = sample;
          }
          expect(crossings).toBe(1);
          const speed = Math.hypot(...previous.velocity);
          expect(speed).toBeGreaterThan(0.1);
          const introduction = roomWalkIntroduction(walk, entry, speed);
          const joined = sampleJoinedAmbientWalk(
            walk,
            0,
            entry,
            width,
            height,
            speed,
            introduction,
          );
          expect(distance(previous.position, joined.position)).toBeLessThan(
            1e-7,
          );
          expect(distance(previous.velocity, joined.velocity)).toBeLessThan(
            0.003,
          );
          expect(
            Math.abs(previous.yawVelocity - joined.yawVelocity),
          ).toBeLessThan(1e-8);
          expect(
            Math.abs(previous.pitchVelocity - joined.pitchVelocity),
          ).toBeLessThan(1e-8);
          for (let t = 0; t <= 3; t += 0.1) {
            const moving = sampleJoinedAmbientWalk(
              walk,
              t,
              entry,
              width,
              height,
              speed,
              introduction,
            );
            expect(
              segmentIsClear(moving.position, moving.position, obstacles),
            ).toBe(true);
            expect(Math.hypot(...moving.velocity)).toBeGreaterThan(0.1);
            expect((Math.abs(moving.yawVelocity) * 180) / Math.PI).toBeLessThan(
              12,
            );
          }
        }
      }
    }
  });
});

it("resumes the nearby promenade from settled and interrupted artwork poses without reversing the walk", () => {
  const rooms = ["room-1", "room-2"];
  for (const roomId of rooms) {
    const walk = createAmbientWalk(roomId, rooms, []);
    for (const slot of [0, 1, 2, 3]) {
      const work = art(slot, slot % 2 ? 1.4 : 0.75, roomId);
      const approach = planCameraMotion(
        motionFromPose(ambientWalkPosterPose(walk, 1440, 900)),
        artworkPose(work, 1440, 900),
        rooms,
      );
      for (const phase of [0.3, 0.7, 1]) {
        const from = sampleCameraMotion(approach, approach.duration * phase);
        const entry = nearestWalkEntry(walk, from);
        const end = roomWalkEntrySample(walk, entry, 1440, 900);
        const resumed = planCameraMotion(
          from,
          {
            position: end.position,
            target: motionLookTarget(end),
            roomId,
            roomEntry: true,
            fov: end.fov,
            offsetPx: end.offsetX,
            offsetYPx: end.offsetY,
          },
          rooms,
          { endSample: end },
        );
        const zero = sampleCameraMotion(resumed, 0);
        expect(distance(zero.position, from.position)).toBeLessThan(1e-7);
        expect(zero.yaw).toBeCloseTo(from.yaw, 7);
        let previous = zero;
        for (let t = 1 / 60; t <= resumed.duration; t += 1 / 60) {
          const sample = sampleCameraMotion(resumed, t);
          expect(
            segmentIsClear(
              previous.position,
              sample.position,
              navigationObstaclesForRooms(rooms),
            ),
          ).toBe(true);
          const speed = Math.hypot(...sample.velocity);
          // The short inertial brake retains the interrupted frame's momentum.
          if (t > 0.3 && speed > 0.08) {
            const forward =
              (Math.sin(sample.yaw) * sample.velocity[0] +
                Math.cos(sample.yaw) * sample.velocity[2]) /
              speed;
            expect(
              forward,
              `${roomId} slot ${slot} phase ${phase} t ${t}`,
            ).toBeGreaterThan(0);
          }
          previous = sample;
        }
        const last = sampleCameraMotion(resumed, resumed.duration);
        const speed = Math.hypot(...last.velocity);
        expect(speed).toBeGreaterThan(0.01);
        const continued = sampleJoinedAmbientWalk(
          walk,
          0,
          entry,
          1440,
          900,
          speed,
          roomWalkIntroduction(walk, entry, speed),
        );
        expect(distance(continued.position, last.position)).toBeLessThan(1e-6);
        expect(Math.hypot(...continued.velocity)).toBeCloseTo(speed, 6);
      }
    }
  }
});

it("does not overshoot a nearby loop after cancelling just after an artwork selection", () => {
  const rooms = ["room-1", "room-2"];
  for (const roomId of rooms) {
    const walk = createAmbientWalk(roomId, rooms, []);
    for (const elapsed of [10, 30, 60, 90]) {
      const approach = planCameraMotion(
        sampleAmbientWalk(walk, elapsed, 1728, 1028),
        artworkPose(art(0, 0.75, roomId), 1728, 1028),
        rooms,
      );
      const from = sampleCameraMotion(approach, 0.3);
      const entry = nearestWalkEntry(walk, from);
      const end = roomWalkEntrySample(walk, entry, 1728, 1028);
      const motion = planCameraMotion(
        from,
        {
          position: end.position,
          target: motionLookTarget(end),
          roomId,
          roomEntry: true,
          offsetPx: end.offsetX,
          offsetYPx: end.offsetY,
          fov: end.fov,
        },
        rooms,
        { endSample: end },
      );
      expect(
        motion.length / distance(from.position, end.position),
      ).toBeLessThan(1.6);
      expect(motion.duration).toBeLessThan(12);
    }
  }
});

describe("Expanded artwork browser framing", () => {
  it("fits every frame inside the space above an expanded dock and beside the artwork details", () => {
    const obstacles = obstaclesForRooms(data.rooms);
    let opticalAdjustments = 0;
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [667, 375],
      [320, 1400],
      [800, 2000],
      [1440, 900],
      [978, 878],
    ]) {
      for (const roomId of data.rooms)
        for (const index of [0, 3, 4, 7, 8, 9, 11])
          for (const ratio of [0.45, 1, 2.2]) {
            const a = art(index, ratio, roomId),
              slot = slotForArtwork(a)!,
              size = artworkSize(a, slot);
            const portrait = width <= 700 && height > width;
            const inset = {
              top: portrait ? 128 : 96,
              bottom: portrait ? 340 : 230,
              right: portrait ? 16 : 330,
              left: 16,
            };
            const pose = artworkPose(a, width, height, inset);
            expect(Math.abs(pose.position[0])).toBeLessThanOrEqual(5.25 + 1e-8);
            expect(
              Math.abs(pose.position[2] - roomOffset(roomId)),
            ).toBeLessThanOrEqual(8.25 + 1e-8);
            expect(
              segmentIsClear(pose.position, pose.position, obstacles),
            ).toBe(true);
            if (pose.fov! > CAMERA_FOV) opticalAdjustments++;
            const camera = new PerspectiveCamera(
              pose.fov,
              width / height,
              0.1,
              120,
            );
            camera.position.fromArray(pose.position);
            camera.lookAt(new Vector3(...pose.target));
            camera.setViewOffset(
              width,
              height,
              pose.offsetPx,
              pose.offsetYPx,
              width,
              height,
            );
            camera.updateMatrixWorld();

            for (const x of [-1, 1])
              for (const y of [-1, 1]) {
                const corner = new Vector3(
                  slot.position[0] +
                    slot.wallNormal[0] * FRAME_FRONT_DEPTH +
                    (Math.cos(slot.rotationY) *
                      x *
                      (size.width + FRAME_OUTSET)) /
                      2,
                  slot.position[1] + (y * (size.height + FRAME_OUTSET)) / 2,
                  slot.position[2] +
                    slot.wallNormal[2] * FRAME_FRONT_DEPTH -
                    (Math.sin(slot.rotationY) *
                      x *
                      (size.width + FRAME_OUTSET)) /
                      2,
                ).project(camera);
                expect(((corner.x + 1) * width) / 2).toBeGreaterThan(
                  inset.left,
                );
                expect(((corner.x + 1) * width) / 2).toBeLessThan(
                  width - inset.right,
                );
                expect(((1 - corner.y) * height) / 2).toBeGreaterThan(
                  inset.top,
                );
                expect(((1 - corner.y) * height) / 2).toBeLessThan(
                  height - inset.bottom,
                );
              }
          }
    }
    expect(opticalAdjustments).toBeGreaterThan(0);
  });
});
