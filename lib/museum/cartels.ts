import type { Artwork } from "@/lib/data/types";
import {
  artworkSize,
  slotForArtwork,
  FRAME_OUTSET,
  CARTEL_WIDTH,
  CARTEL_HEIGHT,
  CARTEL_GAP,
} from "./config";
import { wallCoordinate, wallKey } from "@/lib/validation/placement";

/** Dense hanging must never put a title plate behind another painting. The
 * artwork title remains available in its detail panel and the collection list. */
export function visibleCartels(artworks: readonly Artwork[]) {
  const frames = artworks.flatMap((artwork) => {
    const slot = slotForArtwork(artwork);
    if (!slot) return [];
    const size = artworkSize(artwork, slot);
    return [
      {
        artwork,
        slot,
        x: wallCoordinate(slot),
        y: slot.position[1],
        width: size.width + FRAME_OUTSET,
        height: size.height + FRAME_OUTSET,
        imageHeight: size.height,
      },
    ];
  });
  type Rect = (typeof frames)[number];
  const sameWall = (a: Rect, b: Rect) =>
    a.artwork.roomId === b.artwork.roomId &&
    wallKey(a.slot) === wallKey(b.slot) &&
    Math.abs(
      a.slot.wallNormal.reduce(
        (n, v, i) => n + v * (a.slot.position[i] - b.slot.position[i]),
        0,
      ),
    ) < 0.1;
  const overlaps = (a: Rect, b: Rect) =>
    sameWall(a, b) &&
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 0.02 &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 0.02;
  const visible = new Set<string>();
  const labels: Rect[] = [];
  for (const frame of frames) {
    const label = {
      ...frame,
      y: frame.y - frame.imageHeight / 2 - CARTEL_GAP,
      width: CARTEL_WIDTH,
      height: CARTEL_HEIGHT,
    };
    if (
      frames.some((other) => overlaps(label, other)) ||
      labels.some((other) => overlaps(label, other))
    )
      continue;
    visible.add(frame.artwork.id);
    labels.push(label);
  }
  return visible;
}
