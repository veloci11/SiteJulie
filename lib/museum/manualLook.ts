import type { CameraMotionSample } from "./navigation";

/** Grab the panorama: the scene follows the pointer in both axes.
 * An ordinary 400px drag turns about 65 degrees on a 1440px canvas, rather
 * than the previous 103 degrees. Clamp sensitivity for very wide/narrow views.
 */
export function manualLookSample(
  sample: CameraMotionSample,
  deltaX: number,
  deltaY: number,
  width: number,
): CameraMotionSample {
  const sensitivity = Math.max(
    0.002,
    Math.min(0.0033, (Math.PI * 1.3) / Math.max(1, width)),
  );
  return {
    ...sample,
    yaw: sample.yaw + deltaX * sensitivity,
    pitch: Math.max(
      -0.5,
      Math.min(0.5, sample.pitch + deltaY * sensitivity * 0.8),
    ),
  };
}
