import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@vercel/blob", async (importOriginal) => {
  const { blobMock } = await import("./private-blob-fixture");
  return blobMock(await importOriginal<typeof import("@vercel/blob")>());
});
import * as blob from "@vercel/blob";
import { blobFixture, seedBlob } from "./private-blob-fixture";
import { storageUsage } from "@/lib/storage/usage";

beforeEach(() => {
  blobFixture.files.clear();
  blobFixture.writes = [];
  vi.stubEnv("MUSEUM_STORAGE_BUDGET_BYTES", "1000000000");
  vi.stubEnv("CRON_SECRET", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Admin storage inventory", () => {
  it("finds the latest completed snapshot from one inventory without relisting", async () => {
    seedBlob("museum/media/work/image.webp", "image");
    for (const [day, uploadedAt] of [
      ["2026-10-01", "2026-10-01T03:00:00Z"],
      ["2026-10-02", "2026-10-02T03:00:00Z"],
    ]) {
      const pathname = `museum-backups/snapshots/${day}/snapshot/manifest.json`;
      seedBlob(
        pathname,
        JSON.stringify({
          version: 1,
          createdAt: uploadedAt,
          catalogPath: `museum-backups/snapshots/${day}/snapshot/catalog.json`,
          catalogSha256: "a".repeat(64),
          assets: [],
        }),
      );
      blobFixture.files.get(pathname)!.uploadedAt = new Date(uploadedAt);
    }
    // Other manifest-named objects in the same inventory are not snapshots.
    seedBlob("museum/media/unrelated/manifest.json", "not a backup");
    const listing = vi.spyOn(blob, "list");
    const usage = await storageUsage();
    expect(listing).toHaveBeenCalledTimes(1);
    expect(usage.lastBackup).toEqual({
      createdAt: "2026-10-02T03:00:00Z",
      assets: 0,
    });
    expect(usage.fileCount).toBe(4);
    expect(blobFixture.writes).toHaveLength(0);
  });

  it("uses the same inventory when no completed backup exists", async () => {
    seedBlob("museum/catalog.json", "{}");
    seedBlob("museum-backups/snapshots/incomplete/catalog.json", "{}");
    const listing = vi.spyOn(blob, "list");
    const usage = await storageUsage();
    expect(listing).toHaveBeenCalledTimes(1);
    expect(usage.lastBackup).toBeNull();
    expect(usage.usedBytes).toBe(4);
  });
});
