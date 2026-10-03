import "server-only";
import { get, head, put } from "@vercel/blob";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PublicData } from "@/lib/data/types";
import { localRoot } from "@/lib/data/local";
import { arrivalFingerprint } from "./arrival";

function key(fingerprint: string, name: string) {
  if (
    !/^[a-f0-9]{64}$/.test(fingerprint) ||
    !/^(manifest\.json|room-[1-4]-(wide|portrait)\.webp)$/.test(name)
  )
    throw new Error("Invalid arrival key");
  return `museum/arrival/${fingerprint}/${name}`;
}
async function read(data: PublicData, name: string, local = localRoot()) {
  const pathname = key(arrivalFingerprint(data), name);
  if (data.mode === "demo") {
    try {
      return await readFile(path.join(local, pathname));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  if (data.mode !== "blob") return null;
  try {
    // Fingerprinted previews contain only this public hanging; reuse Blob's CDN.
    const result = await get(pathname, { access: "private", useCache: true });
    return result?.statusCode === 200 && result.stream
      ? Buffer.from(await new Response(result.stream).arrayBuffer())
      : null;
  } catch (e) {
    // A temporary storage outage must still allow the bundled or empty backdrop.
    return null;
  }
}
export async function browserArrivalReady(
  data: PublicData,
  local = localRoot(),
) {
  return Boolean(await read(data, "manifest.json", local));
}
export async function readBrowserArrival(
  data: PublicData,
  room: string,
  view: string,
  local = localRoot(),
) {
  if (!data.rooms.includes(room) || !(await browserArrivalReady(data, local)))
    return null;
  return read(data, `${room}-${view}.webp`, local);
}
async function write(data: PublicData, name: string, bytes: Buffer) {
  const pathname = key(arrivalFingerprint(data), name);
  if (data.mode === "demo") {
    const target = path.join(localRoot(), pathname);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, target);
  } else if (data.mode === "blob") {
    await put(pathname, bytes, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: name.endsWith(".webp") ? "image/webp" : "application/json",
      cacheControlMaxAge: 60,
    });
  } else throw new Error("Arrival storage unavailable");
}
export async function storeBrowserArrival(
  data: PublicData,
  room: string,
  view: string,
  bytes: Buffer,
) {
  if (!data.rooms.includes(room)) throw new Error("Invalid room");
  await write(data, `${room}-${view}.webp`, bytes);
}
export async function commitBrowserArrival(data: PublicData) {
  // Publish the marker only after every view is stored. Partial batches are invisible.
  for (const room of data.rooms)
    for (const view of ["wide", "portrait"]) {
      const name = `${room}-${view}.webp`;
      if (data.mode === "blob") await head(key(arrivalFingerprint(data), name));
      else if (!(await read(data, name)))
        throw new Error("Incomplete arrival batch");
    }
  await write(
    data,
    "manifest.json",
    Buffer.from(
      JSON.stringify({
        fingerprint: arrivalFingerprint(data),
        capturedAt: new Date().toISOString(),
      }),
    ),
  );
}
