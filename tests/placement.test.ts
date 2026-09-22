import { describe, expect, it } from "vitest";
import type { AdminArtwork } from "@/lib/data/types";
import { artworkSize, getSlots, slotForArtwork } from "@/lib/museum/config";
import {
  artworkSchema,
  publicArtwork,
  resolvePlacement,
} from "@/lib/validation/artwork";
import {
  dragPlacementOffsets,
  placementIssue,
  placementLimits,
  safeDisplayScale,
  resizedScaleFromPointer,
  safePlacementOffsets,
} from "@/lib/validation/placement";
const artwork: AdminArtwork = {
  id: "placement-a",
  slug: "placement-a",
  title: "Tableau de test",
  description: "",
  technique: null,
  widthCm: 80,
  heightCm: 120,
  year: null,
  imageWidth: 600,
  imageHeight: 900,
  image: "/api/media/placement-a?variant=room",
  thumbnail: "",
  detailImage: "",
  alt: "Fixture",
  priceMinor: 99999,
  currency: "EUR",
  availability: "available",
  publication: "published",
  priceVisibility: "on_request",
  revision: 1,
  roomId: "room-1",
  slotId: "room-1-slot-01",
  frameStyle: "brass",
  order: 0,
  collection: "Test",
};
describe("wall placement contract", () => {
  it("keeps existing data unchanged and publishes placement without hidden prices", () => {
    const parsed = artworkSchema.parse(artwork);
    expect(parsed).toMatchObject({
      placementOffsetX: 0,
      placementOffsetY: 0,
      displayScale: 1,
    });
    expect(slotForArtwork(parsed)?.position).toEqual(
      slotForArtwork(artwork)?.position,
    );
    const dto = publicArtwork({
      ...artwork,
      placementOffsetX: 0.1,
      placementOffsetY: -0.2,
      displayScale: 0.7,
    });
    expect(dto).toMatchObject({
      placementOffsetX: 0.1,
      placementOffsetY: -0.2,
      displayScale: 0.7,
      priceMinor: null,
    });
    expect(JSON.stringify(dto)).not.toContain("99999");
  });
  it("moves in wall-local right/up axes on opposite walls and keeps room transforms", () => {
    for (const [roomId, slotId, dz] of [
      ["room-1", "room-1-slot-01", -0.2],
      ["room-2", "room-2-slot-05", 0.2],
    ] as const) {
      const source = { ...artwork, roomId, slotId };
      const before = slotForArtwork(source)!;
      const after = slotForArtwork({
        ...source,
        placementOffsetX: 0.2,
        placementOffsetY: 0.15,
      })!;
      expect(after.position[0]).toBeCloseTo(before.position[0]);
      expect(after.position[1] - before.position[1]).toBeCloseTo(0.15);
      expect(after.position[2] - before.position[2]).toBeCloseTo(dz);
      expect(getSlots(roomId).find((s) => s.id === slotId)?.position[1]).toBe(
        2.65,
      );
    }
  });
  it("preserves source ratio and declared dimensions while changing presentation size", () => {
    const source = { ...artwork, displayScale: 0.5 };
    const size = artworkSize(source, getSlots()[0]);
    expect(size.width).toBeCloseTo(1);
    expect(size.height).toBeCloseTo(1.5);
    expect(source.widthCm).toBe(80);
    expect(source.heightCm).toBe(120);
    expect(size.width / size.height).toBeCloseTo(600 / 900);
  });
  it("accepts the safe boundary and rejects a frame outside it before publication", () => {
    const slot = getSlots()[0];
    const bounds = placementLimits(artwork, slot);
    expect(
      resolvePlacement(
        { ...artwork, placementOffsetX: bounds.horizontal },
        [],
        ["room-1"],
      ).slotId,
    ).toBe(slot.id);
    expect(() =>
      resolvePlacement(
        { ...artwork, placementOffsetX: bounds.horizontal + 0.01 },
        [],
        ["room-1"],
      ),
    ).toThrow("cadre");
    expect(() =>
      resolvePlacement(
        { ...artwork, placementOffsetY: bounds.vertical + 0.01 },
        [],
        ["room-1"],
      ),
    ).toThrow("cadre");
  });
  it("checks neighbors including frame thickness and the 4cm gap", () => {
    // A pre-existing/imported neighboring placement must still be detected. Canvas
    // edges are 10cm apart, but their backing frames would collide.
    const neighbor = {
      ...artwork,
      id: "neighbor",
      slug: "neighbor",
      title: "Voisin",
      slotId: "room-1-slot-02",
      placementOffsetX: -3.1,
    };
    expect(placementIssue(artwork, getSlots()[0], [neighbor])).toContain(
      "Voisin",
    );
    expect(
      placementIssue(artwork, getSlots()[0], [
        { ...neighbor, publication: "archived" },
      ]),
    ).toBeNull();
  });
  it("rejects malformed offsets/scales and retains sold artworks as published", () => {
    for (const patch of [
      { displayScale: 0.009 },
      { displayScale: 1.1 },
      { placementOffsetX: Infinity },
      { placementOffsetY: 6 },
    ])
      expect(artworkSchema.safeParse({ ...artwork, ...patch }).success).toBe(
        false,
      );
    const sold = resolvePlacement(
      { ...artwork, availability: "sold" },
      [],
      ["room-1"],
    );
    expect(sold.publication).toBe("published");
    expect(publicArtwork(sold).availability).toBe("sold");
  });
  it("converts pointer movement to centimetres in both directions without changing the slot", () => {
    const slot = getSlots()[0];
    const source = { ...artwork, displayScale: 0.4 };
    const result = dragPlacementOffsets(
      source,
      slot,
      { x: 0.1, y: -0.1 },
      { x: 20, y: -15 },
      { width: 247, height: 317 },
    );
    expect(result).toEqual({ placementOffsetX: 0.3, placementOffsetY: 0.05 });
    expect(
      resolvePlacement(
        { ...artwork, displayScale: 0.4, ...result },
        [],
        ["room-1"],
      ).slotId,
    ).toBe(artwork.slotId);
  });
  it("clamps captured drags outside the preview to whole-centimetre safe bounds", () => {
    const slot = getSlots()[0],
      limits = placementLimits({ ...artwork, displayScale: 0.4 }, slot);
    const source = { ...artwork, displayScale: 0.4 };
    const result = dragPlacementOffsets(
      source,
      slot,
      { x: 0, y: 0 },
      { x: 10000, y: -10000 },
      { width: 247, height: 317 },
    );
    expect(result).toEqual({
      placementOffsetX: Math.floor(limits.horizontal * 100) / 100,
      placementOffsetY: Math.floor(limits.vertical * 100) / 100,
    });
    expect(
      placementIssue({ ...artwork, displayScale: 0.4, ...result }, slot, []),
    ).toBeNull();
    expect(
      dragPlacementOffsets(
        source,
        slot,
        { x: 0.2, y: 0.1 },
        { x: 50, y: 50 },
        { width: 0, height: 0 },
      ),
    ).toEqual({ placementOffsetX: 0.2, placementOffsetY: 0.1 });
  });
});

