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
    expect(size.width).toBeCloseTo(0.4);
    expect(size.height).toBeCloseTo(0.6);
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
      { displayScale: 0.34 },
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
    const result = dragPlacementOffsets(
      artwork,
      slot,
      { x: 0.1, y: -0.1 },
      { x: 20, y: -15 },
      { width: 247, height: 317 },
    );
    expect(result).toEqual({ placementOffsetX: 0.3, placementOffsetY: 0.05 });
    expect(
      resolvePlacement({ ...artwork, ...result }, [], ["room-1"]).slotId,
    ).toBe(artwork.slotId);
  });
  it("clamps captured drags outside the preview to whole-centimetre safe bounds", () => {
    const slot = getSlots()[0],
      limits = placementLimits(artwork, slot);
    const result = dragPlacementOffsets(
      artwork,
      slot,
      { x: 0, y: 0 },
      { x: 10000, y: -10000 },
      { width: 247, height: 317 },
    );
    expect(result).toEqual({
      placementOffsetX: Math.floor(limits.horizontal * 100) / 100,
      placementOffsetY: Math.floor(limits.vertical * 100) / 100,
    });
    expect(placementIssue({ ...artwork, ...result }, slot, [])).toBeNull();
    expect(
      dragPlacementOffsets(
        artwork,
        slot,
        { x: 0.2, y: 0.1 },
        { x: 50, y: 50 },
        { width: 0, height: 0 },
      ),
    ).toEqual({ placementOffsetX: 0.2, placementOffsetY: 0.1 });
  });
});
