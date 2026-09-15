/** Import the reviewed public portfolio locally. Never uploads or deploys. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  artworkSchema,
  settingsSchema,
  resolvePlacement,
} from "../lib/validation/artwork";
import { normalizeCollectionOrder } from "../lib/data/collections";
import type { AdminArtwork, SiteSettings } from "../lib/data/types";

async function main() {
  const root = path.resolve(".local");
  const source = JSON.parse(
    await fs.readFile("content/portfolio.json", "utf8"),
  );
  const previous = JSON.parse(
    await fs
      .readFile(path.join(root, "data.json"), "utf8")
      .catch(() => fs.readFile(path.join(root, "seed.json"), "utf8")),
  );
  const originals = source.artworks as (AdminArtwork & {
    source: { localFile: string; originalFile: string; blockId: string };
  })[];
  const artworks: AdminArtwork[] = [];
  const uploads: object[] = [];
  await fs.mkdir(path.join(root, "media"), { recursive: true });
  for (const entry of originals) {
    const { source: provenance, ...metadata } = entry;
    const bytes = await fs.readFile(provenance.localFile);
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 14);
    const mediaId = `${entry.id}-notion-${hash}`;
    const normalized = await sharp(bytes)
      .rotate()
      .toColourspace("srgb")
      .png()
      .toBuffer();
    const info = await sharp(normalized).metadata();
    for (const [variant, width] of [
      ["thumb", 320],
      ["room", 1536],
      ["detail", 2560],
    ] as const) {
      const target = path.join(root, "media", `${mediaId}-${variant}.webp`);
      try {
        await fs.access(target);
      } catch {
        await sharp(normalized)
          .resize({ width, withoutEnlargement: true })
          .webp({
            quality: variant === "room" ? 92 : variant === "detail" ? 96 : 88,
            smartSubsample: true,
          })
          .toFile(target);
      }
    }
    const old = previous.artworks.find((a: AdminArtwork) => a.id === entry.id);
    const artwork = artworkSchema.parse({
      ...metadata,
      mediaId,
      revision: (old?.revision ?? 0) + 1,
      imageWidth: info.width,
      imageHeight: info.height,
      image: `/api/media/${entry.id}?variant=room&v=${mediaId}`,
      thumbnail: `/api/media/${entry.id}?variant=thumb&v=${mediaId}`,
      detailImage: `/api/media/${entry.id}?variant=detail&v=${mediaId}`,
    });
    artworks.push(artwork);
    uploads.push({
      id: mediaId,
      artworkId: artwork.id,
      ownerId: "local-demo-admin",
      status: "ready",
      path: path.relative(root, path.resolve(provenance.originalFile)),
      createdAt: Date.now(),
    });
  }
  // Validate the complete hanging before changing either local catalogue file.
  for (const artwork of artworks)
    resolvePlacement(artwork, artworks, source.rooms);
  if (new Set(artworks.map((a) => a.id)).size !== artworks.length)
    throw new Error("Œuvres dupliquées.");
  if (new Set(originals.map((a) => a.source.blockId)).size !== originals.length)
    throw new Error("Images Notion dupliquées.");
  const backup = path.join(root, "backups", `before-notion-${Date.now()}`);
  await fs.mkdir(backup, { recursive: true });
  for (const file of ["data.json", "seed.json"]) {
    await fs
      .copyFile(path.join(root, file), path.join(backup, file))
      .catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
  }
  const settings: SiteSettings = settingsSchema.parse(source.settings);
  const store = {
    rooms: source.rooms,
    settings,
    artworks: normalizeCollectionOrder(artworks, source.rooms),
    uploads,
  };
  for (const file of ["data.json", "seed.json"]) {
    const temp = path.join(root, `${file}.import.tmp`);
    await fs.writeFile(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
    await fs.rename(temp, path.join(root, file));
  }
  console.log(
    `${artworks.length} œuvres importées localement, 4 collections, 2 salles. Les 8 liens historiques sont conservés. Sauvegarde : ${path.relative(process.cwd(), backup)}`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
