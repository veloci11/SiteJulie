import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  body: null as string | null,
  etag: 0,
  weak: false,
  changeBeforeHead: false,
}));

vi.mock("@vercel/blob", () => {
  class BlobPreconditionFailedError extends Error {}
  return {
    BlobPreconditionFailedError,
    get: vi.fn(async () => {
      if (fake.body === null) return null;
      return {
        statusCode: 200,
        stream: new Response(fake.body).body,
        blob: {
          etag: fake.weak ? `W/${String(fake.etag)}` : String(fake.etag),
        },
      };
    }),
    head: vi.fn(async () => ({
      etag: String(fake.etag + (fake.changeBeforeHead ? 1 : 0)),
    })),
    put: vi.fn(
      async (
        _path: string,
        body: string,
        options: { allowOverwrite?: boolean; ifMatch?: string },
      ) => {
        if (fake.body !== null && !options.allowOverwrite)
          throw new Error("already exists");
        if (options.ifMatch && options.ifMatch !== String(fake.etag))
          throw new BlobPreconditionFailedError();
        fake.body = body;
        fake.etag++;
        return { etag: String(fake.etag) };
      },
    ),
  };
});

import {
  mutateBlob,
  readBlob,
  readBlobForPublic,
  invalidateBlobReadCache,
} from "@/lib/data/blob";
import { get } from "@vercel/blob";
import fixture from "./fixtures/catalog.json";
import { randomUUID } from "node:crypto";

beforeEach(() => {
  invalidateBlobReadCache();
  vi.clearAllMocks();
  fake.body = null;
  fake.etag = 0;
  fake.weak = false;
  fake.changeBeforeHead = false;
});
afterEach(() => vi.useRealTimers());

describe("Vercel Blob catalogue", () => {
  it("reduces a burst of 26 public image/page reads to one origin read and isolates callers", async () => {
    fake.body = JSON.stringify(fixture);
    const snapshots = await Promise.all(
      Array.from({ length: 26 }, () => readBlobForPublic()),
    );
    expect(get).toHaveBeenCalledTimes(1);
    snapshots[0].store.settings.heroTitle = "Caller mutation";
    expect((await readBlobForPublic()).store.settings.heroTitle).not.toBe(
      "Caller mutation",
    );
    expect(get).toHaveBeenCalledTimes(1);
    await readBlob();
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("refreshes an externally unpublished work at the strict expiry and fails closed on an outage", async () => {
    vi.useFakeTimers();
    fake.body = JSON.stringify(fixture);
    const first = await readBlobForPublic();
    const unpublished = structuredClone(fixture);
    unpublished.artworks[0].publication = "draft";
    fake.body = JSON.stringify(unpublished);
    vi.advanceTimersByTime(29_999);
    const retained = await readBlobForPublic();
    expect(retained.store.artworks[0].publication).toBe("published");
    expect(retained.publicationValidUntil).toBe(first.publicationValidUntil);
    vi.advanceTimersByTime(1);
    expect((await readBlobForPublic()).store.artworks[0].publication).toBe(
      "draft",
    );
    fake.body = "malformed";
    vi.advanceTimersByTime(30_000);
    await expect(readBlobForPublic()).rejects.toMatchObject({ status: 503 });
  });
  it("invalidates public reads after an authenticated catalogue write", async () => {
    fake.body = JSON.stringify(fixture);
    await readBlobForPublic();
    await mutateBlob((store) => {
      store.settings.heroTitle = "Immediately saved";
    });
    expect((await readBlobForPublic()).store.settings.heroTitle).toBe(
      "Immediately saved",
    );
  });
  it("retains private room drafts across unrelated catalogue mutations", async () => {
    const draft = {
      version: randomUUID(),
      savedAt: new Date().toISOString(),
      plan: {
        roomId: "room-1",
        items: [
          {
            artworkId: "test-1",
            revision: 1,
            slotId: null,
            placementOffsetX: 0,
            placementOffsetY: 0,
            displayScale: 0.6,
          },
        ],
      },
    };
    await mutateBlob((store) => {
      store.roomLayoutDrafts = { "room-1": draft };
    });
    await mutateBlob((store) => {
      store.settings.heroTitle = "New title";
    });
    expect((await readBlob()).roomLayoutDrafts?.["room-1"]).toEqual(draft);
  });
  it("creates an empty catalogue and serializes concurrent mutations", async () => {
    await Promise.all([
      mutateBlob((store) => store.rooms.push("room-2")),
      mutateBlob((store) => {
        store.settings.heroTitle = "Nouvelle exposition";
      }),
    ]);
    const stored = await readBlob();
    expect(stored.rooms).toEqual(["room-1", "room-2"]);
    expect(stored.settings.heroTitle).toBe("Nouvelle exposition");
  });
  it("saves compressed catalogues using the matching strong origin validator", async () => {
    await mutateBlob((store) => {
      store.settings.heroTitle = "Initial";
    });
    fake.weak = true;
    await mutateBlob((store) => {
      store.settings.heroTitle = "Saved";
    });
    expect((await readBlob()).settings.heroTitle).toBe("Saved");
  });
  it("never pairs a stale response body with a newer origin validator", async () => {
    await mutateBlob((store) => {
      store.settings.heroTitle = "Original";
    });
    fake.weak = true;
    fake.changeBeforeHead = true;
    await expect(
      mutateBlob((store) => {
        store.settings.heroTitle = "Overwrite";
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readBlob()).settings.heroTitle).toBe("Original");
  });
});
