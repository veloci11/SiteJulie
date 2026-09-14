import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it, expect } from "vitest";
import type { AdminArtwork, PublicData } from "@/lib/data/types";
import { publicArtwork } from "@/lib/validation/artwork";
import { arrivalFingerprint } from "@/lib/museum/arrival";
import { arrivalImage } from "@/lib/museum/arrivalImage";
import { normalizeCollectionOrder } from "@/lib/data/collections";

it("serves a private poster only while every pictured work is still publicly in place", async () => {
  const seed = JSON.parse(await readFile(".local/seed.json", "utf8"));
  const data: PublicData = {
    ...seed,
    mode: "demo",
    artworks: seed.artworks.map((a: AdminArtwork) => publicArtwork(a)),
  };
  const dir = await mkdtemp(path.join(os.tmpdir(), "museum-arrival-"));
  try {
    await mkdir(path.join(dir, "arrival"));
    await writeFile(
      path.join(dir, "arrival", "manifest.json"),
      JSON.stringify({ fingerprint: arrivalFingerprint(data) }),
    );
    await writeFile(
      path.join(dir, "arrival", "room-1-wide.webp"),
      "published-hanging",
    );
    await writeFile(
      path.join(dir, "arrival-empty-wide.webp"),
      "empty-architecture",
    );
    const get = (d: PublicData, room = "room-1") =>
      arrivalImage(d, room, "wide", dir, dir).then((b) => b.toString());
    expect(await get(data)).toBe("published-hanging");
    // Capture scripts may read legacy global ranks; the public repository
    // projects local collection ranks. Both describe the same photographed room.
    expect(
      await get({
        ...data,
        artworks: normalizeCollectionOrder(data.artworks, data.rooms),
      }),
    ).toBe("published-hanging");
    expect(await get({ ...data, artworks: data.artworks.slice(1) })).toBe(
      "empty-architecture",
    );
    expect(
      await get({
        ...data,
        artworks: data.artworks.map((a, i) =>
          i === 0 ? { ...a, image: a.image + "-new" } : a,
        ),
      }),
    ).toBe("empty-architecture");
    // A moved, resized or newly sold artwork invalidates the photographed hanging.
    for (const update of [
      { placementOffsetX: 0.12 },
      { placementOffsetY: -0.1 },
      { displayScale: 0.7 },
      { availability: "sold" as const },
    ]) {
      expect(
        await get({
          ...data,
          artworks: data.artworks.map((artwork, index) =>
            index === 0 ? { ...artwork, ...update } : artwork,
          ),
        }),
      ).toBe("empty-architecture");
    }
    expect(await get({ ...data, mode: "supabase" })).toBe("empty-architecture");
    expect(await get(data, "../room-1")).toBe("empty-architecture");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
