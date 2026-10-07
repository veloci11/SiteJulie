import type { AdminArtwork } from "@/lib/data/types";
import { artworkSize, FRAME_OUTSET } from "@/lib/museum/config";
import { getZones, normalizeZoneArtwork, zoneBounds } from "@/lib/museum/zones";
import { findZonePlacement } from "@/lib/validation/placement";

/** Uncovered hanging surface is a measure, not a count of additional works. */
export function roomCapacity(
  roomId: string,
  artworks: readonly AdminArtwork[],
  rooms: readonly string[],
) {
  const zones = getZones(roomId, rooms);
  const exposed = artworks
    .filter((a) => a.publication === "published" && a.roomId === roomId)
    .map(normalizeZoneArtwork);
  const occupied = new Set(exposed.map((a) => a.slotId));
  const surfaceM2 = zones.reduce((sum, zone) => {
    const bounds = zoneBounds(zone);
    return (
      sum +
      (zone.maxWidthM + FRAME_OUTSET) *
        (bounds.top - bounds.bottom + FRAME_OUTSET)
    );
  }, 0);
  const coveredM2 = exposed.reduce((sum, a) => {
    const zone = zones.find((zone) => zone.id === a.slotId);
    if (!zone) return sum;
    const size = artworkSize(a, zone);
    return sum + (size.width + FRAME_OUTSET) * (size.height + FRAME_OUTSET);
  }, 0);
  return {
    total: zones.length,
    occupiedZones: zones.filter((zone) => occupied.has(zone.id)).length,
    surfaceM2,
    freeSurfaceM2: Math.max(0, surfaceM2 - coveredM2),
  };
}
export type RoomCapacity = ReturnType<typeof roomCapacity>;

/** Only a known image format can establish whether this work fits the room. */
export function roomAcceptsArtwork(
  artwork: AdminArtwork,
  artworks: readonly AdminArtwork[],
  rooms: readonly string[],
): boolean | null {
  if (!artwork.image || artwork.imageWidth < 1 || artwork.imageHeight < 1)
    return null;
  return getZones(artwork.roomId, rooms).some((zone) =>
    Boolean(findZonePlacement(artwork, zone, artworks, true)),
  );
}
