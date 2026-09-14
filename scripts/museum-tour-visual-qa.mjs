// Run after the production build: npx tsx scripts/museum-tour-visual-qa.mjs
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  createAmbientWalk,
  sampleAmbientWalk,
  visibleWalkArtwork,
  ambientTourInsets,
} from "../lib/museum/tour.ts";
import {
  artworkSize,
  slotForArtwork,
  FRAME_OUTSET,
  FRAME_FRONT_DEPTH,
} from "../lib/museum/config.ts";
import { PerspectiveCamera, Vector3 } from "three";
import { distance, motionLookTarget } from "../lib/museum/navigation.ts";

const directory = "artifacts/interior-tour";
await mkdir(directory, { recursive: true });
const store = JSON.parse(
  await readFile(".local/data.json", "utf8").catch(() =>
    readFile(".local/seed.json", "utf8"),
  ),
);
const rooms = [...new Set(store.artworks.map((a) => a.roomId))].sort();
const artworks = store.artworks.filter((a) => a.roomId === "room-1");
const walk = createAmbientWalk("room-1", rooms, artworks);
const cpu = [];
for (const roomId of rooms) {
  const roomArtworks = store.artworks.filter((a) => a.roomId === roomId),
    route = createAmbientWalk(roomId, rooms, roomArtworks);
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [320, 568],
    [667, 375],
  ]) {
    const inset = ambientTourInsets(width, height),
      seen = {};
    let centerCount = 0,
      frameCount = 0,
      fullFrameCount = 0,
      peakRate = 0,
      peakAcceleration = 0;
    const count = 1200;
    for (let i = 0; i < count; i++) {
      const sample = sampleAmbientWalk(
        route,
        1 + route.period + (route.period * i) / count,
        width,
        height,
      );
      const previous = sampleAmbientWalk(
        route,
        1 + route.period + (route.period * i) / count - 0.01,
        width,
        height,
      );
      const next = sampleAmbientWalk(
        route,
        1 + route.period + (route.period * i) / count + 0.01,
        width,
        height,
      );
      peakAcceleration = Math.max(
        peakAcceleration,
        ((Math.hypot(
          next.yawVelocity - previous.yawVelocity,
          next.pitchVelocity - previous.pitchVelocity,
        ) /
          0.02) *
          180) /
          Math.PI,
      );
      const id = visibleWalkArtwork(sample, roomArtworks, width, height, null);
      if (id) {
        centerCount++;
        seen[id] = (seen[id] ?? 0) + route.period / count;
      }
      peakRate = Math.max(
        peakRate,
        (Math.hypot(sample.yawVelocity, sample.pitchVelocity) * 180) / Math.PI,
      );
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
      let anyFrame = false,
        fullFrame = false;
      for (const artwork of roomArtworks) {
        const slot = slotForArtwork(artwork),
          size = artworkSize(artwork, slot);
        if (
          slot.wallNormal.reduce(
            (sum, v, axis) =>
              sum + v * (sample.position[axis] - slot.position[axis]),
            0,
          ) <= 0
        )
          continue;
        const corners = [-1, 1].flatMap((x) =>
          [-1, 1].map((y) => {
            const point = new Vector3(
              (x * (size.width + FRAME_OUTSET)) / 2,
              (y * (size.height + FRAME_OUTSET)) / 2,
              FRAME_FRONT_DEPTH,
            )
              .applyAxisAngle(new Vector3(0, 1, 0), slot.rotationY)
              .add(new Vector3(...slot.position))
              .project(camera);
            return {
              x: ((point.x + 1) * width) / 2,
              y: ((1 - point.y) * height) / 2,
              z: point.z,
            };
          }),
        );
        if (corners.some((p) => p.z < -1 || p.z > 1)) continue;
        const minX = Math.min(...corners.map((p) => p.x)),
          maxX = Math.max(...corners.map((p) => p.x));
        const minY = Math.min(...corners.map((p) => p.y)),
          maxY = Math.max(...corners.map((p) => p.y));
        const intersectWidth = Math.max(
          0,
          Math.min(maxX, width - inset.right) - Math.max(minX, inset.left),
        );
        const intersectHeight = Math.max(
          0,
          Math.min(maxY, height - inset.bottom) - Math.max(minY, inset.top),
        );
        if (intersectWidth * intersectHeight >= 100) anyFrame = true;
        if (
          corners.every(
            (p) =>
              p.x >= inset.left &&
              p.x <= width - inset.right &&
              p.y >= inset.top &&
              p.y <= height - inset.bottom,
          )
        )
          fullFrame = true;
      }
      if (anyFrame) frameCount++;
      if (fullFrame) fullFrameCount++;
    }
    cpu.push({
      roomId,
      width,
      height,
      periodSeconds: route.period,
      speedMetresPerSecond: route.speed,
      samples: count,
      cycle: "steady second cycle, initial panorama excluded",
      centerVisibleFraction: centerCount / count,
      frameBoundsIntersectFraction: frameCount / count,
      fullFrameInsideFraction: fullFrameCount / count,
      secondsPerArtworkCenter: seen,
      peakGazeDegreesPerSecond: peakRate,
      peakGazeAccelerationDegreesPerSecondSquared: peakAcceleration,
    });
  }
}
await writeFile(
  `${directory}/gaze-visibility-cpu.json`,
  JSON.stringify(cpu, null, 2),
);
if (process.argv.includes("--cpu-only")) {
  console.log(JSON.stringify(cpu, null, 2));
  process.exit(0);
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [320, 568],
    [667, 375],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1.5,
      reducedMotion: "no-preference",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:3000/");
    const initialUrl = page.url();
    await page
      .locator('canvas[data-tour-state="walking"]')
      .waitFor({ timeout: 60000 });
    const samples = [];
    // Three real views of a continuous path; screenshots are for composition
    // review, not a claim that every passing picture must fill the free space.
    for (const phase of [0.03, 0.22, 0.43]) {
      await page.waitForFunction(
        (phase) =>
          Number(document.querySelector("canvas")?.dataset.tourProgress) >=
          phase,
        phase,
        { timeout: 30000 },
      );
      const dataset = await page
        .locator("canvas")
        .evaluate((node) => ({ ...node.dataset }));
      const expected = sampleAmbientWalk(
        walk,
        Number(dataset.tourElapsed),
        width,
        height,
      );
      const actual = JSON.parse(dataset.cameraPosition);
      assert(
        distance(actual, expected.position) < 0.0001,
        "rendered position differs from continuous curve",
      );
      assert(
        distance(JSON.parse(dataset.cameraTarget), motionLookTarget(expected)) <
          0.0001,
        "rendered gaze differs from anticipated gaze",
      );
      assert(Math.abs(Number(dataset.cameraFov) - expected.fov) < 0.001);
      assert(Math.abs(Number(dataset.tourYawSpeed)) < 12);
      assert.equal(actual[1], 1.75);
      assert.equal(dataset.cameraRoom, "room-1");
      assert.equal(page.url(), initialUrl);
      assert.equal(
        await page.locator(".visit-details, .visit-editorial").count(),
        0,
      );
      await page.screenshot({
        path: `${directory}/home-${width}x${height}-${phase}.png`,
      });
      samples.push({
        phase: Number(dataset.tourProgress),
        position: actual,
        speed: Number(dataset.tourSpeed),
        yawDegreesPerSecond: Number(dataset.tourYawSpeed),
        artwork: dataset.tourArtwork || null,
      });
    }
    await page.locator(".visit-collection-button").click();
    await page
      .getByRole("checkbox", { name: "Garder une vue fixe à l’accueil" })
      .check();
    await page.keyboard.press("Escape");
    const frozen = await page
      .locator("canvas")
      .getAttribute("data-camera-position");
    await page.waitForTimeout(600);
    assert.equal(
      await page.locator("canvas").getAttribute("data-camera-position"),
      frozen,
    );
    const toggle = await page.locator(".visit-collection-button").boundingBox();
    assert(toggle.width >= 44 && toggle.height >= 44);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      periodSeconds: walk.period,
      samples,
      toggle,
      errors,
    });
    await page.close();
  }
  await writeFile(`${directory}/report.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
