import { describe, expect, it } from "vitest";
import source from "../content/portfolio.json";
import { artworkSchema } from "../lib/validation/artwork";
import { createAmbientWalk, sampleAmbientWalk } from "../lib/museum/tour";
import {
  ContinuousPromenade,
  PROMENADE_YAW_SPEED,
} from "../lib/museum/promenade";
import {
  artworkPose,
  motionFromPose,
  navigationObstaclesForRooms,
  segmentIsClear,
  CAMERA_EYE_HEIGHT,
} from "../lib/museum/navigation";

const artworks = source.artworks.map((a) =>
  artworkSchema.parse({
    ...a,
    image: `/api/media/${a.id}`,
    thumbnail: "",
    detailImage: "",
  }),
);
describe("comfort with the complete 26-work hanging", () => {
  for (const room of source.rooms) {
    it(`keeps a level, slowly rotating view over a full loop in ${room}`, () => {
      const walk = createAmbientWalk(room, source.rooms, artworks);
      const tour = new ContinuousPromenade(
        walk,
        sampleAmbientWalk(walk, 0, 1440, 900),
        source.rooms,
        0,
      );
      let peakYaw = 0;
      let peakAcceleration = 0;
      let previous = tour.sample;
      const obstacles = navigationObstaclesForRooms(source.rooms);
      for (let i = 0; i < 600 * 30 && tour.distance < walk.length + 1; i++) {
        const frame = tour.step(1 / 30, 1440, 900);
        peakYaw = Math.max(peakYaw, Math.abs(frame.yawVelocity));
        peakAcceleration = Math.max(
          peakAcceleration,
          Math.abs(frame.yawVelocity - previous.yawVelocity) * 30,
        );
        expect(
          segmentIsClear(previous.position, frame.position, obstacles),
        ).toBe(true);
        expect(frame.position[1]).toBeCloseTo(CAMERA_EYE_HEIGHT);
        expect(frame.fov).toBe(previous.fov);
        expect(frame.offsetX).toBe(previous.offsetX);
        previous = frame;
      }
      expect(tour.distance).toBeGreaterThan(walk.length);
      expect(peakYaw).toBeLessThanOrEqual(PROMENADE_YAW_SPEED + 1e-6);
      expect(peakAcceleration).toBeLessThanOrEqual(Math.PI / 20 + 1e-6);
    });
  }
  it("can resume from every real artwork, including the two lower hangings", () => {
    for (const artwork of artworks) {
      const from = motionFromPose(artworkPose(artwork, 390, 844));
      const walk = createAmbientWalk(artwork.roomId, source.rooms, artworks);
      const tour = new ContinuousPromenade(walk, from, source.rooms);
      expect(tour.sample.position).toEqual(from.position);
      for (let i = 0; i < 40 * 30; i++) tour.step(1 / 30, 390, 844);
      expect(tour.distance, artwork.id).toBeGreaterThan(0.2);
    }
  }, 20000);
});
