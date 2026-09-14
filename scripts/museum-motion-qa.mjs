import { chromium, expect } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";

await mkdir("artifacts/finishing-v4/motion", { recursive: true });
// Record the actual renderer; the separate E2E suite also covers software WebGL.
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:3000/?vue=salle&salle=room-1");
  await page
    .getByRole("button", { name: "Découvrir les œuvres" })
    .waitFor({ timeout: 60000 });
  await expect(page.locator("picture.visit-arrival")).toHaveClass(/is-ready/, {
    timeout: 60000,
  });
  await expect(page.locator(".visit-film-card")).toHaveCount(4);
  await page.waitForTimeout(1600);
  const renderer = await page.locator("canvas").evaluate((canvas) => {
    const gl = canvas.getContext("webgl2");
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return extension
      ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  });
  await page.screenshot({
    path: "artifacts/finishing-v4/motion/refined-home-desktop.png",
  });
  const journeys = [];
  async function visit(sequence) {
    await page.evaluate(() => {
      window.__museumFrames = [];
      let previous = "";
      let previousRafTime = null;
      function frame(now) {
        const canvas = document.querySelector("canvas");
        if (canvas?.dataset.frameCount !== previous) {
          previous = canvas?.dataset.frameCount;
          window.__museumFrames.push({
            time: now,
            previousRafTime,
            ...canvas.dataset,
          });
        }
        previousRafTime = now;
        window.__museumFrameRequest = requestAnimationFrame(frame);
      }
      window.__museumFrameRequest = requestAnimationFrame(frame);
    });
    const start = Date.now();
    for (const [i, number] of sequence.entries()) {
      if (number.startsWith("room-")) {
        await page.locator(".visit-next-room").click();
        continue;
      }
      const filmCard = page.locator(".visit-filmstrip").getByRole("button", {
        name: `Découvrir Œuvre ${number}`,
        exact: true,
      });
      if (await filmCard.count()) {
        await filmCard.click();
      } else {
        // Cross-room destinations are accessible through the real eight-work drawer.
        await page.locator(".visit-collection-button").click();
        const collection = page.getByRole("dialog", {
          name: "Les œuvres",
          exact: true,
        });
        await collection
          .getByRole("button", { name: "Toutes les œuvres", exact: true })
          .click();
        await expect(collection.locator(".visit-art-card")).toHaveCount(8);
        await collection
          .getByRole("button", { name: `Choisir Œuvre ${number}`, exact: true })
          .click();
      }
      if (i < sequence.length - 1) await page.waitForTimeout(450);
    }
    const last = sequence.at(-1);
    if (last.startsWith("room-")) {
      await expect(page).toHaveURL(new RegExp(`salle=${last}`));
      await expect(page.locator(".visit-hero")).toBeVisible({ timeout: 30000 });
    } else {
      await page
        .getByRole("complementary", { name: `Fiche de Œuvre ${last}` })
        .waitFor({ timeout: 30000 });
    }
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-navigation-state",
      "arrived",
    );
    if (!last.startsWith("room-"))
      await expect(page).toHaveURL(new RegExp(`slug=oeuvre-${last}`));
    await expect(page.locator(".visit-film-card")).toHaveCount(4);
    const frames = await page.evaluate(() => {
      cancelAnimationFrame(window.__museumFrameRequest);
      return window.__museumFrames;
    });
    const moving = frames.filter(
      (frame) => frame.navigationState === "traveling",
    );
    const intervals = moving
      .slice(1)
      .map((frame, i) => frame.time - moving[i].time)
      .sort((a, b) => a - b);
    const direction = (frame) => {
      const position = JSON.parse(frame.cameraPosition);
      const target = JSON.parse(frame.cameraTarget);
      const vector = target.map((v, i) => v - position[i]);
      const length = Math.hypot(...vector);
      return vector.map((v) => v / length);
    };
    const angularSteps = moving.slice(1).map((frame, i) => {
      const a = direction(moving[i]),
        b = direction(frame);
      const degrees =
        (Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              a.reduce((sum, v, axis) => sum + v * b[axis], 0),
            ),
          ),
        ) *
          180) /
        Math.PI;
      const previous = moving[i];
      // Depending on RAF callback order, the observer reads the current render
      // or the preceding one. Align timestamps before comparing clocks. Adjacent
      // 16.8/16.5 ms frames legitimately differ by .3 ms without any pose jitter.
      const alignmentError = (record) =>
        Math.min(
          Math.abs(Number(record.cameraSampleTime) - record.time),
          record.previousRafTime === null
            ? Infinity
            : Math.abs(
                Number(record.cameraSampleTime) - record.previousRafTime,
              ),
        );
      const displayDeltaMs = frame.time - previous.time;
      const sampleDeltaMs =
        Number(frame.cameraSampleTime) - Number(previous.cameraSampleTime);
      return {
        degrees,
        speed: (degrees * 1000) / displayDeltaMs,
        displayDeltaMs,
        sampleDeltaMs,
        clockDifferenceMs: Math.abs(displayDeltaMs - sampleDeltaMs),
        timestampAlignmentMs: Math.max(
          alignmentError(previous),
          alignmentError(frame),
        ),
        fromFrame: previous.frameCount,
        toFrame: frame.frameCount,
        fromSampleTime: previous.cameraSampleTime,
        toSampleTime: frame.cameraSampleTime,
      };
    });
    const forwardDots = last.startsWith("room-")
      ? moving.slice(1).flatMap((frame, i) => {
          const a = JSON.parse(moving[i].cameraPosition),
            b = JSON.parse(frame.cameraPosition);
          const dx = b[0] - a[0],
            dz = b[2] - a[2],
            moved = Math.hypot(dx, dz);
          if (moved < 0.0001) return [];
          const look = direction(frame),
            horizontal = Math.hypot(look[0], look[2]);
          return [(dx * look[0] + dz * look[2]) / (moved * horizontal)];
        })
      : [];
    journeys.push({
      sequence,
      ...(forwardDots.length
        ? { minForwardDirectionDot: Math.min(...forwardDots) }
        : {}),
      elapsedMs: Date.now() - start,
      frameCount: moving.length,
      medianFrameMs: intervals[Math.floor(intervals.length * 0.5)],
      p95FrameMs: intervals[Math.floor(intervals.length * 0.95)],
      maxFrameMs: intervals.at(-1),
      maxTurnDegreesPerFrame: Math.max(
        0,
        ...angularSteps.map((step) => step.degrees),
      ),
      // Actual display-frame rate. The director also records the RAF timestamp
      // used to sample the curve, so delayed JS callbacks remain auditable.
      maxTurnDegreesPerSecond: Math.max(
        0,
        ...angularSteps.map((step) => step.speed),
      ),
      maxMovingClockDifferenceMs: Math.max(
        0,
        ...angularSteps
          .filter((step) => step.degrees > 0.0001)
          .map((step) => step.clockDifferenceMs),
      ),
      maxPoseTimestampAlignmentMs: Math.max(
        0,
        ...angularSteps
          .filter((step) => step.degrees > 0.0001)
          .map((step) => step.timestampAlignmentMs),
      ),
      worstAngularStep: angularSteps.reduce(
        (worst, step) => (!worst || step.speed > worst.speed ? step : worst),
        null,
      ),
      frames,
    });
    await page.screenshot({
      path: `artifacts/finishing-v4/motion/refined-artwork-${last}.png`,
    });
  }
  await visit(["04"]); // horizontal, cross-room via drawer
  await visit(["08"]); // vertical, return to Visages
  await visit(["06", "07", "08"]); // rapid same-room clicks: last selection wins
  await visit(["05"]); // cross-room to the final public artwork
  await visit(["room-1"]); // return through the actual doorway, facing the walk
  await visit(["room-2"]); // forward through the doorway, then remain still
  const idleStart = await page
    .locator("canvas")
    .getAttribute("data-frame-count");
  await page.waitForTimeout(2000);
  const idleEnd = await page.locator("canvas").getAttribute("data-frame-count");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: "artifacts/finishing-v4/motion/refined-artwork-mobile.png",
  });
  const report = {
    renderer,
    deviceScaleFactor: 2,
    viewport: [1440, 1000],
    clockValidation: {
      alignment:
        "pose timestamp equals current or preceding observer RAF timestamp",
      toleranceMs: 0.0001,
      reason:
        "cameraSampleTime.toFixed(4) rounds by at most .00005 ms; allowance includes floating point subtraction. Unshifted adjacent intervals are descriptive only.",
    },
    errors,
    idleFrames: Number(idleEnd) - Number(idleStart),
    journeys,
  };
  await writeFile(
    "artifacts/finishing-v4/motion/motion-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        ...report,
        journeys: journeys.map(({ frames, ...metrics }) => metrics),
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
  expect(report.idleFrames, "demand rendering remains idle").toBe(0);
  for (const journey of journeys) {
    // Check against presentation time, not a variable callback start time.
    expect(
      journey.maxTurnDegreesPerSecond,
      `${journey.sequence}: displayed angular rate`,
    ).toBeLessThanOrEqual(40.5);
    if (journey.minForwardDirectionDot !== undefined)
      expect(
        journey.minForwardDirectionDot,
        "room change never walks backward",
      ).toBeGreaterThanOrEqual(-0.05);
    expect(
      journey.maxPoseTimestampAlignmentMs,
      `${journey.sequence}: aligned pose/RAF timestamp`,
    ).toBeLessThanOrEqual(0.0001);
  }
} finally {
  await browser.close();
}
