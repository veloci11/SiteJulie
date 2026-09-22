import type { Artwork } from "@/lib/data/types";
import { artworkSize, type ArtworkSlot } from "./config";

/** Percentages are a UI reference; stored scale keeps its stable wall geometry. */
export function showroomReference(artwork: Artwork, slot: ArtworkSlot) {
  const base = artworkSize({ ...artwork, displayScale: 1 }, slot);
  const scales = [
    artwork.widthCm ? artwork.widthCm / 100 / base.width : null,
    artwork.heightCm ? artwork.heightCm / 100 / base.height : null,
  ].filter((n): n is number => n !== null && Number.isFinite(n) && n > 0);
  const scale = scales.length ? Math.min(...scales) : 1;
  return {
    scale,
    width: base.width * scale,
    height: base.height * scale,
    real: scales.length > 0,
    percentage: ((artwork.displayScale ?? 1) / scale) * 100,
    ratioMismatch:
      !!(artwork.widthCm && artwork.heightCm) &&
      Math.abs(
        artwork.widthCm / artwork.heightCm / (base.width / base.height) - 1,
      ) > 0.002,
  };
}
