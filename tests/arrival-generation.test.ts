import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  readdir,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { AdminArtwork, PublicData } from "@/lib/data/types";
import { publicArtwork } from "@/lib/validation/artwork";
import { arrivalFingerprint } from "@/lib/museum/arrival";
import {
  arrivalImage,
  arrivalReady,
  arrivalRooms,
  arrivalViews,
} from "@/lib/museum/arrivalImage";
import {
  ArrivalGenerationQueue,
  arrivalCaptureOrigin,
} from "@/lib/museum/arrivalGeneration";
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
async function fixture() {
  const seed = JSON.parse(await readFile(".local/seed.json", "utf8"));
  const data: PublicData = {
    ...seed,
    mode: "demo",
    artworks: seed.artworks
      .filter((a: AdminArtwork) => a.publication === "published")
      .map(publicArtwork),
  };
  const local = await mkdtemp(path.join(os.tmpdir(), "museum-arrival-auto-"));
  folders.push(local);
  for (const view of arrivalViews)
    await writeFile(path.join(local, `arrival-empty-${view}.webp`), "empty");
  return { data, local, origin: "http://127.0.0.1:3003" };
}
function images(data: PublicData) {
  return new Map(
    arrivalRooms(data).flatMap((room) =>
      arrivalViews.map(
        (view) =>
          [
            `${room}-${view}.webp`,
            Buffer.from(arrivalFingerprint(data)),
          ] as const,
      ),
    ),
  );
}
function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}
it("generates one atomic complete private batch for repeated concurrent requests", async () => {
  const job = await fixture(),
    pause = gate(),
    entered = gate();
  const capture = vi.fn(async () => {
    entered.release();
    await pause.wait;
    return images(job.data);
  });
  const queue = new ArrivalGenerationQueue({
    readData: async () => job.data,
    capture,
  });
  queue.enqueue(job);
  const done = queue.drain();
  await entered.wait;
  for (let i = 0; i < 10; i++) {
    queue.enqueue(job);
    expect(queue.drain()).toBe(done);
  }
  expect(await arrivalReady(job.data, job.local)).toBe(false);
  expect(
    (
      await arrivalImage(job.data, "room-1", "wide", job.local, job.local)
    ).toString(),
  ).toBe("empty");
  pause.release();
  await done;
  expect(capture).toHaveBeenCalledTimes(1);
  expect(await arrivalReady(job.data, job.local)).toBe(true);
  const dir = path.join(
    job.local,
    "arrival/generated",
    arrivalFingerprint(job.data),
  );
  expect((await readdir(dir)).length).toBe(job.data.rooms.length * 2 + 1);
  expect(
    (
      await arrivalImage(job.data, "room-1", "wide", job.local, job.local)
    ).toString(),
  ).toBe(arrivalFingerprint(job.data));
});
it("drops a capture changed during rendering and coalesces to the latest hanging", async () => {
  const job = await fixture(),
    pause = gate(),
    entered = gate();
  let current = job.data;
  const seen: string[] = [];
  const queue = new ArrivalGenerationQueue({
    readData: async () => current,
    capture: async (data) => {
      seen.push(arrivalFingerprint(data));
      if (seen.length === 1) {
        entered.release();
        await pause.wait;
      }
      return images(data);
    },
  });
  queue.enqueue(job);
  const done = queue.drain();
  await entered.wait;
  current = { ...job.data, artworks: job.data.artworks.slice(1) };
  queue.enqueue({ ...job, data: current });
  current = {
    ...current,
    artworks: current.artworks.map((a) => ({ ...a, availability: "sold" })),
  };
  queue.enqueue({ ...job, data: current });
  pause.release();
  await done;
  expect(seen).toEqual([
    arrivalFingerprint(job.data),
    arrivalFingerprint(current),
  ]);
  expect(await arrivalReady(job.data, job.local)).toBe(false);
  expect(await arrivalReady(current, job.local)).toBe(true);
  expect(await readdir(path.join(job.local, "arrival/generated"))).toEqual([
    arrivalFingerprint(current),
  ]);
});
it("never exposes a partial batch, cleans temporary files, and retries a failed capture after cooldown", async () => {
  const job = await fixture();
  let clock = 0,
    complete = false;
  const capture = vi.fn(async () =>
    complete
      ? images(job.data)
      : new Map([["room-1-wide.webp", Buffer.from("partial")]]),
  );
  const queue = new ArrivalGenerationQueue({
    readData: async () => job.data,
    capture,
    now: () => clock,
  });
  queue.enqueue(job);
  await queue.drain();
  expect(await arrivalReady(job.data, job.local)).toBe(false);
  expect(queue.failed(arrivalFingerprint(job.data))).toBe(true);
  expect(await readdir(path.join(job.local, "arrival/generated"))).toEqual([]);
  queue.enqueue(job);
  await queue.drain();
  expect(capture).toHaveBeenCalledTimes(1);
  clock = 60_001;
  complete = true;
  queue.enqueue(job);
  await queue.drain();
  expect(capture).toHaveBeenCalledTimes(2);
  expect(await arrivalReady(job.data, job.local)).toBe(true);
});
it("invalidates automatic images after removal, replacement, movement and sale even when requested with an old URL revision", async () => {
  const job = await fixture();
  const queue = new ArrivalGenerationQueue({
    readData: async () => job.data,
    capture: async (data) => images(data),
  });
  queue.enqueue(job);
  await queue.drain();
  for (const update of [
    { image: "/api/media/new?v=changed" },
    { placementOffsetX: 0.3 },
    { displayScale: 0.6 },
    { availability: "sold" as const },
  ]) {
    const changed = {
      ...job.data,
      artworks: job.data.artworks.map((a, i) => (i ? a : { ...a, ...update })),
    };
    expect(
      (
        await arrivalImage(changed, "room-1", "wide", job.local, job.local)
      ).toString(),
    ).toBe("empty");
  }
  const removed = { ...job.data, artworks: [] };
  expect(
    (
      await arrivalImage(removed, "room-1", "wide", job.local, job.local)
    ).toString(),
  ).toBe("empty");
  expect(
    (
      await arrivalImage(job.data, "../../secret", "wide", job.local, job.local)
    ).toString(),
  ).toBe("empty");
});
it("does not treat a corrupt legacy manifest or an absent view as a ready batch", async () => {
  const job = await fixture();
  await mkdir(path.join(job.local, "arrival"));
  await writeFile(path.join(job.local, "arrival/manifest.json"), "{");
  expect(await arrivalReady(job.data, job.local)).toBe(false);
  expect(
    (
      await arrivalImage(job.data, "room-1", "wide", job.local, job.local)
    ).toString(),
  ).toBe("empty");
});
it("uses only an explicitly enabled loopback target, never a configurable remote origin", () => {
  const env = {
    MUSEUM_DATA_MODE: "demo",
    MUSEUM_LOCAL_PREVIEW: "1",
    PORT: "3003",
    NEXT_PUBLIC_SITE_URL: "https://external.test",
    HOST: "evil.test",
  };
  expect(arrivalCaptureOrigin(env)).toBe("http://127.0.0.1:3003");
  for (const override of [
    { MUSEUM_DATA_MODE: "supabase" },
    { MUSEUM_LOCAL_PREVIEW: "0" },
    { MUSEUM_ARRIVAL_GENERATION: "0" },
    { PORT: "3003/../../" },
    { PORT: "65536" },
  ])
    expect(arrivalCaptureOrigin({ ...env, ...override })).toBeNull();
});
