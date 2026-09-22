import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
vi.mock("@vercel/blob", () => ({get: vi.fn(async () => null)}));
import type { AdminArtwork, PublicData } from "@/lib/data/types";
import { publicArtwork } from "@/lib/validation/artwork";
import { arrivalFingerprint } from "@/lib/museum/arrival";
import {
  arrivalImage,
  arrivalReady,
  arrivalViews,
} from "@/lib/museum/arrivalImage";

it("serves the release capture on Blob only while its public hanging still matches", async () => {
  const seed = JSON.parse(
    await readFile("tests/fixtures/catalog.json", "utf8"),
  );
  const data: PublicData = {
    ...seed,
    mode: "blob",
    artworks: seed.artworks
      .filter((a: AdminArtwork) => a.publication === "published")
      .map(publicArtwork),
  };
  const root = await mkdtemp(path.join(os.tmpdir(), "arrival-release-"));
  const bundled = path.join(root, "bundle");
  try {
    await mkdir(bundled);
    await writeFile(
      path.join(bundled, "manifest.json"),
      JSON.stringify({ fingerprint: arrivalFingerprint(data) }),
    );
    for (const room of data.rooms)
      for (const view of arrivalViews)
        await writeFile(
          path.join(bundled, `${room}-${view}.webp`),
          "current-release",
        );
    await writeFile(path.join(root, "arrival-empty-wide.webp"), "neutral");
    const get = (current: PublicData) =>
      arrivalImage(current, "room-1", "wide", root, root, bundled);
    expect((await get(data)).toString()).toBe("current-release");
    expect(await arrivalReady(data, root, bundled)).toBe(true);
    for (const changed of [
      { ...data, artworks: data.artworks.slice(1) },
      {
        ...data,
        artworks: data.artworks.map((a, i) =>
          i ? a : { ...a, placementOffsetX: 0.2 },
        ),
      },
      {
        ...data,
        artworks: data.artworks.map((a, i) =>
          i ? a : { ...a, image: a.image + "new" },
        ),
      },
      {
        ...data,
        artworks: data.artworks.map((a, i) =>
          i ? a : { ...a, availability: "sold" as const },
        ),
      },
    ]) {
      expect((await get(changed)).toString()).toBe("neutral");
      expect(await arrivalReady(changed, root, bundled)).toBe(false);
    }
    expect(
      (
        await arrivalImage(data, "../room-1", "wide", root, root, bundled)
      ).toString(),
    ).toBe("neutral");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