describe("Independent showroom sizing", () => {
  it("moves within free space and stops a fast downward drag before the lower frame", () => {
    const upper = { ...artwork, slotId: "room-1-slot-02", displayScale: 0.4 };
    const lower = { ...artwork, id: "lower", slotId: "room-1-slot-13", displayScale: 0.6 };
    const slot = getSlots()[1];
    expect(safePlacementOffsets(upper, slot, { placementOffsetX: 0.3, placementOffsetY: 0 }, [lower])).toEqual({ placementOffsetX: 0.3, placementOffsetY: 0 });
    const stopped = safePlacementOffsets(upper, slot, { placementOffsetX: 0, placementOffsetY: -0.8 }, [lower]);
    expect(stopped.placementOffsetY).toBeGreaterThanOrEqual(-0.06);
    expect(stopped.placementOffsetY).toBeLessThanOrEqual(-0.04);
    expect(placementIssue({ ...upper, ...stopped }, slot, [lower])).toBeNull();
  });
  it("keeps visual size identical when only description dimensions change", () => {
    const slot = getSlots()[0];
    const old = { ...artwork, displayScale: 0.7 };
    expect(
      artworkSize({ ...old, widthCm: 5000, heightCm: 8000 }, slot),
    ).toEqual(artworkSize(old, slot));
    expect(() =>
      resolvePlacement(
        { ...old, widthCm: 5000, heightCm: 8000 },
        [],
        ["room-1"],
      ),
    ).not.toThrow();
  });
  it("stops resizing at the slot edge without moving the artwork's centre", () => {
    const slot = getSlots()[0],
      a = {
        ...artwork,
        displayScale: 0.4,
        placementOffsetX: 0.45,
        placementOffsetY: 0.3,
      };
    const scale = safeDisplayScale(a, slot, 4, []);
    expect(scale).toBeCloseTo(0.7);
    expect(placementIssue({ ...a, displayScale: scale }, slot, [])).toBeNull();
    expect(
      placementIssue({ ...a, displayScale: scale + 0.01 }, slot, []),
    ).not.toBeNull();
    expect(safeDisplayScale(a, slot, -5, [])).toBe(0.01);
  });
  it("blocks expansion before a lower companion frame and preserves the 4cm gap", () => {
    const upper = { ...artwork, slotId: "room-1-slot-02", displayScale: 0.4 };
    const neighbor = {
      ...artwork,
      id: "lower",
      slotId: "room-1-slot-13",
      displayScale: 0.6,
    };
    const actual = getSlots().find((s) => s.id === upper.slotId)!;
    const scale = safeDisplayScale(upper, actual, 1, [neighbor]);
    expect(scale).toBeCloseTo(0.44);
    expect(
      placementIssue({ ...upper, displayScale: scale }, actual, [neighbor]),
    ).toBeNull();
    expect(
      placementIssue({ ...upper, displayScale: scale + 0.01 }, actual, [
        neighbor,
      ]),
    ).toContain("chevauche");
    expect(
      resizedScaleFromPointer(
        0.4,
        { width: 2, height: 3 },
        { x: 10, y: 15 },
        100,
      ),
    ).toBeCloseTo(0.5);
    expect(
      resizedScaleFromPointer(
        0.4,
        { width: 2, height: 3 },
        { x: 10, y: 15 },
        0,
      ),
    ).toBe(0.4);
  });
});
