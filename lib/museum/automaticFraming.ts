import { PerspectiveCamera, Vector3 } from "three";
import type { Artwork } from "../data/types";
import {
  artworkSize,
  slotForArtwork,
  FRAME_OUTSET,
  FRAME_FRONT_DEPTH,
} from "./config";
import { motionLookTarget, type CameraMotionSample } from "./navigation";
import { overviewFov } from "./tour";

export interface ViewInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Fit the paintings ahead without moving the collision-checked walking route. */
export function automaticLens(
  sample: CameraMotionSample,
  artworks: Artwork[],
  width: number,
  height: number,
  inset: ViewInsets,
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
  for (const artwork of artworks) {
    const slot = slotForArtwork(artwork);
    if (!slot) continue;
    const center = new Vector3(...slot.position).applyMatrix4(
      camera.matrixWorldInverse,
    );
    // Peripheral paintings naturally enter/leave the view. Reserve the complete
    // frame of those ahead, anticipating their approach before they fill the view.
    if (center.z >= -0.3 || Math.abs(center.x / center.z) > 0.65) continue;
    const facing = slot.wallNormal.reduce(
      (sum, n, i) => sum + n * (sample.position[i] - slot.position[i]),
      0,
    );
    if (facing <= 0) continue;
    const score = Math.hypot(center.x / center.z, center.y / center.z);
    if (score >= closest) continue;
    closest = score;
    tangent = baseTangent;
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
  return {
    fov: Math.min(170, (Math.atan(tangent) * 360) / Math.PI),
    offsetX: (inset.right - inset.left) / 2,
    offsetY: (inset.bottom - inset.top) / 2,
  };
}
