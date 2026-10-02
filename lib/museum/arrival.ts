import { createHash } from "node:crypto";
import type { PublicData } from "@/lib/data/types";
import { normalizeCollectionOrder } from "@/lib/data/collections";

// A captured room may contain works visible through a doorway. Bind it to the
// whole public hanging so an old poster cannot expose a removed/changed work.
export function arrivalFingerprint(
  data: Pick<PublicData, "artworks" | "rooms">,
) {
  const artworks = normalizeCollectionOrder(data.artworks, data.rooms)
    .map((a) => ({
      id: a.id,
      title: a.title,
      image: a.image,
      room: a.roomId,
      slot: a.slotId,
      frame: a.frameStyle,
      offsetX: a.placementOffsetX ?? 0,
      offsetY: a.placementOffsetY ?? 0,
      displayScale: a.displayScale ?? 1,
      availability: a.availability,
      collection: a.collection,
      order: a.order,
      width: a.widthCm,
      height: a.heightCm,
      // Old captures with descriptive dimensions used those to size the mesh.
      // Catalogues without dimensions keep their existing valid captures.
      showroomSizing: a.widthCm || a.heightCm ? "independent" : undefined,
      ratio: [a.imageWidth, a.imageHeight],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return createHash("sha256")
    .update(
      JSON.stringify({
        sceneVersion: "contemporary-vaulted-v22-open-60deg-lens",
        rooms: data.rooms,
        artworks,
      }),
    )
    .digest("hex");
}
