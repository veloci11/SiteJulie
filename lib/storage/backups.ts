import "server-only";
import { createHash } from "node:crypto";
import { copy, get, head, list, put } from "@vercel/blob";
import { z } from "zod";
import { readPrivateJson } from "./private-json";
import { ServiceError } from "@/lib/validation/artwork";

export const BACKUP_PREFIX = "museum-backups/";
const assetSchema = z.object({
  source: z.string().startsWith("museum/"),
  backup: z.string().startsWith(BACKUP_PREFIX + "objects/"),
  size: z.number().int().nonnegative(),
  etag: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const backupManifestSchema = z.object({
  version: z.literal(1),
  createdAt: z.string().datetime(),
  catalogPath: z.string().startsWith(BACKUP_PREFIX + "snapshots/"),
  catalogSha256: z.string().regex(/^[a-f0-9]{64}$/),
  assets: z.array(assetSchema),
});
export type BackupManifest = z.infer<typeof backupManifestSchema>;
export const sha256 = (body: string | Uint8Array) =>
  createHash("sha256").update(body).digest("hex");

export async function listPrivateFiles(prefix?: string) {
  const files: Awaited<ReturnType<typeof list>>["blobs"] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    files.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return files;
}

export async function readPrivateBytes(pathname: string) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream)
    throw new Error("Backup source unavailable");
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export async function latestBackup() {
  const files = await listPrivateFiles(BACKUP_PREFIX + "snapshots/");
  const manifests = files
    .filter((file) => file.pathname.endsWith("/manifest.json"))
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  if (!manifests[0]) return null;
  const record = await readPrivateJson<unknown>(manifests[0].pathname);
  return record
    ? {
        path: manifests[0].pathname,
        ...backupManifestSchema.parse(record.value),
      }
    : null;
}

async function immutableJson(path: string, body: string) {
  try {
    await put(path, body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
  } catch (error) {
    // A concurrent cron invocation may already have committed the same bytes.
    const existing = await readPrivateBytes(path).catch(() => null);
    if (!existing || sha256(existing) !== sha256(body)) throw error;
  }
}

export async function createMuseumBackup(now = new Date()) {
  if (
    process.env.MUSEUM_DATA_MODE !== "blob" ||
    !process.env.BLOB_READ_WRITE_TOKEN
  )
    throw new ServiceError(
      "La sauvegarde nécessite le stockage privé de production.",
      503,
    );
  const catalog = await readPrivateBytes("museum/catalog.json");
  // Abort on malformed data instead of marking an unusable snapshot as complete.
  const parsed = JSON.parse(catalog.toString("utf8"));
  if (
    !Array.isArray(parsed.artworks) ||
    !parsed.settings ||
    !Array.isArray(parsed.rooms)
  )
    throw new Error("Invalid backup catalogue");
  const hash = sha256(catalog);
  const prefix = `${BACKUP_PREFIX}snapshots/${now.toISOString().slice(0, 10)}/${hash}/`;
  const existing = await readPrivateJson<unknown>(prefix + "manifest.json");
  if (existing)
    return {
      manifest: backupManifestSchema.parse(existing.value),
      reused: true,
    };
  const [sources, stored] = await Promise.all([
    listPrivateFiles("museum/"),
    listPrivateFiles(BACKUP_PREFIX + "objects/"),
  ]);
  const previous = await latestBackup();
  const checksums = new Map(
    previous?.assets.map((asset) => [asset.backup, asset.sha256]) || [],
  );
  const storedPaths = new Set(stored.map((file) => file.pathname));
  const assets: BackupManifest["assets"] = [];
  for (const file of sources) {
    if (file.pathname === "museum/catalog.json") continue;
    const metadata = await head(file.pathname);
    const backup =
      BACKUP_PREFIX + "objects/" + sha256(file.pathname + "\n" + metadata.etag);
    if (!storedPaths.has(backup)) {
      try {
        await copy(file.pathname, backup, {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: metadata.contentType,
          cacheControlMaxAge: 60,
        });
      } catch (error) {
        // An overlapping invocation may have copied this immutable asset.
        const copied = await head(backup).catch(() => null);
        if (
          !copied ||
          copied.size !== metadata.size ||
          copied.etag !== metadata.etag
        )
          throw error;
      }
    }
    const copied = await head(backup);
    if (copied.size !== metadata.size || copied.etag !== metadata.etag)
      throw new Error("Backup asset changed during copy");
    const checksum =
      checksums.get(backup) || sha256(await readPrivateBytes(backup));
    assets.push({
      source: file.pathname,
      backup,
      size: metadata.size,
      etag: metadata.etag,
      sha256: checksum,
    });
  }
  if (sha256(await readPrivateBytes("museum/catalog.json")) !== hash)
    throw new Error(
      "Catalogue changed during backup; no completed snapshot was published",
    );
  const catalogPath = prefix + "catalog.json";
  await immutableJson(catalogPath, catalog.toString("utf8"));
  const manifest: BackupManifest = {
    version: 1,
    createdAt: now.toISOString(),
    catalogPath,
    catalogSha256: hash,
    assets,
  };
  // The manifest is the completion marker and is always written last.
  await immutableJson(prefix + "manifest.json", JSON.stringify(manifest));
  return { manifest, reused: false };
}
