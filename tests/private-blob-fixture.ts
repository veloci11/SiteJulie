import { createHash } from "node:crypto";
type Stored = {
  body: string;
  etag: string;
  uploadedAt: Date;
  contentType: string;
};
export const blobFixture = {
  files: new Map<string, Stored>(),
  failWrites: false,
  failCopy: false,
  writes: [] as string[],
};
export function seedBlob(path: string, body: string) {
  blobFixture.files.set(path, {
    body,
    etag: '"' + createHash("sha256").update(body).digest("hex") + '"',
    uploadedAt: new Date(),
    contentType: "application/json",
  });
}
export function blobMock(real: typeof import("@vercel/blob")) {
  return {
    ...real,
    get: async (pathname: string) => {
      const item = blobFixture.files.get(pathname);
      if (!item) return null;
      const body = item.body,
        etag = item.etag;
      await Promise.resolve();
      return {
        statusCode: 200,
        blob: { etag },
        stream: new Response(body).body,
      };
    },
    head: async (pathname: string) => {
      const item = blobFixture.files.get(pathname);
      if (!item) throw new real.BlobNotFoundError();
      return {
        pathname,
        etag: item.etag,
        size: Buffer.byteLength(item.body),
        contentType: item.contentType,
      };
    },
    put: async (
      pathname: string,
      body: string,
      options: { ifMatch?: string; allowOverwrite?: boolean; access?: string },
    ) => {
      if (blobFixture.failWrites)
        throw new Error("private-storage-secret-error");
      const item = blobFixture.files.get(pathname);
      if (
        (options.ifMatch && options.ifMatch !== item?.etag) ||
        (item && !options.allowOverwrite)
      )
        throw new real.BlobPreconditionFailedError();
      if (options.access !== "private")
        throw new Error("Backup must stay private");
      seedBlob(pathname, body);
      blobFixture.writes.push(pathname);
      return { pathname, etag: blobFixture.files.get(pathname)!.etag };
    },
    copy: async (
      source: string,
      target: string,
      options: { access: string },
    ) => {
      if (blobFixture.failCopy) throw new Error("copy failed");
      const item = blobFixture.files.get(source);
      if (!item || options.access !== "private")
        throw new Error("invalid copy");
      if (blobFixture.files.has(target))
        throw new real.BlobPreconditionFailedError();
      seedBlob(target, item.body);
      blobFixture.writes.push(target);
      return { pathname: target, etag: item.etag };
    },
    list: async ({ prefix = "" } = {}) => ({
      hasMore: false,
      blobs: [...blobFixture.files.entries()]
        .filter(([pathname]) => pathname.startsWith(prefix))
        .map(([pathname, item]) => ({
          pathname,
          size: Buffer.byteLength(item.body),
          uploadedAt: item.uploadedAt,
          etag: item.etag,
        })),
    }),
  };
}
