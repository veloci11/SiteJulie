import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { AdminArtwork, PublicData } from "@/lib/data/types";
import { getSlots } from "@/lib/museum/config";
import {
  destinationPose,
  safeRoute,
  obstaclesForRooms,
  segmentIsClear,
} from "@/lib/museum/navigation";
import { publicArtwork } from "@/lib/validation/artwork";

const seed = JSON.parse(readFileSync("tests/fixtures/catalog.json", "utf8"));
describe("Rooms activated from the admin", () => {
  it("connects every activated room to all other rooms through safe routes", () => {
    const rooms = ["room-1", "room-2", "room-3", "room-4"];
    const artworks = rooms.map((roomId, index) =>
      publicArtwork({
        ...seed.artworks[0],
        id: `extension-${index}`,
        roomId,
        slotId: getSlots(roomId)[0].id,
        placementOffsetX: 0,
        placementOffsetY: 0,
      } as AdminArtwork),
    );
    const data: PublicData = {
      mode: "demo",
      rooms,
      artworks,
      settings: seed.settings,
    };
    const obstacles = obstaclesForRooms(rooms);
    for (const a of artworks)
      for (const b of artworks) {
        const from = destinationPose(
          { kind: "artwork", artworkId: a.id },
          data,
          1440,
          900,
        ).position;
        const to = destinationPose(
          { kind: "artwork", artworkId: b.id },
          data,
          1440,
          900,
        ).position;
        const route = safeRoute(from, to, rooms);
        expect(route.at(-1)).toEqual(to);
        for (let i = 1; i < route.length; i++)
          expect(segmentIsClear(route[i - 1], route[i], obstacles)).toBe(true);
      }
  });
});
