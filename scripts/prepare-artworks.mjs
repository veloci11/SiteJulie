import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
const root = process.cwd();
const mediaOnly = process.argv.includes("--media-only");
const manifest = JSON.parse(
  await fs.readFile("references/artworks/manifest.json", "utf8"),
);
await fs.mkdir(".local/media", { recursive: true });
await fs.mkdir("docs/captures", { recursive: true });
// Curatorial demo arrangement: a room per collection. Original artwork IDs stay stable.
const placements = [
  ["room-2", 2],
  ["room-2", 6],
  ["room-1", 10],
  ["room-2", 9],
  ["room-2", 12],
  ["room-1", 2],
  ["room-1", 6],
  ["room-1", 12],
];
const exhibitionOrder = [2, 5, 6, 7, 0, 1, 3, 4];
if (manifest.artworks.length !== placements.length) {
  throw new Error(
    "La répartition de démonstration doit correspondre aux huit œuvres du contrat V2.",
  );
}
const artworks = [];
const thumbs = [];
const sources = [];
for (const [i, entry] of manifest.artworks.entries()) {
  const [roomId, slot] = placements[i];
  const source = path.join(root, "ImageOeuvre", entry.source_filename);
  const input = await fs.readFile(source);
  const id = `oeuvre-${String(i + 1).padStart(2, "0")}`;
  const normalized = await sharp(input)
    .rotate()
    .toColourspace("srgb")
    .png()
    .toBuffer();
  const metadata = await sharp(normalized).metadata();
  for (const [variant, width] of [
    ["thumb", 320],
    ["room", 1536],
    ["detail", 2560],
  ]) {
    await sharp(normalized)
      .resize({ width, withoutEnlargement: true })
      .webp(
        variant === "detail"
          ? { lossless: true }
          : { quality: variant === "room" ? 94 : 90, smartSubsample: true },
      )
      .toFile(`.local/media/${id}-${variant}.webp`);
  }
  artworks.push({
    id,
    slug: id,
    title: `Œuvre ${String(i + 1).padStart(2, "0")}`,
    description: "",
    technique: null,
    widthCm: null,
    heightCm: null,
    year: null,
    imageWidth: metadata.width,
    imageHeight: metadata.height,
    image: `/api/media/${id}?variant=room`,
    thumbnail: `/api/media/${id}?variant=thumb`,
    detailImage: `/api/media/${id}?variant=detail`,
    alt: entry.description_for_identification_only,
    priceMinor: null,
    currency: "EUR",
    availability: "available",
    roomId,
    slotId: `${roomId}-slot-${String(slot).padStart(2, "0")}`,
    frameStyle: "brass",
    order: exhibitionOrder.indexOf(i),
    collection: roomId === "room-1" ? "Visages" : "Récits & paysages",
    publication: "published",
    priceVisibility: "on_request",
    revision: 1,
  });
  sources.push({
    id,
    source: entry.source_filename,
    sha256: crypto.createHash("sha256").update(input).digest("hex"),
    width: metadata.width,
    height: metadata.height,
  });
  if (!mediaOnly)
    thumbs.push({
      input: await sharp(normalized)
        .resize({
          width: 260,
          height: 270,
          fit: "contain",
          background: "#f4eedf",
        })
        .png()
        .toBuffer(),
      left: (i % 4) * 280 + 10,
      top: Math.floor(i / 4) * 290 + 10,
    });
}
if (!mediaOnly)
  await sharp({
    create: { width: 1120, height: 580, channels: 3, background: "#f4eedf" },
  })
    .composite(thumbs)
    .png()
    .toFile("docs/captures/sources-contact-sheet.png");
const settings = {
  artistName: "Artiste peintre",
  tagline: "Une invitation à regarder autrement",
  heroTitle: "Des mondes intérieurs\nen couleurs",
  aboutTitle: "Au-delà de la toile",
  aboutText:
    "Cet espace accueillera la présentation de l’artiste, son parcours et ce qui nourrit sa peinture.",
  contactTitle: "Une œuvre vous touche ?",
  contactText:
    "Pour une question, un échange ou l’envie d’accueillir une œuvre chez vous.",
  email: "",
  currency: "EUR",
};
if (!mediaOnly)
  await fs.writeFile(
    ".local/seed.json",
    JSON.stringify(
      { artworks, settings, rooms: ["room-1", "room-2"] },
      null,
      2,
    ),
  );
if (!mediaOnly)
  await fs.writeFile(
    "docs/artwork-sources.json",
    JSON.stringify(
      {
        notice:
          "Sources utilisateur intactes. Titres provisoires, échelles illustratives. Pas de prix ni informations artistiques déduites.",
        sources,
      },
      null,
      2,
    ),
  );
const duplicate = await fs.readFile(
  "ImageOeuvre/2f00a100-8cfd-4cd4-ad7d-f59be19fad23 2.JPG",
);
console.log(
  "Prepared",
  artworks.length,
  "works; duplicate exact:",
  crypto.createHash("sha256").update(duplicate).digest("hex") ===
    sources[7].sha256,
);
