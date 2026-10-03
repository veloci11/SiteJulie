import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@vercel/blob", async (importOriginal) => {
  const { blobMock } = await import("./private-blob-fixture");
  return blobMock(await importOriginal<typeof import("@vercel/blob")>());
});
vi.mock("@/lib/auth/server", () => ({
  requireAdmin: vi.fn(),
  isBlob: () => true,
}));
import { blobFixture, seedBlob } from "./private-blob-fixture";
import {
  createMuseumBackup,
  latestBackup,
  sha256,
} from "@/lib/storage/backups";
import { storageUsage } from "@/lib/storage/usage";
import { GET as cron } from "@/app/api/cron/backup/route";
import { GET as adminStorage } from "@/app/api/admin/storage/route";
import { requireAdmin } from "@/lib/auth/server";
import { ServiceError } from "@/lib/validation/artwork";
const catalog = JSON.stringify({
  artworks: [{ id: "private-draft", notes: "secret note" }],
  settings: { email: "artist@example.test" },
  rooms: ["room-1"],
});
beforeEach(() => {
  blobFixture.files.clear();
  blobFixture.writes = [];
  blobFixture.failCopy = false;
  blobFixture.failWrites = false;
  vi.stubEnv("MUSEUM_DATA_MODE", "blob");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "fixture-only");
  vi.stubEnv("MUSEUM_STORAGE_BUDGET_BYTES", "1000000000");
  vi.stubEnv("CRON_SECRET", "cron-fixture-secret");
  vi.mocked(requireAdmin)
    .mockReset()
    .mockResolvedValue({ id: "fixture-admin" } as never);
  seedBlob("museum/catalog.json", catalog);
  seedBlob("museum/sources/work/source", "original-image");
  seedBlob("museum/media/work/detail.webp", "display-image");
});
afterEach(() => vi.unstubAllEnvs());
describe("private museum snapshots and storage", () => {
  it("copies originals and variants and commits the manifest last", async () => {
    const result = await createMuseumBackup(new Date("2026-10-02T03:00:00Z"));
    expect(result.manifest.assets).toHaveLength(2);
    expect(result.manifest.catalogSha256).toBe(sha256(catalog));
    expect(blobFixture.writes.at(-1)).toMatch(/\/manifest.json$/);
    for (const asset of result.manifest.assets) {
      expect(blobFixture.files.get(asset.backup)!.body).toBe(
        blobFixture.files.get(asset.source)!.body,
      );
      expect(asset.sha256).toBe(
        sha256(blobFixture.files.get(asset.backup)!.body),
      );
    }
    expect(blobFixture.files.get("museum/catalog.json")!.body).toBe(catalog);
  });
  it("retains recoverable images after originals are deleted and deduplicates unchanged files", async () => {
    const first = await createMuseumBackup(new Date("2026-10-02T03:00:00Z"));
    blobFixture.writes = [];
    const repeated = await createMuseumBackup(new Date("2026-10-02T05:00:00Z"));
    expect(repeated.reused).toBe(true);
    expect(blobFixture.writes).toHaveLength(0);
    await createMuseumBackup(new Date("2026-10-03T03:00:00Z"));
    expect(
      blobFixture.writes.some((path) =>
        path.startsWith("museum-backups/objects/"),
      ),
    ).toBe(false);
    blobFixture.files.delete("museum/sources/work/source");
    const original = first.manifest.assets.find((asset) =>
      asset.source.includes("sources"),
    )!;
    expect(blobFixture.files.get(original.backup)!.body).toBe("original-image");
  });
  it("never marks a partial copy as a complete backup", async () => {
    blobFixture.failCopy = true;
    await expect(createMuseumBackup()).rejects.toThrow();
    expect(await latestBackup()).toBeNull();
    expect(blobFixture.files.get("museum/catalog.json")!.body).toBe(catalog);
  });
  it("checks unchanged backup versions from the listing without per-image HEAD reads", async () => {
    await createMuseumBackup(new Date("2026-10-02T03:00:00Z"));
    const head = vi.spyOn(await import("@vercel/blob"), "head");
    const next = await createMuseumBackup(new Date("2026-10-03T03:00:00Z"));
    expect(next.manifest.assets).toHaveLength(2);
    expect(head).not.toHaveBeenCalled();
    head.mockRestore();
  });
  it("rejects a changed stored copy instead of trusting a previous checksum", async () => {
    const first = await createMuseumBackup(new Date("2026-10-02T03:00:00Z"));
    seedBlob(first.manifest.assets[0].backup, "corrupt-backup");
    await expect(
      createMuseumBackup(new Date("2026-10-03T03:00:00Z")),
    ).rejects.toThrow("Backup asset changed");
  });
  it("includes actual backup bytes and never invents a capacity", async () => {
    await createMuseumBackup();
    const usage = await storageUsage();
    expect(usage.usedBytes).toBe(
      [...blobFixture.files.values()].reduce(
        (sum, value) => sum + Buffer.byteLength(value.body),
        0,
      ),
    );
    expect(usage.backupBytes).toBeGreaterThan(0);
    expect(usage.lastBackup?.assets).toBe(2);
    expect(usage.remainingBytes).toBe(1e9 - usage.usedBytes);
    vi.stubEnv("MUSEUM_STORAGE_BUDGET_BYTES", "");
    expect((await storageUsage()).capacityBytes).toBeNull();
  });
  it("requires the server cron secret and never returns private catalogue content", async () => {
    for (const authorization of [
      "",
      "Bearer wrong-secret",
      "Bearer " + "é".repeat(19),
    ])
      expect(
        (
          await cron(
            new Request("https://example.test/api/cron/backup", {
              headers: { authorization },
            }),
          )
        ).status,
      ).toBe(401);
    const response = await cron(
      new Request("https://example.test/api/cron/backup", {
        headers: { authorization: "Bearer cron-fixture-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, assets: 2 });
  });
  it("denies anonymous storage access before reading any private data", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(
      new ServiceError("Accès refusé.", 401),
    );
    expect((await adminStorage()).status).toBe(401);
    expect(blobFixture.writes).toHaveLength(0);
    vi.mocked(requireAdmin).mockResolvedValue({ id: "fixture-admin" } as never);
    const response = await adminStorage();
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("secret note");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
