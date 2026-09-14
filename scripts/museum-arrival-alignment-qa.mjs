import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Run after capture-arrival.ts against the compiled local scene. Real browser
// captures compare object-fit:cover with the first live, stationary camera.
const output = "artifacts/arrival-alignment";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 667, height: 375 },
    { width: 650, height: 550 },
  ]) {
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor: 1.5,
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("**/museum/*.glb", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto("http://127.0.0.1:3000/", {
      waitUntil: "domcontentloaded",
    });
    await page.addStyleTag({
      content:
        ".visit-header,.visit-dock,.visit-scene>:not(.canvas-wrap):not(.visit-arrival){display:none!important}",
    });
    await expect
      .poll(() =>
        page
          .locator(".visit-arrival img")
          .evaluate((img) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    const poster = await page.screenshot({
      path: `${output}/poster-${viewport.width}.png`,
    });
    release();
    await expect(page.locator(".visit-shell")).toHaveAttribute(
      "data-arrival-state",
      "live",
      { timeout: 60000 },
    );
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-navigation-state",
      "arrived",
    );
    const live = await page.screenshot({
      path: `${output}/live-${viewport.width}.png`,
    });
    const a = await sharp(poster).removeAlpha().raw().toBuffer();
    const b = await sharp(live).removeAlpha().raw().toBuffer();
    expect(a.length).toBe(b.length);
    let absolute = 0,
      strongDifference = 0;
    for (let i = 0; i < a.length; i += 3) {
      const delta =
        (Math.abs(a[i] - b[i]) +
          Math.abs(a[i + 1] - b[i + 1]) +
          Math.abs(a[i + 2] - b[i + 2])) /
        3;
      absolute += delta;
      if (delta > 25) strongDifference++;
    }
    const pixels = a.length / 3;
    const metrics = {
      viewport,
      meanAbsoluteChannelDifference: absolute / pixels,
      pixelsOver25Percent: (strongDifference / pixels) * 100,
      errors,
      camera: await page
        .locator("canvas")
        .evaluate((node) => ({
          position: node.dataset.cameraPosition,
          target: node.dataset.cameraTarget,
          fov: node.dataset.cameraFov,
        })),
    };
    results.push(metrics);
    console.log(JSON.stringify(metrics));
    expect(errors).toEqual([]);
    await page.close();
  }
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      { browser: browser.version(), deviceScaleFactor: 1.5, results },
      null,
      2,
    ),
  );
  // Encoding, antialiasing and adaptive detail permit small local differences;
  // this threshold rejects a different view. Inspect the saved pairs as well.
  for (const row of results)
    expect(row.meanAbsoluteChannelDifference).toBeLessThan(10);
} finally {
  await browser.close();
}
