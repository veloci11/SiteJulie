import { describe, it, expect } from "vitest";
import {
  contactHref,
  parseDestination,
  destinationUrl,
  classicUrl,
  priceLabel,
} from "../lib/public";
import seed from "./fixtures/catalog.json";
import type { Artwork, SiteSettings } from "../lib/data/types";
const artworks = seed.artworks as Artwork[];
const settings = seed.settings as SiteSettings;
describe("public navigation and contact", () => {
  it("round trips accented URLs and rejects unpublished unknown contexts", () => {
    const d = { kind: "artwork", artworkId: artworks[0].id } as const;
    expect(
      parseDestination(destinationUrl(d, artworks).split("?")[1], artworks, [
        "room-1",
      ]),
    ).toEqual(d);
    expect(
      parseDestination("?vue=contact&oeuvre=secret", artworks, ["room-1"]),
    ).toEqual({ kind: "contact" });
    expect(classicUrl(d, artworks)).toBe("/oeuvres/oeuvre-01");
  });
  it("returns an obsolete terrace deep link to the home view", () => {
    expect(
      parseDestination("?vue=terrasse", artworks, ["room-1", "room-2"]),
    ).toEqual({ kind: "home" });
  });
  it("encodes real mailto subject, accented title, reference and link but never sends", () => {
    const a = { ...artworks[0], title: "Été & rêves ?" };
    const href = contactHref(
      { ...settings, email: "atelier@example.test" },
      a,
      "https://example.test",
    )!;
    const p = new URLSearchParams(href.split("?")[1]);
    expect(p.get("subject")).toContain("Été & rêves ?");
    expect(p.get("body")).toContain("https://example.test/oeuvres/oeuvre-01");
    expect(p.get("body")).toContain(a.id);
    expect(contactHref(settings, a)).toBeNull();
  });
  it("unknown price is on request and zero remains a supplied zero", () => {
    expect(priceLabel({ ...artworks[0], priceMinor: null })).toBe(
      "Prix sur demande",
    );
    expect(priceLabel({ ...artworks[0], priceMinor: 0 })).toContain("0");
  });
});
