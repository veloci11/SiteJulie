import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { Artwork } from "../lib/data/types";
import fixture from "./fixtures/catalog.json";
import { artworkPose } from "../lib/museum/navigation";
import {
  artworkSize,
  FRAME_OUTSET,
  FRAME_FRONT_DEPTH,
  getSlots,
} from "../lib/museum/config";

describe("Centred artwork focus with a details card", () => {
  it("keeps portrait and landscape paintings centred and outside the card on every wall", () => {
    for (const [width, height, right] of [
      [1440, 900, 330],
      [978, 878, 330],
      [1920, 1080, 330],
      [390, 844, 16],
    ]) {
      const inset = {
        top: 128,
        bottom: height > width ? 340 : 230,
        left: 16,
        right,
      };
      for (const index of [0, 4, 8, 11])
        for (const ratio of [0.45, 2.2]) {
          const slot = getSlots()[index];
          const artwork = {
          ...fixture.artworks[0],
          roomId: "room-1",
            slotId: slot.id,
            imageWidth: ratio * 1000,
            imageHeight: 1000,
            widthCm: null,
            heightCm: null,
            displayScale: 1,
            placementOffsetX: 0,
            placementOffsetY: 0,
          } as Artwork;
          const pose = artworkPose(artwork, width, height, inset);
          expect(pose.offsetPx).toBe(0);
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
          const centre = new Vector3(...slot.position).project(camera);
          expect(((centre.x + 1) * width) / 2).toBeCloseTo(width / 2, 5);
          const size = artworkSize(artwork, slot);
          for (const x of [-1, 1])
            for (const y of [-1, 1]) {
              const corner = new Vector3(
                slot.position[0] +
                  slot.wallNormal[0] * FRAME_FRONT_DEPTH +
                  (Math.cos(slot.rotationY) * x * (size.width + FRAME_OUTSET)) /
                    2,
                slot.position[1] + (y * (size.height + FRAME_OUTSET)) / 2,
                slot.position[2] +
                  slot.wallNormal[2] * FRAME_FRONT_DEPTH -
                  (Math.sin(slot.rotationY) * x * (size.width + FRAME_OUTSET)) /
                    2,
              ).project(camera);
              const px = ((corner.x + 1) * width) / 2;
              expect(px).toBeGreaterThan(inset.right);
              expect(px).toBeLessThan(width - inset.right);
              const py = ((1 - corner.y) * height) / 2;
              expect(py).toBeGreaterThan(inset.top);
              expect(py).toBeLessThan(height - inset.bottom);
            }
        }
    }
  });
  it("also centres the initial focus before the card has been measured", () => {
    expect(
      artworkPose(fixture.artworks[0] as Artwork, 1440, 900).offsetPx,
    ).toBe(0);
  });
});
