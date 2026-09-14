import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { PublicData } from "@/lib/data/types";
import { arrivalFingerprint } from "./arrival";

export const arrivalViews = ["wide", "portrait"] as const;
export type ArrivalView = (typeof arrivalViews)[number];
export function arrivalRooms(data: PublicData) {
  return data.rooms.filter((room) => /^room-[1-4]$/.test(room));
}
export function arrivalFolder(local: string, fingerprint: string) {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Invalid revision");
  return path.join(local, "arrival", "generated", fingerprint);
}
async function capturedImage(
  data: PublicData,
  room: string,
  view: ArrivalView,
  local: string,
) {
  if (data.mode !== "demo" || !arrivalRooms(data).includes(room)) return null;
  const fingerprint = arrivalFingerprint(data);
  // The previous manually generated cache remains readable when its exact
  // public hanging matches. Every automatic batch lives in an immutable folder.
  for (const folder of [
    arrivalFolder(local, fingerprint),
    path.join(local, "arrival"),
  ]) {
    try {
      const manifest = JSON.parse(
        await readFile(
          /* turbopackIgnore: true */ path.join(folder, "manifest.json"),
          "utf8",
        ),
      );
      if (manifest.fingerprint === fingerprint)
        return await readFile(
          /* turbopackIgnore: true */ path.join(folder, `${room}-${view}.webp`),
        );
    } catch (error) {
      if (
        !(error instanceof SyntaxError) &&
        !["ENOENT", "ENOTDIR"].includes(
          (error as NodeJS.ErrnoException).code || "",
        )
      )
        throw error;
    }
  }
  return null;
}
export async function arrivalReady(data: PublicData, local: string) {
  const rooms = arrivalRooms(data);
  if (
    data.mode !== "demo" ||
    !rooms.length ||
    rooms.length !== data.rooms.length
  )
    return false;
  return (
    await Promise.all(
      rooms.flatMap((room) =>
        arrivalViews.map((view) => capturedImage(data, room, view, local)),
      ),
    )
  ).every(Boolean);
}
const neutralFallbacks = new Map<ArrivalView, Promise<Buffer>>();
async function emptyArrival(
  room: string,
  view: ArrivalView,
  publicRoot: string,
) {
  const validRoom = /^room-[1-4]$/.test(room);
  const names = validRoom ? [`arrival-empty-${room}-${view}.webp`] : [];
  if (room === "room-1" || !validRoom) names.push(`arrival-empty-${view}.webp`);
  for (const name of names) {
    try {
      return await readFile(
        /* turbopackIgnore: true */ path.join(publicRoot, name),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  // Never show another room's architecture while this room has no base capture.
  if (!neutralFallbacks.has(view))
    neutralFallbacks.set(
      view,
      sharp({
        create: {
          width: view === "wide" ? 1600 : 430,
          height: view === "wide" ? 1000 : 932,
          channels: 3,
          background: "#e9e3da",
        },
      })
        .webp({ quality: 80 })
        .toBuffer(),
    );
  return neutralFallbacks.get(view)!;
}
export async function arrivalImage(
  data: PublicData,
  room: string,
  view: ArrivalView,
  local: string,
  publicRoot: string,
) {
  const captured = await capturedImage(data, room, view, local);
  // Empty architecture is the only permissible fallback after any public change.
  return captured ?? emptyArrival(room, view, publicRoot);
}
