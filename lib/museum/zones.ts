import type { Artwork } from "@/lib/data/types";
import { artworkSize, getSlots, type ArtworkSlot } from "./config";

/** Legacy lower anchors remain readable, but both belong to one hanging zone. */
export function zoneSlot(slot: ArtworkSlot) {
  return slot.anchorIndex ? getSlots(slot.roomId)[slot.anchorIndex - 1] : slot;
}
export function getZones(roomId: string, rooms?: readonly string[]) {
  return getSlots(roomId).filter(
    (slot) =>
      !slot.anchorIndex &&
      (!slot.terminalOnly || !rooms || rooms.at(-1) === roomId),
  );
}
export function zoneBounds(slot: ArtworkSlot) {
  const zone = zoneSlot(slot);
  const paired =
    zone.roomId === "room-1" && ["02", "06"].includes(zone.id.slice(-2));
  return {
    zone,
    halfWidth: zone.maxWidthM / 2,
    bottom: paired ? 0.9 : zone.position[1] - zone.maxHeightM / 2,
    top: zone.position[1] + zone.maxHeightM / 2,
  };
}
/** Reading/converting an old A2 bas/B2 bas never moves or resizes its image. */
export function normalizeZoneArtwork<T extends Artwork>(artwork: T): T {
  const old = getSlots(artwork.roomId).find(
    (slot) => slot.id === artwork.slotId,
  );
  if (!old?.anchorIndex) return artwork;
  const zone = zoneSlot(old);
  const size = artworkSize(artwork, old);
  const base = artworkSize({ ...artwork, displayScale: 1 }, zone);
  return {
    ...artwork,
    slotId: zone.id,
    placementOffsetY:
      (artwork.placementOffsetY ?? 0) + old.position[1] - zone.position[1],
    displayScale: size.height / base.height,
  };
}
