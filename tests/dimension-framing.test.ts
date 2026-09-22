import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import fixture from "./fixtures/catalog.json";
import type { AdminArtwork } from "@/lib/data/types";
import {
  artworkSize,
  getSlots,
  slotForArtwork,
  FRAME_OUTSET,
  FRAME_FRONT_DEPTH,
} from "@/lib/museum/config";
import { showroomReference } from "@/lib/museum/showroomSizing";
import {
  artworkPose,
  navigationObstaclesForRooms,
  segmentIsClear,
} from "@/lib/museum/navigation";
import { getZones } from "@/lib/museum/zones";
import { slotCode } from "@/lib/admin/placement-guide";
import { automaticLens } from "@/lib/museum/automaticFraming";
import { hangingGroups } from "@/lib/museum/hangingGroups";
import { createAmbientWalk } from "@/lib/museum/tour";
import { motionFromPose, motionLookTarget } from "@/lib/museum/navigation";
import { resolvePlacement } from "@/lib/validation/artwork";
import { findZonePlacement } from "@/lib/validation/placement";

const source = {
  ...fixture.artworks[0],
  roomId: "room-1",
  slotId: "room-1-slot-02",
  placementOffsetX: 0,
  placementOffsetY: 0,
  imageWidth: 500,
  imageHeight: 900,
  widthCm: 50,
  heightCm: 90,
} as AdminArtwork;
describe("Real size reference and individual camera framing", () => {
  it("uses a free zone at the requested size before shrinking into an occupied zone", () => {
    const first = getZones("room-1")[0];
    const incoming = {
      ...source,
      id: "incoming",
      slotId: "",
      displayScale: showroomReference(source, first).scale,
    };
    const blocker = {
      ...source,
      id: "blocker",
      slotId: first.id,
      imageWidth: 230,
      imageHeight: 150,
      displayScale: 1,
    };
    const before = structuredClone(blocker);
    const squeezed = findZonePlacement(incoming, first, [blocker], true)!;
    expect(squeezed).toBeTruthy();
    expect(artworkSize(squeezed, first).height).toBeLessThan(0.9);
    const placed = resolvePlacement(incoming, [blocker], ["room-1"]);
    expect(placed.slotId).not.toBe(first.id);
    const size = artworkSize(placed, slotForArtwork(placed)!);
    expect(size.width).toBeCloseTo(0.5, 7);
    expect(size.height).toBeCloseTo(0.9, 7);
    expect(blocker).toEqual(before);
  });
  it("keeps individual focus targets distinct and adapts distance to each saved size", () => {
    const slot = getSlots()[1];
    const scale = showroomReference(source, slot).scale;
    const upper = {
      ...source,
      id: "upper",
      displayScale: scale,
      placementOffsetX: -0.4,
      placementOffsetY: 0.6,
    };
    const lower = {
      ...source,
      id: "lower",
      displayScale: scale / 2,
      placementOffsetX: 0.4,
      placementOffsetY: -1,
    };
    const a = artworkPose(upper, 1440, 900),
      b = artworkPose(lower, 1440, 900);
    expect(a.target[1] - b.target[1]).toBeCloseTo(1.6);
    expect(Math.abs(a.target[2] - b.target[2])).toBeCloseTo(0.8);
    expect(Math.abs(a.position[0] - a.target[0])).toBeGreaterThan(
      Math.abs(b.position[0] - b.target[0]),
    );
  });
  it("looks at both stacked paintings during walking and fits the entire shared zone", () => {
    const slot = getSlots()[1],
      scale = showroomReference(source, slot).scale;
    const artworks = [
      { ...source, id: "upper", displayScale: scale, placementOffsetY: 0.7 },
      { ...source, id: "lower", displayScale: scale, placementOffsetY: -1 },
    ];
    const group = hangingGroups(artworks)[0];
    expect(group.artworks).toHaveLength(2);
    expect(group.position[1]).toBeCloseTo(2.5);
    const walk = createAmbientWalk("room-1", ["room-1", "room-2"], artworks);
    const onlyUpper = createAmbientWalk(
      "room-1",
      ["room-1", "room-2"],
      [artworks[0]],
    );
    expect(
      walk.gaze!.pitch.some(
        (p, i) => Math.abs(p - onlyUpper.gaze!.pitch[i]) > 0.05,
      ),
    ).toBe(true);
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ]) {
      const inset = { top: 128, bottom: 230, left: 16, right: 16 };
      const sample = motionFromPose({
        position: [group.position[0] + 3, 2.05, group.position[2]],
        target: group.position,
        roomId: "room-1",
        offsetPx: 0,
        offsetYPx: 0,
        fov: 50,
      });
      const lens = automaticLens(sample, artworks, width, height, inset);
      const camera = new PerspectiveCamera(lens.fov, width / height, 0.1, 120);
      camera.position.fromArray(sample.position);
      camera.lookAt(new Vector3(...motionLookTarget(sample)));
      camera.setViewOffset(
        width,
        height,
        lens.offsetX,
        lens.offsetY,
        width,
        height,
      );
      camera.updateMatrixWorld();
      for (const artwork of artworks) {
        const placed = slotForArtwork(artwork)!,
          size = artworkSize(artwork, placed);
        for (const x of [-1, 1])
          for (const y of [-1, 1]) {
            const p = new Vector3(
              placed.position[0] + FRAME_FRONT_DEPTH,
              placed.position[1] + (y * (size.height + FRAME_OUTSET)) / 2,
              placed.position[2] - (x * (size.width + FRAME_OUTSET)) / 2,
            ).project(camera);
            expect(((p.x + 1) * width) / 2).toBeGreaterThan(inset.left);
            expect(((p.x + 1) * width) / 2).toBeLessThan(width - inset.right);
            expect(((1 - p.y) * height) / 2).toBeGreaterThan(inset.top);
            expect(((1 - p.y) * height) / 2).toBeLessThan(
              height - inset.bottom,
            );
          }
      }
    }
  });
  it("uses centimetres at 100%, permits enlargement, and preserves actual size when metadata changes", () => {
    const slot = getSlots()[1];
    const reference = showroomReference(source, slot);
    const a = { ...source, displayScale: reference.scale };
    expect(artworkSize(a, slot).width).toBeCloseTo(0.5);
    expect(artworkSize(a, slot).height).toBeCloseTo(0.9);
    expect(showroomReference(a, slot).percentage).toBe(100);
    expect(
      showroomReference({ ...a, displayScale: reference.scale * 1.5 }, slot)
        .percentage,
    ).toBeCloseTo(150);
    expect(artworkSize({ ...a, widthCm: 80, heightCm: 144 }, slot)).toEqual(
      artworkSize(a, slot),
    );
    const mismatch = showroomReference(
      { ...source, imageWidth: 900, imageHeight: 500 },
      slot,
    );
    expect(mismatch.ratioMismatch).toBe(true);
    expect(mismatch.width).toBeLessThanOrEqual(0.5);
    expect(mismatch.height).toBeLessThanOrEqual(0.9);
  });
  it("adds the centre of the closed D wall only while room 2 is terminal", () => {
    const room2 = getZones("room-2", ["room-1", "room-2"]);
    expect(room2).toHaveLength(13);
    const centre = room2.find((s) => slotCode(s) === "D centre")!;
    expect(centre.position).toEqual([0, 2.65, 26.86]);
    expect(
      getZones("room-2", ["room-1", "room-2", "room-3"]).some(
        (s) => s.id === centre.id,
      ),
    ).toBe(false);
  });
  it("fits real frame corners of small, enlarged and shifted works independently on every wall", () => {
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
      [667, 375],
    ]) {
      const inset = {
        top: 100,
        bottom: height < 500 ? 90 : 230,
        left: 16,
        right: width > 700 ? 330 : 16,
      };
      for (const index of [1, 5, 8, 11])
        for (const y of [-1, 0, 0.8])
          for (const factor of [0.5, 1, 1.5]) {
            const anchor = getSlots()[index];
            const a = {
              ...source,
              slotId: anchor.id,
              placementOffsetX: 0.3,
              placementOffsetY: y,
              displayScale: showroomReference(source, anchor).scale * factor,
            };
            const slot = slotForArtwork(a)!;
            const pose = artworkPose(a, width, height, inset);
            expect(
              segmentIsClear(
                pose.position,
                pose.position,
                navigationObstaclesForRooms([a.roomId]),
              ),
            ).toBe(true);
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
            const size = artworkSize(a, slot);
            for (const x of [-1, 1])
              for (const y of [-1, 1]) {
                const p = new Vector3(
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
                const px = ((p.x + 1) * width) / 2,
                  py = ((1 - p.y) * height) / 2;
                expect(
                  px,
                  JSON.stringify({
                    index,
                    factor,
                    offset: a.placementOffsetY,
                    width,
                    height,
                    px,
                  }),
                ).toBeGreaterThan(inset.left);
                expect(px).toBeLessThan(width - inset.right);
                expect(py).toBeGreaterThan(inset.top);
                expect(py).toBeLessThan(height - inset.bottom);
              }
          }
    }
  });
});
