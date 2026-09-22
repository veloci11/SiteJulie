import { describe, expect, it } from "vitest";
import fixture from "./fixtures/catalog.json";
import type { AdminArtwork } from "@/lib/data/types";
import { artworkSize, getSlots, slotForArtwork } from "@/lib/museum/config";
import { getZones, normalizeZoneArtwork } from "@/lib/museum/zones";
import {
  findZonePlacement,
  placementIssue,
  placementLimits,
} from "@/lib/validation/placement";
import { normalizeRoomLayout, makeRoomLayout } from "@/lib/admin/room-layout";
import { visibleCartels } from "@/lib/museum/cartels";
const base = {
  ...fixture.artworks[0],
  roomId: "room-1",
  slotId: "room-1-slot-02",
  imageWidth: 600,
  imageHeight: 900,
  widthCm: 70,
  heightCm: 110,
  placementOffsetX: 0,
  placementOffsetY: 0,
  displayScale: 0.4,
  publication: "published",
} as AdminArtwork;

describe("Several independently sized works in one hanging zone", () => {
  it("hides a title plate when dense hanging would put it behind a neighbour, without changing any work", () => {
    const upper = {
      ...base,
      id: "upper",
      displayScale: 0.2,
      placementOffsetY: 0.5,
    };
    const lower = {
      ...base,
      id: "lower",
      displayScale: 0.2,
      placementOffsetY: -0.32,
    };
    const source = [upper, lower];
    const before = JSON.stringify(source);
    expect(visibleCartels([upper]).has(upper.id)).toBe(true);
    const visible = visibleCartels(source);
    expect(visible.has(upper.id)).toBe(false);
    expect(visible.has(lower.id)).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
    expect(
      visibleCartels([
        upper,
        { ...lower, roomId: "room-2", slotId: "room-2-slot-02" },
      ]).has(upper.id),
    ).toBe(true);
  });
  it("merges legacy lower anchors without moving or resizing the existing image", () => {
    for (const i of [12, 13]) {
      const old = {
        ...base,
        slotId: getSlots()[i].id,
        displayScale: 0.15,
        placementOffsetX: 0.1,
        placementOffsetY: -0.1,
      };
      const normalized = normalizeZoneArtwork(old);
      expect(getZones("room-1")).toHaveLength(12);
      expect(artworkSize(normalized, slotForArtwork(normalized)!)).toEqual(
        artworkSize(old, slotForArtwork(old)!),
      );
      expect(slotForArtwork(normalized)!.position).toEqual(
        slotForArtwork(old)!.position,
      );
      expect(normalizeZoneArtwork(normalized)).toEqual(normalized);
      expect(
        placementLimits(normalized, getSlots()[i === 12 ? 1 : 5]).maxY,
      ).toBeGreaterThan(0.5);
      const plan = makeRoomLayout("room-1", [old]);
      expect(normalizeRoomLayout(plan, [old])).toEqual(plan);
    }
  });
  it("fits only the new painting at the largest available size and never changes residents", () => {
    const slot = getZones("room-1")[1];
    const residents: AdminArtwork[] = [
      { ...base, id: "upper", placementOffsetY: 0.65 },
      { ...base, id: "lower", placementOffsetY: -1.2, displayScale: 0.2 },
    ];
    const before = JSON.stringify(residents);
    const incoming = { ...base, id: "new", displayScale: 1 };
    const fit = findZonePlacement(incoming, slot, residents, true)!;
    expect(fit).not.toBeNull();
    expect(fit.displayScale).toBeLessThan(1);
    expect(artworkSize(fit, slot).width).toBeGreaterThanOrEqual(0.25 - 1e-8);
    expect(placementIssue(fit, slot, residents)).toBeNull();
    expect(JSON.stringify(residents)).toBe(before);
    expect([fit.widthCm, fit.heightCm]).toEqual([70, 110]);
    expect(
      findZonePlacement(
        { ...incoming, displayScale: fit.displayScale! + 0.01 },
        slot,
        residents,
        false,
      ),
    ).toBeNull();
  });
  it("keeps adding different ratios until no readable rectangle fits, then leaves the zone unchanged", () => {
    const slot = getZones("room-1")[1];
    const residents: AdminArtwork[] = [];
    for (let i = 0; i < 50; i++) {
      const before = JSON.stringify(residents);
      const incoming = {
        ...base,
        id: `piece-${i}`,
        imageWidth: i % 2 ? 1200 : 600,
        displayScale: 0.4,
      };
      const fit = findZonePlacement(incoming, slot, residents, true);
      expect(JSON.stringify(residents)).toBe(before);
      if (!fit) break;
      const size = artworkSize(fit, slot);
      expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(
        0.25 - 1e-8,
      );
      expect(placementIssue(fit, slot, residents)).toBeNull();
      residents.push(fit);
    }
    expect(residents.length).toBeGreaterThan(3);
    expect(residents.length).toBeLessThan(50);
    expect(
      findZonePlacement(
        { ...base, id: "overflow", displayScale: 1 },
        slot,
        residents,
        true,
      ),
    ).toBeNull();
  });
});
