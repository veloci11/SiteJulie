import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { mutateBlob, readBlob } from "@/lib/data/blob";

beforeEach(() => {
  fake.body = null;
  fake.etag = 0;
  fake.weak = false;
  fake.changeBeforeHead = false;
});

describe("Vercel Blob catalogue", () => {
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
