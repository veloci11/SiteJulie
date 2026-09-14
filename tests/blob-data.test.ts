import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  body: null as string | null,
  etag: 0,
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
        blob: { etag: String(fake.etag) },
      };
    }),
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
});
