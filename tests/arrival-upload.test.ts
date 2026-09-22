import { beforeEach, afterEach, it, expect, vi } from "vitest";
import sharp from "sharp";
import fixture from "./fixtures/catalog.json";
import type { PublicData } from "@/lib/data/types";
import { publicArtwork } from "@/lib/validation/artwork";
const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  blobs: new Map<string, Buffer>(),
  data: null as PublicData | null,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      state.cookies.has(key) ? { value: state.cookies.get(key) } : undefined,
    set: (key: string, value: string) => state.cookies.set(key, value),
    getAll: () => [],
  }),
  headers: async () => new Headers({ host: "127.0.0.1:3000" }),
}));
vi.mock("@/lib/data/repository", () => ({
  getPublicData: async () => state.data,
}));
vi.mock("@vercel/blob", () => ({
  get: vi.fn(async (path: string) =>
    state.blobs.has(path)
      ? {
          statusCode: 200,
          stream: new Response(new Uint8Array(state.blobs.get(path)!)).body,
        }
      : null,
  ),
  head: vi.fn(async (path: string) => {
    if (!state.blobs.has(path)) throw new Error("not found");
    return { size: state.blobs.get(path)!.length };
  }),
  put: vi.fn(
    async (path: string, bytes: Buffer, options: Record<string, unknown>) => {
      expect(options.access).toBe("private");
      state.blobs.set(path, Buffer.from(bytes));
    },
  ),
}));
import { enterDemo } from "@/lib/auth/server";
import { POST } from "@/app/api/admin/arrival/route";
import { arrivalFingerprint } from "@/lib/museum/arrival";
import {
  browserArrivalReady,
  readBrowserArrival,
} from "@/lib/museum/arrivalStorage";

beforeEach(() => {
  vi.stubEnv("MUSEUM_DATA_MODE", "demo");
  vi.stubEnv("MUSEUM_LOCAL_PREVIEW", "1");
  state.cookies.clear();
  state.blobs.clear();
  state.data = {
    ...fixture,
    mode: "blob",
    artworks: fixture.artworks
      .filter((a) => a.publication === "published")
      .map((a) => publicArtwork(a as Parameters<typeof publicArtwork>[0])),
  } as PublicData;
});
afterEach(() => vi.unstubAllEnvs());
async function upload(
  extra: string,
  body?: Uint8Array,
  origin = "http://127.0.0.1:3000",
) {
  return POST(
    new Request(
      `http://127.0.0.1:3000/api/admin/arrival?fingerprint=${arrivalFingerprint(state.data!)}&${extra}`,
      {
        method: "POST",
        headers: { origin, host: "127.0.0.1:3000" },
        body: body as BodyInit | undefined,
      },
    ),
  );
}
it("rejects anonymous, foreign-origin, stale and oversized captures", async () => {
  expect((await upload("room=room-1&view=wide")).status).toBe(401);
  await enterDemo();
  expect(
    (await upload("commit=1", undefined, "https://foreign.invalid")).status,
  ).toBe(403);
  expect(
    (
      await POST(
        new Request(
          "http://127.0.0.1:3000/api/admin/arrival?fingerprint=old&commit=1",
          {
            method: "POST",
            headers: {
              origin: "http://127.0.0.1:3000",
              host: "127.0.0.1:3000",
            },
          },
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (await upload("room=room-1&view=wide", new Uint8Array(2_000_001))).status,
  ).toBe(413);
  expect(state.blobs.size).toBe(0);
});
it("publishes only a complete private batch and invalidates it on gallery edits", async () => {
  await enterDemo();
  for (const room of state.data!.rooms)
    for (const view of ["wide", "portrait"]) {
      const bytes = await sharp({
        create: {
          width: view === "wide" ? 800 : 400,
          height: view === "wide" ? 500 : 800,
          channels: 3,
          background: "#a27743",
        },
      })
        .webp()
        .toBuffer();
      expect(
        (await upload(`room=${room}&view=${view}`, new Uint8Array(bytes)))
          .status,
      ).toBe(200);
      expect(await browserArrivalReady(state.data!)).toBe(false);
      expect(await readBrowserArrival(state.data!, room, view)).toBeNull();
    }
  expect((await upload("commit=1")).status).toBe(200);
  expect(await browserArrivalReady(state.data!)).toBe(true);
  expect(
    (await readBrowserArrival(state.data!, "room-1", "wide"))!.length,
  ).toBeGreaterThan(0);
  state.data!.artworks[0] = {
    ...state.data!.artworks[0],
    title: "Titre modifié",
  };
  expect(await browserArrivalReady(state.data!)).toBe(false);
  expect(await readBrowserArrival(state.data!, "room-1", "wide")).toBeNull();
});
it("rejects a landscape upload labelled as portrait", async () => {
  await enterDemo();
  const bytes = await sharp({
    create: { width: 800, height: 500, channels: 3, background: "white" },
  })
    .webp()
    .toBuffer();
  expect(
    (await upload("room=room-1&view=portrait", new Uint8Array(bytes))).status,
  ).toBe(400);
  expect(state.blobs.size).toBe(0);
});
