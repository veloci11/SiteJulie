import { beforeEach, afterEach, it, expect, vi } from "vitest";
import fixture from "./fixtures/catalog.json";
const state = vi.hoisted(() => ({
  store: {} as Record<string, any>,
  admin: false,
  blob: true,
  reads: [] as Array<{ path: string; options: Record<string, any> }>,
}));
vi.mock("@/lib/auth/server", async () => {
  const { ServiceError } = await import("@/lib/validation/artwork");
  return {
    isBlob: () => state.blob,
    isDemo: () => false,
    assertLocalHost: () => {},
    requireAdmin: async () => {
      if (!state.admin) throw new ServiceError("Connexion requise", 401);
      return { id: "admin" };
    },
    supabaseSession: async () => ({
      rpc: async () => ({
        data:
          state.store.artworks[0].publication === "published"
            ? "admin/painting/image-v2/room.webp"
            : null,
        error: null,
      }),
    }),
  };
});
vi.mock("@/lib/data/blob", () => ({
  readBlob: async () => state.store,
  mutateBlob: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({
  get: async (path: string, options: Record<string, any>) => {
    state.reads.push({ path, options });
    return {
      statusCode: options.ifNoneMatch === '"current"' ? 304 : 200,
      stream:
        options.ifNoneMatch === '"current"'
          ? null
          : new Response(new Uint8Array([1, 2, 3])).body,
      blob: { etag: '"current"' },
    };
  },
  issueSignedToken: vi.fn(() => {
    throw new Error("Must not expose a private URL");
  }),
  presignUrl: vi.fn(),
  put: vi.fn(),
}));
vi.mock("@/lib/media/signer", () => ({
  signApprovedPath: async () =>
    "https://storage.example.test/approved-image?token=fixture",
}));
import { GET } from "@/app/api/media/[id]/route";
beforeEach(() => {
  state.store = {
    ...fixture,
    artworks: [
      {
        ...fixture.artworks[0],
        id: "painting",
        mediaId: "image-v2",
        publication: "published",
      },
    ],
    uploads: [{ id: "image-v2", status: "ready" }],
  };
  state.admin = false;
  state.blob = true;
  state.reads = [];
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function read(etag?: string, variant = "room") {
  return GET(
    new Request(`http://localhost/api/media/painting?variant=${variant}`, {
      headers: etag ? { "If-None-Match": etag } : {},
    }),
    { params: Promise.resolve({ id: "painting" }) },
  );
}
it("streams public room images at a stable URL with a bounded private browser cache", async () => {
  const response = await read();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe(
    "private, max-age=60, must-revalidate",
  );
  expect(response.headers.get("ETag")).toBe('"current"');
  expect(response.headers.get("Location")).toBeNull();
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
  expect(state.reads[0].path).toBe("museum/media/painting/image-v2/room.webp");
});
it("revalidates unchanged images without reading the image body again", async () => {
  const response = await read('"current"');
  expect(response.status).toBe(304);
  expect(await response.text()).toBe("");
  expect(state.reads[0].options.ifNoneMatch).toBe('"current"');
});
it("checks current publication before accepting any old ETag", async () => {
  state.store.artworks[0].publication = "draft";
  const response = await read('"current"');
  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(state.reads).toEqual([]);
});
it("never caches or conditionally serves administrator-only images", async () => {
  state.store.artworks[0].publication = "draft";
  state.admin = true;
  const response = await read('"current"');
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(state.reads[0].options.ifNoneMatch).toBeUndefined();
});
it("uses the current media object after replacement, even with an old client URL", async () => {
  state.store.artworks[0].mediaId = "image-v3";
  state.store.uploads = [{ id: "image-v3", status: "ready" }];
  expect((await read('"old"')).status).toBe(200);
  expect(state.reads[0].path).toContain("/image-v3/");
});
it("rejects unknown variants before accessing storage", async () => {
  expect((await read(undefined, "original")).status).toBe(400);
  expect(state.reads).toEqual([]);
});

for (const status of [200, 304])
  it(`proxies an approved Supabase image with status ${status} without exposing its signed URL`, async () => {
    state.blob = false;
    const fetchImage = vi.fn(
      async () =>
        new Response(status === 200 ? new Uint8Array([1, 2, 3]) : null, {
          status,
          headers: { ETag: '"current"' },
        }),
    );
    vi.stubGlobal("fetch", fetchImage);
    const response = await read(status === 304 ? '"current"' : undefined);
    expect(response.status).toBe(status);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=60, must-revalidate",
    );
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });
it("does not proxy private Supabase media for an anonymous visitor", async () => {
  state.blob = false;
  state.store.artworks[0].publication = "draft";
  const fetchImage = vi.fn();
  vi.stubGlobal("fetch", fetchImage);
  expect((await read('"current"')).status).toBe(401);
  expect(fetchImage).not.toHaveBeenCalled();
});
