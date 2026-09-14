import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AdminArtwork, SiteSettings } from "@/lib/data/types";
import { publicArtwork } from "@/lib/validation/artwork";
import { classicUrl, destinationUrl, parseDestination } from "@/lib/public";

const seed = JSON.parse(readFileSync("tests/fixtures/catalog.json", "utf8")) as {
  artworks: AdminArtwork[];
  settings: SiteSettings;
  rooms: string[];
};
const publicArtworks = seed.artworks.map(publicArtwork);

describe("Two-room demonstration contract", () => {
  it("hangs four works in each room at the specified stable anchors", () => {
    expect(seed.rooms).toEqual(["room-1", "room-2"]);
    expect(
      seed.artworks
        .filter((a) => a.roomId === "room-1")
        .map((a) => a.id)
        .sort(),
    ).toEqual(["oeuvre-03", "oeuvre-06", "oeuvre-07", "oeuvre-08"]);
    expect(
      seed.artworks
        .filter((a) => a.roomId === "room-2")
        .map((a) => a.id)
        .sort(),
    ).toEqual(["oeuvre-01", "oeuvre-02", "oeuvre-04", "oeuvre-05"]);
    for (const room of seed.rooms) {
      const artworks = seed.artworks.filter(
        (artwork) => artwork.roomId === room,
      );
      expect(artworks).toHaveLength(4);
      expect(new Set(artworks.map((a) => a.collection)).size).toBe(1);
      expect(new Set(artworks.map((artwork) => artwork.slotId)).size).toBe(4);
    }
  });

  it("resolves existing artwork links to the same artwork across both rooms", () => {
    for (const artwork of publicArtworks) {
      const destination = { kind: "artwork" as const, artworkId: artwork.id };
      const museumUrl = destinationUrl(destination, publicArtworks);
      expect(museumUrl).toBe(`/?vue=oeuvre&slug=${artwork.slug}`);
      expect(
        parseDestination(museumUrl.slice(1), publicArtworks, seed.rooms),
      ).toEqual(destination);
      expect(classicUrl(destination, publicArtworks)).toBe(
        `/oeuvres/${artwork.slug}`,
      );
      // Moving the physical hanging must never invalidate a shared permalink.
      const moved = publicArtworks.map((entry) =>
        entry.id === artwork.id
          ? { ...entry, roomId: "room-3", slotId: "room-3-slot-02" }
          : entry,
      );
      expect(destinationUrl(destination, moved)).toBe(museumUrl);
      expect(classicUrl(destination, moved)).toBe(`/oeuvres/${artwork.slug}`);
    }
  });

  it("round-trips each activated room link and rejects an inactive room", () => {
    for (const roomId of seed.rooms) {
      const destination = { kind: "room" as const, roomId };
      expect(
        parseDestination(
          destinationUrl(destination, publicArtworks).slice(1),
          publicArtworks,
          seed.rooms,
        ),
      ).toEqual(destination);
    }
    expect(
      parseDestination("?vue=salle&salle=room-3", publicArtworks, seed.rooms),
    ).toEqual({ kind: "home" });
  });

  it("keeps private values out of public data after moving a work to the salon", () => {
    const salonArtwork = seed.artworks.find(
      (artwork) => artwork.id === "oeuvre-05",
    )!;
    const visible = publicArtwork({
      ...salonArtwork,
      priceMinor: 761234,
      priceVisibility: "on_request",
    });
    expect(visible.roomId).toBe("room-2");
    expect(visible.priceMinor).toBeNull();
    expect(JSON.stringify(visible)).not.toContain("761234");
    expect(visible).not.toHaveProperty("priceVisibility");
    expect(visible.image).toMatch(/^\/api\/media\/oeuvre-05\?variant=room/);
    expect(visible.detailImage).toMatch(
      /^\/api\/media\/oeuvre-05\?variant=detail/,
    );
  });
});
