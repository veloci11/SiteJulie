// Package an existing, reviewed browser capture. This does not run a browser.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { arrivalFingerprint } from "../lib/museum/arrival";
import { arrivalRooms, arrivalViews } from "../lib/museum/arrivalImage";
import { publicArtwork } from "../lib/validation/artwork";
import type { AdminArtwork, PublicData } from "../lib/data/types";

async function main() {
  const local = path.resolve(process.env.MUSEUM_LOCAL_DATA_DIR || ".local");
  const store = JSON.parse(
    await readFile(path.join(local, "data.json"), "utf8"),
  );
  const data: PublicData = {
    ...store,
    mode: "demo",
    artworks: store.artworks
      .filter((a: AdminArtwork) => a.publication === "published")
      .map(publicArtwork),
  };
  const fingerprint = arrivalFingerprint(data);
  const source = path.join(local, "arrival", "generated", fingerprint);
  const manifest = JSON.parse(
    await readFile(path.join(source, "manifest.json"), "utf8"),
  );
  if (manifest.fingerprint !== fingerprint)
    throw new Error("Arrival capture is stale.");
  const files = arrivalRooms(data).flatMap((room) =>
    arrivalViews.map((view) => `${room}-${view}.webp`),
  );
  for (const file of files) {
    const metadata = await sharp(
      await readFile(path.join(source, file)),
    ).metadata();
    if (metadata.format !== "webp" || !metadata.width || metadata.width < 400)
      throw new Error(`Invalid arrival capture: ${file}`);
  }
  const destination = path.resolve("content/arrival");
  await mkdir(destination, { recursive: true });
  for (const file of files)
    await cp(path.join(source, file), path.join(destination, file));
  await writeFile(
    path.join(destination, "manifest.json"),
    JSON.stringify(
      {
        fingerprint,
        capturedAt: manifest.capturedAt,
        notice:
          "Reviewed current browser captures. Server-only; serve solely for the matching public hanging.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Packaged ${files.length} current arrival captures (${fingerprint}).`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
