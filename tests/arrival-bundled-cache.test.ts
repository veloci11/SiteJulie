import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { arrivalFingerprint } from "@/lib/museum/arrival";
import { arrivalReady, arrivalImage } from "@/lib/museum/arrivalImage";
import type { PublicData, AdminArtwork } from "@/lib/data/types";
import { publicArtwork } from "@/lib/validation/artwork";
import seed from "./fixtures/catalog.json";

const { get } = vi.hoisted(() => ({ get: vi.fn(async () => null) }));
vi.mock("@vercel/blob", () => ({ get, head: vi.fn(), put: vi.fn() }));

it("uses matching release captures without Blob reads and rejects them after a public change", async () => {
  const data = {
    ...seed,
    mode: "blob",
    artworks: (seed.artworks as AdminArtwork[]).map(publicArtwork),
  } as PublicData;
  const root = await mkdtemp(path.join(os.tmpdir(), "arrival-release-"));
  try {
    await writeFile(
      path.join(root, "manifest.json"),
      JSON.stringify({ fingerprint: arrivalFingerprint(data) }),
    );
    for (const room of data.rooms)
      for (const view of ["wide", "portrait"])
        await writeFile(
          path.join(root, `${room}-${view}.webp`),
          `${room}-${view}`,
        );
    expect(await arrivalReady(data, root, root)).toBe(true);
    expect(
      (await arrivalImage(data, "room-1", "wide", root, root, root)).toString(),
    ).toBe("room-1-wide");
    expect(get).not.toHaveBeenCalled();
    expect(
      await arrivalReady(
        { ...data, artworks: data.artworks.slice(1) },
        root,
        root,
      ),
    ).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
