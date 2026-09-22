import { describe, expect, it } from "vitest";
import { getSlots } from "@/lib/museum/config";
import { getZones } from "@/lib/museum/zones";
import {
  planPoint,
  roomPassages,
  slotCode,
  WALL_GUIDES,
} from "@/lib/admin/placement-guide";
import { wallKey } from "@/lib/validation/placement";

describe("Fixed orientation in the wall editor", () => {
  it("gives every zone one readable reference; lower legacy anchors belong to A2/B2", () => {
    for (const room of ["room-1", "room-2", "room-3", "room-4"]) {
      const slots = getZones(room);
      const codes = slots.map(slotCode);
      expect(new Set(codes).size).toBe(slots.length);
      for (const slot of slots)
        expect(slotCode(slot)).toMatch(
          new RegExp(
            `^${WALL_GUIDES.find((wall) => wall.id === wallKey(slot))!.code}`,
          ),
        );
    }
    expect(slotCode(getSlots()[12])).toBe("A2");
    expect(slotCode(getSlots()[1])).toBe("A2");
    expect(slotCode(getSlots()[5])).toBe("B2");
    expect(slotCode(getSlots("room-2")[1])).toBe("A2");
    expect(slotCode(getSlots()[13])).toBe("B2");
    expect(slotCode(getSlots("room-1")[9])).toBe("C2");
    expect(slotCode(getSlots("room-2")[9])).toBe("D1");
  });
  it("keeps left/right and front/back in the same plan coordinates in every room", () => {
    for (const room of ["room-1", "room-2", "room-3", "room-4"]) {
      const slots = getSlots(room);
      expect(planPoint(slots[0]).x).toBeLessThan(35);
      expect(planPoint(slots[4]).x).toBeGreaterThan(205);
      expect(planPoint(slots[8]).y).toBeLessThan(35);
      expect(planPoint(slots[11]).y).toBeGreaterThan(235);
      expect(planPoint(slots[0])).toEqual(planPoint(getSlots()[0]));
    }
  });
  it("marks real connecting doorways and the closed terminal wall instead of inventing an entrance", () => {
    const rooms = ["room-1", "room-2", "room-3"];
    expect(roomPassages("room-1", rooms)).toEqual({
      back: null,
      front: "room-2",
    });
    expect(roomPassages("room-2", rooms)).toEqual({
      back: "room-1",
      front: "room-3",
    });
    expect(roomPassages("room-3", rooms)).toEqual({
      back: "room-2",
      front: null,
    });
  });
});
