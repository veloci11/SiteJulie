import { expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { ambientWalkPosterPose, createAmbientWalk } from "@/lib/museum/tour";

it("matches the captured opening under CSS cover, including wide desktop screens", () => {
  for (const room of ["room-1", "room-2"]) {
    const walk = createAmbientWalk(room, ["room-1", "room-2"], []);
    for (const [width, height] of [
      [1440, 900],
      [1728, 1084],
      [1920, 1080],
      [2560, 1080],
      [390, 844],
      [667, 375],
    ]) {
      const portrait = width <= 700 && height >= width;
      const [rw, rh] = portrait ? [430, 932] : [1600, 1000];
      const camera = (w: number, h: number) => {
        const pose = ambientWalkPosterPose(walk, w, h);
        const c = new PerspectiveCamera(pose.fov, w / h, 0.1, 260);
        c.position.fromArray(pose.position);
        c.lookAt(new Vector3(...pose.target));
        c.setViewOffset(w, h, pose.offsetPx, pose.offsetYPx, w, h);
        c.updateMatrixWorld();
        return c;
      };
      const reference = camera(rw, rh),
        live = camera(width, height);
      const scale = Math.max(width / rw, height / rh);
      for (const local of [
        [-2, 1, -8],
        [0, -1, -6],
        [2, 2, -10],
      ]) {
        const world = reference.localToWorld(new Vector3(...local));
        const a = world.clone().project(reference),
          b = world.clone().project(live);
        const expectedX =
          (((a.x + 1) * rw) / 2) * scale - (rw * scale - width) / 2;
        const expectedY =
          (((1 - a.y) * rh) / 2) * scale - (rh * scale - height) / 2;
        expect(((b.x + 1) * width) / 2).toBeCloseTo(expectedX, 6);
        expect(((1 - b.y) * height) / 2).toBeCloseTo(expectedY, 6);
      }
    }
  }
});
