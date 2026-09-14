import { readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

if (process.env.MUSEUM_BLOB_ALLOW_SEED !== "1") {
  console.error(
    "Import refusé. Définissez MUSEUM_BLOB_ALLOW_SEED=1 pour remplacer le catalogue Blob.",
  );
  process.exit(1);
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN manque.");
  process.exit(1);
}

const root = path.resolve(process.env.MUSEUM_LOCAL_DATA_DIR || ".local");
let source;
for (const name of ["data.json", "seed.json"]) {
  try {
    source = JSON.parse(await readFile(path.join(root, name), "utf8"));
    break;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
if (!source) throw new Error("Catalogue local introuvable.");

const uploads = [];
for (const artwork of source.artworks) {
  const mediaId = artwork.mediaId || artwork.id;
  const base = `museum/media/${artwork.id}/${mediaId}`;
  for (const variant of ["thumb", "room", "detail"]) {
    const file = path.join(root, "media", `${mediaId}-${variant}.webp`);
    const buffer = await readFile(file);
    await put(`${base}/${variant}.webp`, buffer, {
      access: "private",
      contentType: "image/webp",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 31536000,
    });
  }
  artwork.mediaId = mediaId;
  artwork.image = `/api/media/${artwork.id}?variant=room&v=${mediaId}`;
  artwork.thumbnail = `/api/media/${artwork.id}?variant=thumb&v=${mediaId}`;
  artwork.detailImage = `/api/media/${artwork.id}?variant=detail&v=${mediaId}`;
  uploads.push({
    id: mediaId,
    artworkId: artwork.id,
    ownerId: "vercel-blob-admin",
    status: "ready",
    path: `museum/sources/${artwork.id}/${mediaId}/source`,
    createdAt: Date.now(),
  });
}

await put(
  "museum/catalog.json",
  JSON.stringify({
    artworks: source.artworks,
    settings: source.settings,
    rooms: source.rooms,
    uploads,
  }),
  {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  },
);

console.log(
  `${source.artworks.length} œuvres et ${source.artworks.length * 3} variantes importées dans Vercel Blob.`,
);
