import { PerspectiveCamera, Vector3 } from "three";
import type { Artwork } from "../data/types";
import {
  artworkSize,
  slotForArtwork,
  FRAME_OUTSET,
  FRAME_FRONT_DEPTH,
} from "./config";
import { motionLookTarget, type CameraMotionSample } from "./navigation";
import { overviewFov, overviewLensOffset } from "./tour";
import { hangingGroups } from "./hangingGroups";

export interface ViewInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Keep the captured lens at departure, then settle into walking reservations.
 * The zero starting velocity/acceleration avoids a pan or zoom as the poster fades.
 * This applies only to the initial visit, never an artwork focus or mouse release.
 */
export function openingLensTarget(
  target: { fov: number; offsetX: number; offsetY: number },
  width: number,
  height: number,
  elapsed: number,
) {
  const u = Math.max(0, Math.min(1, elapsed / 18));
  const blend = u * u * u * (10 + u * (-15 + 6 * u));
  const offset = overviewLensOffset(width, height);
  const fov = overviewFov(width, height);
  return {
    fov: fov + (target.fov - fov) * blend,
    offsetX: offset.x + (target.offsetX - offset.x) * blend,
    offsetY: offset.y + (target.offsetY - offset.y) * blend,
  };
}

/** Reserve the automatic artwork card before it mounts. Its arrival, hover or
 * replacement must not change the lens. CSS and framing share pixel variables;
 * zero is intentional where the card is hidden on a compact viewport.
 */
export function automaticTourInsets(
  shell: HTMLElement | null,
  width: number,
  height: number,
  canvasBottom: number,
): ViewInsets {
  const shortLandscape = height <= 520 && width > height;
  const portrait = width <= 700 && !shortLandscape;
  const hidden = width <= 700 || (shortLandscape && width <= 1000);
  const style = shell ? getComputedStyle(shell) : null;
  const pixelValue = (name: string, fallback: number) => {
    const value = Number.parseFloat(style?.getPropertyValue(name) ?? "");
    return Number.isFinite(value) ? Math.max(0, value) : fallback;
  };
  const previewWidth = pixelValue(
    "--tour-preview-width",
    hidden ? 0 : shortLandscape ? 300 : 280,
  );
  const previewEdge = pixelValue(
    "--tour-preview-edge",
    hidden ? 0 : shortLandscape ? 14 : 24,
  );
  const dock = shell?.querySelector(".visit-dock")?.getBoundingClientRect();
  return {
    top: portrait ? 128 : 100,
    bottom: Math.max(16, canvasBottom - (dock?.top ?? canvasBottom - 16) + 12),
    left: 16,
    right: previewWidth + previewEdge + 16,
  };
}

/** Fit the paintings ahead without moving the collision-checked walking route. */
export function automaticLens(
  sample: CameraMotionSample,
  artworks: Artwork[],
  width: number,
  height: number,
  inset: ViewInsets,
  maxFov = 170,
) {
  const camera = new PerspectiveCamera();
  camera.position.fromArray(sample.position);
  camera.lookAt(new Vector3(...motionLookTarget(sample)));
  camera.updateMatrixWorld();
  const freeWidth = Math.max(1, width - inset.left - inset.right);
  const freeHeight = Math.max(1, height - inset.top - inset.bottom);
  const baseTangent = Math.tan((overviewFov(width, height) * Math.PI) / 360);
  let tangent = baseTangent;
  let closest = Infinity;
  for (const group of hangingGroups(artworks)) {
    const center = new Vector3(...group.position).applyMatrix4(
      camera.matrixWorldInverse,
    );
    // Peripheral paintings naturally enter/leave the view. Reserve the complete
    // frame of those ahead, anticipating their approach before they fill the view.
    if (center.z >= -0.3 || Math.abs(center.x / center.z) > 0.65) continue;
    const facing = group.normal.reduce(
      (sum, n, i) => sum + n * (sample.position[i] - group.position[i]),
      0,
    );
    if (facing <= 0) continue;
    const score = Math.hypot(center.x / center.z, center.y / center.z);
    if (score >= closest) continue;
    closest = score;
    tangent = baseTangent;
    for (const artwork of group.artworks) {
      const slot = slotForArtwork(artwork)!;
      const size = artworkSize(artwork, slot);
      for (const x of [-1, 1])
        for (const y of [-1, 1]) {
          const corner = new Vector3(
            slot.position[0] +
              slot.wallNormal[0] * FRAME_FRONT_DEPTH +
              (Math.cos(slot.rotationY) * x * (size.width + FRAME_OUTSET)) / 2,
            slot.position[1] + (y * (size.height + FRAME_OUTSET)) / 2,
            slot.position[2] +
              slot.wallNormal[2] * FRAME_FRONT_DEPTH -
              (Math.sin(slot.rotationY) * x * (size.width + FRAME_OUTSET)) / 2,
          ).applyMatrix4(camera.matrixWorldInverse);
          if (corner.z >= -0.1) continue;
          tangent = Math.max(
            tangent,
            (1.14 * Math.abs(corner.x / corner.z) * height) / freeWidth,
            (1.14 * Math.abs(corner.y / corner.z) * height) / freeHeight,
          );
        }
    }
  }
  return {
    fov: Math.min(maxFov, (Math.atan(tangent) * 360) / Math.PI),
    offsetX: (inset.right - inset.left) / 2,
    offsetY: (inset.bottom - inset.top) / 2,
  };
}
