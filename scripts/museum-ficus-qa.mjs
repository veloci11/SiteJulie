// Inspect the real scene with its own CameraDirector, without overriding the camera.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.MUSEUM_QA_URL || "http://127.0.0.1:3011";
const output = process.env.MUSEUM_QA_OUTPUT || "artifacts/ficus-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const width of [1440, 390]) {
    for (const room of ["room-1", "room-2"]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 1440 ? 900 : 844 },
        deviceScaleFactor: 1.5,
        reducedMotion: "reduce",
      });
      const errors = [],
        failedAssets = [],
        loadedTrees = [],
        loadedCompanions = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (/\/museum\/fig-(reading|central)\.glb/.test(response.url()))
          loadedTrees.push({ url: response.url(), status: response.status() });
        if (response.url().includes("/museum/companion-plants.glb"))
          loadedCompanions.push({ url: response.url(), status: response.status() });
        if (response.url().includes("/museum/") && response.status() >= 400)
          failedAssets.push(response.url());
      });
      await page.goto(`${origin}/?vue=salle&salle=${room}`);
      const canvas = page.locator("canvas");
      await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
        timeout: 60000,
      });
      await page
        .locator(".visit-arrival.is-ready")
        .waitFor({ state: "attached", timeout: 60000 });
      await page.waitForTimeout(1200);
      await expect(canvas).toHaveAttribute("data-camera-room", room);
      expect(await page.locator("canvas").count()).toBe(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
      expect(failedAssets).toEqual([]);
      expect(loadedTrees.length).toBeGreaterThanOrEqual(2);
      expect(loadedTrees.every((asset) => asset.status === 200)).toBe(true);
      expect(loadedCompanions.length).toBeGreaterThanOrEqual(1);
      expect(loadedCompanions.every((asset) => asset.status === 200)).toBe(true);
      const path = `${output}/${room}-${width}.png`;
      await page.screenshot({ path });
      await page.addStyleTag({
        content:
          ".visit-header,.visit-dock,.visit-scene>:not(.canvas-wrap){display:none!important}",
      });
      await page.screenshot({ path: `${output}/${room}-${width}-scene.png` });
      results.push({
        room,
        width,
        path,
        errors,
        failedAssets,
        loadedTrees,
        loadedCompanions,
        camera: await canvas.evaluate((node) => ({ ...node.dataset })),
      });
      await page.close();
    }
  }
  await writeFile(
    `${output}/browser-report.json`,
    JSON.stringify({ browser: browser.version(), results }, null, 2),
  );
  console.log(
    "Four real Chrome views: both rooms, desktop and mobile; tree assets loaded, one canvas, no page errors or horizontal overflow.",
  );
} finally {
  await browser.close();
}
