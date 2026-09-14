import type { Artwork } from "@/lib/data/types";
export type Vec3 = [number, number, number];
export interface ArtworkSlot {
  id: string;
  roomId: string;
  position: Vec3;
  rotationY: number;
  wallNormal: Vec3;
  maxWidthM: number;
  maxHeightM: number;
  label: string;
}
export const ROOM_DEPTH = 18;
// Measured from ArtworkFrame: the backing is wider than the visible metal rim.
export const FRAME_OUTSET = 0.17;
export const CARTEL_WIDTH = 0.62;
export const CARTEL_HEIGHT = 0.19;
export const CARTEL_GAP = 0.25;
export const FRAME_FRONT_DEPTH = 0.167;
export const ARTWORK_IMAGE_DEPTH = 0.132;
export const ARTWORK_WALL_CLEARANCE = 0.035;
export function getRoomName(
  roomId: string,
  artworks: readonly Pick<Artwork, "roomId" | "collection">[] = [],
) {
  const names = [
    ...new Map(
      artworks
        .filter((a) => a.roomId === roomId && a.collection.trim())
        .map((a) => [
          a.collection.trim().toLocaleLowerCase("fr"),
          a.collection.trim(),
        ]),
    ).values(),
  ];
  if (names.length === 1) return names[0];
  if (roomId === "room-1") return "La galerie";
  if (roomId === "room-2") return "Le salon";
  return `Salle ${roomId.replace("room-", "")}`;
}
export function roomOffset(roomId: string) {
  return Math.max(0, Number(roomId.replace("room-", "")) - 1) * ROOM_DEPTH;
}
export function getSlots(roomId = "room-1"): ArtworkSlot[] {
  const z = roomOffset(roomId);
  const specs: [number, number, number, number, string][] = [
    [-5.86, 2.65, 6, Math.PI / 2, "Mur gauche · 1"],
    [-5.86, 2.65, 2, Math.PI / 2, "Mur gauche · 2"],
    [-5.86, 2.65, -1.5, Math.PI / 2, "Mur gauche · 3"],
    [-5.86, 2.65, -4, Math.PI / 2, "Mur gauche · 4"],
    [5.86, 2.65, 6, -Math.PI / 2, "Mur droit · 1"],
    [5.86, 2.65, 2, -Math.PI / 2, "Mur droit · 2"],
    [5.86, 2.65, -1.5, -Math.PI / 2, "Mur droit · 3"],
    [5.86, 2.65, -4, -Math.PI / 2, "Mur droit · 4"],
    [-3.5, 2.65, -8.86, 0, "Fond · gauche"],
    [0, 2.65, -8.86, 0, "Fond · centre"],
    [3.5, 2.65, -8.86, 0, "Fond · droit"],
    [3.5, 2.65, 8.86, Math.PI, "Entrée · droite"],
  ];
  if (roomId !== "room-1")
    specs[9] = [-3.5, 2.65, 8.86, Math.PI, "Entrée · gauche"];
  return specs.map(([x, y, s, r, label], i) => ({
    id: `${roomId}-slot-${String(i + 1).padStart(2, "0")}`,
    roomId,
    position: [x, y, s + z],
    rotationY: r,
    wallNormal: [Math.sin(r), 0, Math.cos(r)],
    // Canvas limits exclude the 17cm backing allowance. Slot04/08 lies between
    // the alcove jamb and the pier at z=-3: its nearest edge is only 0.83m away.
    maxWidthM:
      (i === 3 || i === 7
        ? 1.56
        : i === 2 || i === 6
          ? 2.4
          : i === 9 && roomId === "room-1"
            ? 2.97
            : 2.47) - FRAME_OUTSET,
    maxHeightM: 3,
    label,
  }));
}
export function artworkSize(
  artwork: Pick<
    Artwork,
    "imageWidth" | "imageHeight" | "widthCm" | "heightCm" | "displayScale"
  >,
  slot: ArtworkSlot,
) {
  const ratio =
    artwork.imageWidth > 0 && artwork.imageHeight > 0
      ? artwork.imageWidth / artwork.imageHeight
      : 1;
  const scale = artwork.displayScale ?? 1;
  const maxWidth = slot.maxWidthM;
  const maxHeight = slot.maxHeightM;
  let h = Math.min(maxHeight, maxWidth / ratio) * scale;
  let w = h * ratio;
  const physicalWidth = artwork.widthCm
    ? artwork.widthCm / 100
    : artwork.heightCm
      ? (artwork.heightCm / 100) * ratio
      : null;
  if (physicalWidth) {
    const presentedW = physicalWidth * scale;
    const presentedH = presentedW / ratio;
    const fit = Math.min(1, maxWidth / presentedW, maxHeight / presentedH);
    w = presentedW * fit;
    h = presentedH * fit;
  }
  return { width: w, height: h };
}
export function slotForArtwork(a: Artwork) {
  const anchor = getSlots(a.roomId).find((s) => s.id === a.slotId);
  if (!anchor) return undefined;
  // Keep exported anchors immutable. Their origin sits 1cm behind the wall
  // surface; the frame back needs an explicit air gap in front of that face.
  return {
    ...anchor,
    position: anchor.position.map(
      (v, i) =>
        v +
        anchor.wallNormal[i] * ARTWORK_WALL_CLEARANCE +
        (i === 0
          ? Math.cos(anchor.rotationY) * (a.placementOffsetX ?? 0)
          : i === 1
            ? (a.placementOffsetY ?? 0)
            : -Math.sin(anchor.rotationY) * (a.placementOffsetX ?? 0)),
    ) as Vec3,
  };
}
