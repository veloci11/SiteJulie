import type { Artwork, AdminArtwork } from "@/lib/data/types";
import {
  artworkSize,
  FRAME_OUTSET,
  getSlots,
  type ArtworkSlot,
} from "@/lib/museum/config";

/** Same envelope and frame dimensions in the editor, server validation and renderer. */
export function placementLimits(artwork: Artwork, slot: ArtworkSlot) {
  const size = artworkSize(artwork, slot);
  return {
    horizontal: Math.max(0, (slot.maxWidthM - size.width) / 2),
    vertical: Math.max(0, (slot.maxHeightM - size.height) / 2),
    ...size,
  };
}
export function wallCoordinate(slot: ArtworkSlot) {
  return (
    slot.position[0] * Math.cos(slot.rotationY) -
    slot.position[2] * Math.sin(slot.rotationY)
  );
}
export function wallKey(slot: ArtworkSlot) {
  const angle =
    ((slot.rotationY % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.round(angle / (Math.PI / 2));
}
export function placementIssue(
  artwork: Artwork,
  slot: ArtworkSlot,
  all: readonly AdminArtwork[],
) {
  const ratio = artwork.imageWidth / artwork.imageHeight;
  const scale = artwork.displayScale ?? 1;
  const physicalWidth = artwork.widthCm
    ? (artwork.widthCm / 100) * scale
    : artwork.heightCm
      ? (artwork.heightCm / 100) * ratio * scale
      : null;
  if (
    physicalWidth &&
    (physicalWidth > slot.maxWidthM + 0.00001 ||
      physicalWidth / ratio > slot.maxHeightM + 0.00001 ||
      ((artwork.heightCm ?? 0) / 100) * scale > slot.maxHeightM + 0.00001)
  )
    return "Les dimensions physiques dépassent cet emplacement. Réduisez la taille d’accrochage ou choisissez une zone plus grande.";
  const limits = placementLimits(artwork, slot);
  const x = artwork.placementOffsetX ?? 0;
  const y = artwork.placementOffsetY ?? 0;
  if (
    Math.abs(x) > limits.horizontal + 0.00001 ||
    Math.abs(y) > limits.vertical + 0.00001
  )
    return "Le cadre dépasse la zone sûre de ce mur. Réduisez la taille d’accrochage ou recentrez le tableau.";
  const center = wallCoordinate(slot) + x;
  const height = slot.position[1] + y;
  for (const other of all) {
    if (
      other.id === artwork.id ||
      other.publication !== "published" ||
      other.roomId !== artwork.roomId
    )
      continue;
    const otherSlot = getSlots(other.roomId).find((s) => s.id === other.slotId);
    if (!otherSlot || wallKey(otherSlot) !== wallKey(slot)) continue;
    const planeDistance = Math.abs(
      slot.wallNormal.reduce(
        (sum, n, i) => sum + n * (slot.position[i] - otherSlot.position[i]),
        0,
      ),
    );
    if (planeDistance > 0.1) continue;
    const otherSize = artworkSize(other, otherSlot);
    const dx = Math.abs(
      center - wallCoordinate(otherSlot) - (other.placementOffsetX ?? 0),
    );
    const dy = Math.abs(
      height - otherSlot.position[1] - (other.placementOffsetY ?? 0),
    );
    if (
      dx < (limits.width + otherSize.width) / 2 + FRAME_OUTSET + 0.04 &&
      dy < (limits.height + otherSize.height) / 2 + FRAME_OUTSET + 0.04
    )
      return `Le cadre chevauche « ${other.title} ». Laissez au moins 4 cm entre les cadres.`;
  }
  return null;
}

/** Pointer motion and keyboard offsets use the same centimetre precision/bounds. */
export function dragPlacementOffsets(
  artwork: Artwork,
  slot: ArtworkSlot,
  origin: { x: number; y: number },
  delta: { x: number; y: number },
  viewport: { width: number; height: number },
) {
  const limits = placementLimits(artwork, slot);
  const roundAndClamp = (value: number, limit: number) => {
    const centimetres = Math.floor(limit * 100);
    return (
      Math.max(-centimetres, Math.min(centimetres, Math.round(value * 100))) /
      100
    );
  };
  return {
    placementOffsetX: roundAndClamp(
      origin.x +
        (viewport.width > 0
          ? (delta.x / viewport.width) * (slot.maxWidthM + FRAME_OUTSET)
          : 0),
      limits.horizontal,
    ),
    placementOffsetY: roundAndClamp(
      origin.y -
        (viewport.height > 0
          ? (delta.y / viewport.height) * (slot.maxHeightM + FRAME_OUTSET)
          : 0),
      limits.vertical,
    ),
  };
}
