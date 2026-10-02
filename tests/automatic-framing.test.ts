import { describe, it, expect, vi } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { Artwork } from "../lib/data/types";
import {
  automaticLens,
  automaticTourInsets,
} from "../lib/museum/automaticFraming";
import {
  getSlots,
  artworkSize,
  FRAME_OUTSET,
  FRAME_FRONT_DEPTH,
} from "../lib/museum/config";
import { motionFromPose, motionLookTarget } from "../lib/museum/navigation";

describe("Automatic visit framing", () => {
  it("keeps the lens and actual painting projection stable while its preview mounts, hides and changes", () => {
    const slot = getSlots()[0];
    const artwork = {
      id: "preview-work",
      roomId: "room-1",
      slotId: slot.id,
      imageWidth: 1000,
      imageHeight: 1000,
      widthCm: null,
      heightCm: null,
      displayScale: 0.5,
    } as Artwork;
    const sample = motionFromPose({
      position: slot.position.map((n, i) => n + slot.wallNormal[i] * 3) as [
        number,
        number,
        number,
      ],
      target: slot.position,
      roomId: "room-1",
      offsetPx: 0,
      offsetYPx: 0,
    });
    let preview: { getBoundingClientRect: () => object } | null = null;
    const shell = {
      querySelector: (selector: string) =>
        selector === ".visit-dock"
          ? { getBoundingClientRect: () => ({ top: 700 }) }
          : selector === ".visit-auto-preview"
            ? preview
            : null,
    } as unknown as HTMLElement;
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) =>
        name === "--tour-preview-width"
          ? "280px"
          : name === "--tour-preview-edge"
            ? "24px"
            : "",
    }));
    try {
      let baseline:
        | { lens: ReturnType<typeof automaticLens>; projection: number[] }
        | undefined;
      for (const rectangle of [
        null,
        { left: 1136, top: 190, width: 280, height: 350 },
        { left: 0, top: 0, width: 0, height: 0 },
        { left: 1136, top: 150, width: 280, height: 440 },
        null,
      ]) {
        preview = rectangle ? { getBoundingClientRect: () => rectangle } : null;
        const inset = automaticTourInsets(shell, 1440, 900, 900);
        expect(inset.right).toBe(320); // 280px card + 24px edge + 16px margin.
        const lens = automaticLens(sample, [artwork], 1440, 900, inset, 78);
        expect(lens.offsetX).toBe(152);
        const camera = new PerspectiveCamera(lens.fov, 1440 / 900, 0.1, 120);
        camera.position.fromArray(sample.position);
        camera.lookAt(new Vector3(...motionLookTarget(sample)));
        camera.setViewOffset(1440, 900, lens.offsetX, lens.offsetY, 1440, 900);
        camera.updateMatrixWorld();
        const projection = new Vector3(...slot.position)
          .project(camera)
          .toArray();
        baseline ??= { lens, projection };
        expect({ lens, projection }).toEqual(baseline);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("uses constant pixel reservations including zero for CSS-hidden compact cards", () => {
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
    const shell = { querySelector: () => null } as unknown as HTMLElement;
    try {
      for (const [width, height, right] of [
        [1440, 900, 320],
        [978, 878, 320],
        [1440, 480, 330],
        [978, 480, 16],
        [390, 844, 16],
        [667, 375, 16],
      ])
        expect(automaticTourInsets(shell, width, height, height).right).toBe(
          right,
        );
      vi.stubGlobal("getComputedStyle", () => ({
        getPropertyValue: () => "0px",
      }));
      expect(automaticTourInsets(shell, 1440, 900, 900).right).toBe(16);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("bounds the walking lens even when a large painting is very close", () => {
    const slot = getSlots()[0];
    const artwork = {
      id: "near-work",
      roomId: "room-1",
      slotId: slot.id,
      imageWidth: 2000,
      imageHeight: 1000,
      widthCm: null,
      heightCm: null,
      displayScale: 1,
    } as Artwork;
    const sample = motionFromPose({
      position: slot.position.map((n, i) => n + slot.wallNormal[i] * 0.5) as [
        number,
        number,
        number,
      ],
      target: slot.position,
      roomId: "room-1",
      offsetPx: 0,
      offsetYPx: 0,
    });
    expect(
      automaticLens(
        sample,
        [artwork],
        1440,
        900,
        { top: 100, bottom: 90, left: 16, right: 16 },
        78,
      ).fov,
    ).toBeLessThanOrEqual(78);
  });
  it("fits actual frame corners for changed ratios, scales and walls", () => {
    let widerAfterResize = 0;
    for (const [width, height] of [
      [1440, 900],
      [978, 878],
      [390, 844],
      [320, 568],
      [667, 375],
    ])
      for (const index of [0, 4, 8, 11])
        for (const ratio of [0.45, 1, 2.2])
          for (const scale of [0.4, 1]) {
            const slot = getSlots()[index];
            const artwork = {
              id: "fixture",
              roomId: "room-1",
              slotId: slot.id,
              imageWidth: ratio * 1000,
              imageHeight: 1000,
              widthCm: null,
              heightCm: null,
              displayScale: scale,
            } as Artwork;
            const sample = motionFromPose({
              position: slot.position.map(
                (n, i) => n + slot.wallNormal[i] * 3,
              ) as [number, number, number],
              target: slot.position,
              roomId: "room-1",
              offsetPx: 0,
              offsetYPx: 0,
              fov: 40,
            });
            const portrait = width <= 700 && height > width;
            const inset = {
              top: 100,
              bottom: portrait ? 340 : 220,
              left: 16,
              right: portrait ? 16 : 320,
            };
            const lens = automaticLens(sample, [artwork], width, height, inset);
            const camera = new PerspectiveCamera(
              lens.fov,
              width / height,
              0.1,
              120,
            );
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
            const size = artworkSize(artwork, slot);
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
            if (scale === 0.4) {
              const bigger = automaticLens(
                sample,
                [{ ...artwork, displayScale: 1 }],
                width,
                height,
                inset,
              );
              expect(bigger.fov).toBeGreaterThanOrEqual(lens.fov);
              if (bigger.fov > lens.fov + 1) widerAfterResize++;
            }
          }
    expect(widerAfterResize).toBeGreaterThan(0);
  });
});
