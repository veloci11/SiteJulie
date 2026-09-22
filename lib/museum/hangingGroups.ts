import type { Artwork } from "@/lib/data/types";
import { artworkSize, slotForArtwork, FRAME_OUTSET, type Vec3 } from "./config";
import { zoneSlot } from "./zones";

/** Walking looks at the whole hanging, while selection still targets one ID. */
export function hangingGroups(artworks: readonly Artwork[]) {
  const groups = new Map<
    string,
    {
      id: string;
      roomId: string;
      artworks: Artwork[];
      min: Vec3;
      max: Vec3;
      normal: Vec3;
    }
  >();
  for (const artwork of artworks) {
    const slot = slotForArtwork(artwork);
    if (!slot) continue;
    const key = zoneSlot(slot).id;
    const group = groups.get(key) ?? {
      id: key,
      roomId: artwork.roomId,
      artworks: [],
      min: [Infinity, Infinity, Infinity] as Vec3,
      max: [-Infinity, -Infinity, -Infinity] as Vec3,
      normal: slot.wallNormal,
    };
    group.artworks.push(artwork);
    const size = artworkSize(artwork, slot);
    const extent = [
      (Math.abs(Math.cos(slot.rotationY)) * (size.width + FRAME_OUTSET)) / 2,
      (size.height + FRAME_OUTSET) / 2,
      (Math.abs(Math.sin(slot.rotationY)) * (size.width + FRAME_OUTSET)) / 2,
    ];
    for (let i = 0; i < 3; i++) {
      group.min[i] = Math.min(group.min[i], slot.position[i] - extent[i]);
      group.max[i] = Math.max(group.max[i], slot.position[i] + extent[i]);
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    position: group.min.map((v, i) => (v + group.max[i]) / 2) as Vec3,
  }));
}
