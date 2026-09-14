// CPU plan: npx tsx scripts/museum-decor-views-qa.mjs --cpu-only
// Actual autoplay captures, one browser/page at a time (no camera mutation):
// npx tsx scripts/museum-decor-views-qa.mjs [--mobile]
import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { PerspectiveCamera, Vector3 } from "three";
import {
  createAmbientWalk,
  sampleAmbientWalk,
  ambientTourInsets,
} from "../lib/museum/tour.ts";
import { motionLookTarget } from "../lib/museum/navigation.ts";
import { roomOffset } from "../lib/museum/config.ts";

const output = "artifacts/contemporary/decor-views";
await mkdir(output, { recursive: true });
const store = JSON.parse(
  await readFile(".local/data.json", "utf8").catch(() =>
    readFile(".local/seed.json", "utf8"),
  ),
);
const manifest = JSON.parse(
  await readFile("public/museum/manifest.json", "utf8"),
);
const rooms = [...new Set(store.artworks.map((a) => a.roomId))].sort();
const viewport = process.argv.includes("--mobile")
  ? { width: 390, height: 844 }
  : { width: 1440, height: 900 };
const { width, height } = viewport;
const inset = ambientTourInsets(width, height);
const plans = [];
for (const roomId of rooms) {
  const module = roomId === "room-1" ? "hall" : "extension";
  const walk = createAmbientWalk(roomId, rooms, store.artworks);
  const targets = manifest.obstaclesByModule[module]
    .filter((o) => ["sculpture", "console-sculpture"].includes(o.kind))
    .map((o) => ({ name: o.kind, min: o.min, max: o.max }));
  targets.push({
    name: "front-wall",
    min: [-1.3, 0.8, 8.85],
    max: [1.3, 3.7, 8.85],
  });
  const tree = manifest.treesByModule[module][0];
  targets.push({
    name: "fig-pot",
    min: [
      tree.position[0] - tree.potRadius,
      0,
      tree.position[2] - tree.potRadius,
    ],
    max: [
      tree.position[0] + tree.potRadius,
      tree.potHeight,
      tree.position[2] + tree.potRadius,
    ],
  });
  const shots = targets
    .map((target) => {
      let best;
      for (let step = 30; step < 1000; step++) {
        const phase = step / 1000,
          elapsed = 1 + walk.period * phase;
        const sample = sampleAmbientWalk(walk, elapsed, width, height);
        const camera = new PerspectiveCamera(
          sample.fov,
          width / height,
          0.1,
          120,
        );
        camera.position.fromArray(sample.position);
        camera.lookAt(new Vector3(...motionLookTarget(sample)));
        camera.setViewOffset(
          width,
          height,
          sample.offsetX,
          sample.offsetY,
          width,
          height,
        );
        camera.updateMatrixWorld();
        const corners = [];
        for (const x of [target.min[0], target.max[0]])
          for (const y of [target.min[1], target.max[1]])
            for (const z of [target.min[2], target.max[2]]) {
              const p = new Vector3(x, y, z + roomOffset(roomId)).project(
                camera,
              );
              corners.push({
                x: ((p.x + 1) * width) / 2,
                y: ((1 - p.y) * height) / 2,
                z: p.z,
              });
            }
        const visible =
          corners.filter(
            (p) =>
              p.z > -1 &&
              p.z < 1 &&
              p.x >= inset.left &&
              p.x <= width &&
              p.y >= inset.top &&
              p.y <= height - inset.bottom,
          ).length / corners.length;
        const cx = corners.reduce((sum, p) => sum + p.x, 0) / 8,
          cy = corners.reduce((sum, p) => sum + p.y, 0) / 8;
        const score =
          visible * 5 -
          Math.hypot(
            (cx - (inset.left + width) / 2) / width,
            (cy - (inset.top + height - inset.bottom) / 2) / height,
          );
        if (!best || score > best.score)
          best = {
            name: target.name,
            phase,
            elapsed,
            projectedCornersInsideUsefulArea: visible,
            yawDegrees: ((((sample.yaw * 180) / Math.PI) % 360) + 360) % 360,
            position: sample.position,
            score,
          };
      }
      return best;
    })
    .sort((a, b) => a.elapsed - b.elapsed);
  plans.push({ roomId, periodSeconds: walk.period, shots });
}
await writeFile(
  `${output}/plan-${width}.json`,
  JSON.stringify(
    {
      viewport,
      note: "Projection only; browser captures are needed to judge occlusion and materials.",
      plans,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ viewport, plans }, null, 2));
if (!process.argv.includes("--cpu-only")) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const captures = [];
  try {
    for (const plan of plans) {
      const page = await browser.newPage({
        viewport,
        deviceScaleFactor: 1.5,
        reducedMotion: "no-preference",
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(
        `${process.env.MUSEUM_QA_URL ?? "http://127.0.0.1:3000"}/?vue=salle&salle=${plan.roomId}`,
      );
      const canvas = page.locator("canvas");
      await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
        timeout: 60000,
      });
      for (const shot of plan.shots) {
        await page.waitForFunction(
          (t) =>
            Number(document.querySelector("canvas")?.dataset.tourElapsed) >= t,
          shot.elapsed,
          { timeout: 130000 },
        );
        const actual = await canvas.evaluate((node) => ({ ...node.dataset }));
        expect(Number(actual.tourElapsed) - shot.elapsed).toBeLessThan(1);
        expect(actual.tourState).toBe("walking");
        expect(actual.cameraRoom).toBe(plan.roomId);
        const path = `${output}/${plan.roomId}-${width}-${shot.name}.png`;
        await page.screenshot({ path });
        captures.push({
          roomId: plan.roomId,
          target: shot.name,
          path,
          planned: shot,
          actual,
        });
      }
      expect(errors).toEqual([]);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  await writeFile(
    `${output}/captures-${width}.json`,
    JSON.stringify(captures, null, 2),
  );
}
