import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const session = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      session.cookies.has(key)
        ? { value: session.cookies.get(key) }
        : undefined,
    set: (key: string, value: string) => session.cookies.set(key, value),
    getAll: () => [],
  }),
  headers: async () => new Headers({ host: "127.0.0.1:3000" }),
}));
import { enterDemo } from "@/lib/auth/server";
import { getPublicData } from "@/lib/data/repository";
import { getRoomLayout, saveRoomLayout } from "@/lib/data/room-layouts";
import { readLocal, mutateLocal } from "@/lib/data/local";
import {
  makeRoomLayout,
  layoutIssues,
  type RoomLayoutPlan,
} from "@/lib/admin/room-layout";
import { blankSettings } from "@/lib/validation/artwork";
import type { AdminArtwork } from "@/lib/data/types";
const base = JSON.parse(readFileSync("tests/fixtures/catalog.json", "utf8"))
  .artworks[0] as AdminArtwork;
const artworks: AdminArtwork[] = [
  {
    ...base,
    id: "a",
    slug: "a",
    roomId: "room-1",
    slotId: "room-1-slot-01",
    collection: "A",
    displayScale: 0.6,
    priceMinor: 9876543,
  },
  {
    ...base,
    id: "b",
    slug: "b",
    roomId: "room-1",
    slotId: "room-1-slot-05",
    collection: "A",
    displayScale: 0.6,
  },
  {
    ...base,
    id: "c",
    slug: "c",
    roomId: "room-2",
    slotId: "room-2-slot-01",
    collection: "B",
  },
  {
    ...base,
    id: "unpublished",
    slug: "unpublished",
    publication: "draft",
    roomId: "room-1",
    collection: "A",
  },
];
let folder: string;
const initial = () => makeRoomLayout("room-1", artworks);
const send = (
  plan = initial(),
  action: "draft" | "apply" = "draft",
  expectedDraftVersion: string | null = null,
) => saveRoomLayout({ plan, action, expectedDraftVersion });
beforeEach(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), "museum-room-layout-test-"));
  vi.stubEnv("MUSEUM_DATA_MODE", "demo");
  vi.stubEnv("MUSEUM_LOCAL_DATA_DIR", folder);
  session.cookies.clear();
  await writeFile(
    path.join(folder, "seed.json"),
    JSON.stringify({
      artworks,
      settings: {
        ...blankSettings,
        collectionRooms: { A: "room-1", B: "room-2" },
      },
      rooms: ["room-1", "room-2"],
    }),
  );
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
describe("Private room layout drafts and atomic application", () => {
  it("requires a server admin session for both reads and writes", async () => {
    await expect(getRoomLayout("room-1")).rejects.toMatchObject({
      status: 401,
    });
    await expect(send()).rejects.toMatchObject({ status: 401 });
    await enterDemo();
    expect((await getRoomLayout("room-1")).artworks.map((a) => a.id)).toEqual([
      "a",
      "b",
    ]);
    await expect(getRoomLayout("room-4")).rejects.toMatchObject({
      status: 404,
    });
    await expect(getRoomLayout("../room-1")).rejects.toMatchObject({
      status: 400,
    });
  });
  it("persists an incomplete private draft across sessions without changing public works", async () => {
    await enterDemo();
    const before = await getPublicData();
    const plan = initial();
    plan.items[0].slotId = null;
    const result = await send(plan);
    expect(result.draft?.version).toBeTruthy();
    session.cookies.clear();
    expect(await getPublicData()).toEqual(before);
    expect(JSON.stringify(before)).not.toContain("9876543");
    expect(before).not.toHaveProperty("roomLayoutDrafts");
    await enterDemo();
    expect((await getRoomLayout("room-1")).draft?.plan).toEqual(plan);
    expect((await readLocal()).artworks).toEqual(artworks);
  });
  it("rejects an incomplete application and preserves the entire previous store", async () => {
    await enterDemo();
    const plan = initial();
    plan.items[0].slotId = null;
    const draft = (await send(plan)).draft!;
    const before = await readFile(path.join(folder, "data.json"), "utf8");
    await expect(send(plan, "apply", draft.version)).rejects.toMatchObject({
      status: 409,
    });
    expect(await readFile(path.join(folder, "data.json"), "utf8")).toBe(before);
  });
  it("swaps occupied slots atomically, preserves metadata and other rooms, then removes only that draft", async () => {
    await enterDemo();
    const room2 = (await send(makeRoomLayout("room-2", artworks))).draft!;
    const plan = initial();
    [plan.items[0].slotId, plan.items[1].slotId] = [
      plan.items[1].slotId,
      plan.items[0].slotId,
    ];
    const draft = (await send(plan)).draft!;
    expect(await send(plan, "apply", draft.version)).toMatchObject({
      changed: 2,
    });
    const store = await readLocal();
    expect(store.artworks).toEqual(
      artworks.map((art, i) =>
        i < 2
          ? { ...art, slotId: plan.items[i].slotId, revision: art.revision + 1 }
          : art,
      ),
    );
    expect(store.roomLayoutDrafts?.["room-1"]).toBeUndefined();
    expect(store.roomLayoutDrafts?.["room-2"]).toEqual(room2);
  });
  it("does not increment revisions when applying an unchanged arrangement", async () => {
    await enterDemo();
    expect(await send(initial(), "apply")).toMatchObject({ changed: 0 });
    expect((await readLocal()).artworks).toEqual(artworks);
  });
  it.each(["foreign slot", "foreign work", "missing work", "duplicate work"])(
    "rejects %s without mutating the catalogue",
    async (kind) => {
      await enterDemo();
      const plan = initial();
      if (kind === "foreign slot") plan.items[0].slotId = "room-2-slot-01";
      if (kind === "foreign work") plan.items[0].artworkId = "c";
      if (kind === "missing work") plan.items.pop();
      if (kind === "duplicate work") plan.items[1].artworkId = "a";
      const before = await readLocal();
      await expect(send(plan)).rejects.toMatchObject({ status: 409 });
      expect(await readLocal()).toEqual(before);
    },
  );
  it("saves several works in one zone and rejects only actual overlapping frames", async () => {
    await enterDemo();
    const plan = initial();
    for (const [i, item] of plan.items.entries()) {
      item.slotId = "room-1-slot-02";
      item.displayScale = 0.25;
      item.placementOffsetX = i === 0 ? -0.6 : 0.6;
    }
    expect(layoutIssues(plan, artworks)).toEqual([]);
    const draft = (await send(plan)).draft!;
    await expect(send(plan, "apply", draft.version)).resolves.toMatchObject({
      changed: 2,
    });
    const store = await readLocal();
    expect(
      store.artworks.filter((a) => a.slotId === "room-1-slot-02"),
    ).toHaveLength(2);
    expect(store.artworks.find((a) => a.id === "c")).toEqual(artworks[2]);
    const overlapping = makeRoomLayout("room-1", store.artworks);
    overlapping.items[1].placementOffsetX =
      overlapping.items[0].placementOffsetX;
    const badDraft = (await send(overlapping)).draft!;
    await expect(
      send(overlapping, "apply", badDraft.version),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readLocal()).artworks).toEqual(store.artworks);
  });
  it("rejects schema injections and non-finite positions", async () => {
    await enterDemo();
    const plan = initial();
    (
      plan.items[0] as (typeof plan.items)[0] & { publication: string }
    ).publication = "archived";
    await expect(send(plan)).rejects.toMatchObject({ status: 400 });
    const nonfinite = initial();
    nonfinite.items[0].placementOffsetX = Infinity;
    await expect(send(nonfinite)).rejects.toMatchObject({ status: 400 });
  });
  it("keeps invalid geometry as a draft but rejects the entire application", async () => {
    await enterDemo();
    const plan = initial();
    plan.items[0].placementOffsetX = 4;
    plan.items[1].slotId = "room-1-slot-06";
    expect(layoutIssues(plan, artworks)).toHaveLength(1);
    const draft = (await send(plan)).draft!;
    const before = await readLocal();
    await expect(send(plan, "apply", draft.version)).rejects.toMatchObject({
      status: 409,
    });
    expect(await readLocal()).toEqual(before);
  });
  it.each(["revision", "membership"])(
    "rejects a stale %s instead of overwriting intervening edits",
    async (kind) => {
      await enterDemo();
      await mutateLocal((store) => {
        if (kind === "revision") store.artworks[0].revision++;
        else store.artworks[1].publication = "draft";
      });
      const before = await readLocal();
      await expect(send()).rejects.toMatchObject({ status: 409 });
      expect(await readLocal()).toEqual(before);
    },
  );
  it("accepts only one concurrent draft writer and rejects stale apply/save tokens", async () => {
    await enterDemo();
    const second = initial();
    second.items[0].slotId = null;
    const results = await Promise.allSettled([send(), send(second)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    await expect(send()).rejects.toMatchObject({ status: 409 });
    await expect(send(initial(), "apply")).rejects.toMatchObject({
      status: 409,
    });
    const draft = (await getRoomLayout("room-1")).draft!;
    const next = (await send(second, "draft", draft.version)).draft!;
    expect(next.version).not.toBe(draft.version);
  });
});
