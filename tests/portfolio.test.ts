import { describe, expect, it } from "vitest";
import source from "../content/portfolio.json";
import {
  artworkSchema,
  settingsSchema,
  resolvePlacement,
} from "../lib/validation/artwork";
import { groupCollections } from "../lib/data/collections";
import { priceLabel } from "../lib/public";

const artworks = source.artworks.map((a) =>
  artworkSchema.parse({
    ...a,
    image: `/api/media/${a.id}?variant=room`,
    thumbnail: `/api/media/${a.id}?variant=thumb`,
    detailImage: `/api/media/${a.id}?variant=detail`,
  }),
);

describe("reviewed Julie portfolio", () => {
  it("imports every source image once and preserves the eight existing URLs", () => {
    expect(artworks).toHaveLength(26);
    expect(new Set(source.artworks.map((a) => a.source.blockId)).size).toBe(26);
    expect(new Set(artworks.map((a) => a.slug)).size).toBe(26);
    for (let i = 1; i <= 8; i++) {
      const id = `oeuvre-${String(i).padStart(2, "0")}`;
      expect(artworks.find((a) => a.id === id)?.slug).toBe(id);
    }
  });
  it("fits two complete collections per room without collisions or wall overflow", () => {
    expect(
      groupCollections(artworks, source.rooms).map((g) => [
        g.name,
        g.artworks.length,
      ]),
    ).toEqual([
      ["Rêves surréalistes", 5],
      ["Variations", 9],
      ["Métamorphoses", 2],
      ["Paysages oniriques", 10],
    ]);
    expect(
      source.rooms.map(
        (room) => artworks.filter((a) => a.roomId === room).length,
      ),
    ).toEqual([14, 12]);
    for (const a of artworks)
      expect(resolvePlacement(a, artworks, source.rooms).slotId).toBe(a.slotId);
  });
  it("preserves private-collection captions without inventing sales, prices or physical dimensions", () => {
    const privateWorks = artworks.filter(
      (a) => a.availability === "private_collection",
    );
    expect(privateWorks.map((a) => a.id)).toEqual([
      "paysages-01",
      "paysages-04",
      "paysages-05",
    ]);
    for (const a of privateWorks)
      expect(priceLabel(a)).toBe("Collection privée");
    for (const a of artworks) {
      expect([a.priceMinor, a.widthCm, a.heightCm, a.year]).toEqual([
        null,
        null,
        null,
        null,
      ]);
      expect(a.priceVisibility).toBe("on_request");
    }
    expect(
      artworks.filter((a) => /hors série/i.test(a.description)),
    ).toHaveLength(2);
  });
  it("keeps verified contact details, courses and collection descriptions editable", () => {
    const settings = settingsSchema.parse(source.settings);
    expect(settings.email).toBe("thiam.julie@proton.me");
    expect(settings.instagramUrl).toBe(
      "https://www.instagram.com/julie_thiam/",
    );
    expect(settings.coursesText).toContain("Cornaux");
    expect(Object.keys(settings.collectionDescriptions!)).toHaveLength(4);
  });
});
