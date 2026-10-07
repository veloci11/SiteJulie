import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { AdminArtwork } from "@/lib/data/types";
import { artworkSize, FRAME_OUTSET, getSlots } from "@/lib/museum/config";
import { getZones, normalizeZoneArtwork } from "@/lib/museum/zones";
import { roomAcceptsArtwork, roomCapacity } from "@/lib/admin/room-capacity";
import { resolvePlacement } from "@/lib/validation/artwork";

const base = JSON.parse(readFileSync("tests/fixtures/catalog.json", "utf8"))
  .artworks[0] as AdminArtwork;
const rooms = ["room-1"];
const candidate: AdminArtwork = {
  ...base,
  id: "new-work",
  slug: "new-work",
  collection: "Audit",
  roomId: "room-1",
  slotId: "",
  displayScale: 0.18,
  placementOffsetX: 0,
  placementOffsetY: 0,
};
const populatedZones = () =>
  getZones("room-1", rooms).map((zone, index) => ({
    ...candidate,
    id: `occupied-${index}`,
    slug: `occupied-${index}`,
    slotId: zone.id,
    placementOffsetX: -0.4,
    order: index,
  }));

describe("Admin capacity follows actual hanging geometry", () => {
  it("accepts another work when every zone already contains a small frame", () => {
    const artworks = populatedZones();
    const capacity = roomCapacity("room-1", artworks, rooms);
    expect(capacity.occupiedZones).toBe(capacity.total);
    expect(capacity.freeSurfaceM2).toBeGreaterThan(0);
    expect(roomAcceptsArtwork(candidate, artworks, rooms)).toBe(true);
    expect(resolvePlacement(candidate, artworks, rooms).slotId).toBe(
      "room-1-slot-01",
    );
  });

  it("refuses only a format that cannot fit between the existing frames", () => {
    const full = populatedZones().map((a, index) => ({
      ...a,
      imageWidth: Math.round(getZones("room-1", rooms)[index].maxWidthM * 1000),
      imageHeight: 3000,
      displayScale: 1,
      placementOffsetX: 0,
    }));
    expect(roomAcceptsArtwork(candidate, full, rooms)).toBe(false);
    expect(() => resolvePlacement(candidate, full, rooms)).toThrow();
  });

  it("does not invent a capacity verdict before the image format is known", () => {
    expect(
      roomAcceptsArtwork(
        { ...candidate, image: "", imageWidth: 0, imageHeight: 0 },
        populatedZones(),
        rooms,
      ),
    ).toBeNull();
  });

  it("measures displayed frames, ignores drafts, and preserves legacy lower anchors", () => {
    const legacy = {
      ...candidate,
      slotId: "room-1-slot-13",
      displayScale: 0.4,
    };
    const normalized = normalizeZoneArtwork(legacy);
    const empty = roomCapacity("room-1", [], rooms);
    const oldCapacity = roomCapacity("room-1", [legacy], rooms);
    const currentCapacity = roomCapacity("room-1", [normalized], rooms);
    expect(oldCapacity).toEqual(currentCapacity);
    expect(oldCapacity.occupiedZones).toBe(1);
    const zone = getSlots("room-1").find(
      (slot) => slot.id === normalized.slotId,
    )!;
    const size = artworkSize(normalized, zone);
    expect(empty.freeSurfaceM2 - oldCapacity.freeSurfaceM2).toBeCloseTo(
      (size.width + FRAME_OUTSET) * (size.height + FRAME_OUTSET),
      8,
    );
    expect(
      roomCapacity("room-1", [{ ...legacy, publication: "draft" }], rooms),
    ).toEqual(empty);
  });

  it("removes the terminal wall surface when another room opens its passage", () => {
    const terminal = roomCapacity("room-2", [], ["room-1", "room-2"]);
    const connected = roomCapacity(
      "room-2",
      [],
      ["room-1", "room-2", "room-3"],
    );
    expect(terminal.total - connected.total).toBe(1);
    expect(terminal.freeSurfaceM2).toBeGreaterThan(connected.freeSurfaceM2);
  });
});
