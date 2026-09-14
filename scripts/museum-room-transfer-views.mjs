import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
// Composition review only. Screenshots add latency: never use this run as FPS proof.
const width = Number(process.env.VIEW_WIDTH || 1440);
const height = Number(process.env.VIEW_HEIGHT || 900);
const output = `artifacts/finishing-v7/transfer-views-${width}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = { viewport: { width, height }, errors: [], transfers: [] };
try {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(
    `${process.env.BASE_URL || "http://127.0.0.1:3000"}/?vue=oeuvre&slug=oeuvre-05`,
  );
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true", {
    timeout: 60000,
  });
  const sample = () =>
    canvas.evaluate((node) => ({
      position: JSON.parse(node.dataset.cameraPosition),
      target: JSON.parse(node.dataset.cameraTarget),
      time: Number(node.dataset.cameraSampleTime),
      navigation: node.dataset.navigationState,
      tour: node.dataset.tourState,
      id: node.dataset.navigationId,
    }));
  for (const [room, sign] of [
    ["room-1", -1],
    ["room-2", 1],
  ]) {
    const transfer = { room, start: await sample(), views: [] };
    report.transfers.push(transfer);
    await page.locator(".visit-next-room").click();
    for (const [name, distance] of [
      ["before-door", -1],
      ["threshold", 0],
      ["inside", 1.5],
      ["joined", null],
    ]) {
      if (distance === null) {
        await expect(canvas).toHaveAttribute(
          "data-navigation-state",
          "arrived",
          { timeout: 20000 },
        );
        await expect(canvas).toHaveAttribute("data-tour-state", "walking");
      } else {
        await page.waitForFunction(
          ({ distance, sign }) => {
            const node = document.querySelector("canvas");
            if (node.dataset.navigationState !== "traveling") return false;
            const position = JSON.parse(node.dataset.cameraPosition);
            return (position[2] - 9) * sign >= distance;
          },
          { distance, sign },
          { polling: "raf", timeout: 20000 },
        );
      }
      const before = await sample();
      const file = `${output}/${room}-${name}.png`;
      await page.screenshot({ path: file });
      const after = await sample();
      // Record the real camera positions bracketing capture. No pose/time mutation,
      // no pause, and no guarantee that an asynchronous screenshot is exactly z=9.
      transfer.views.push({
        name,
        file,
        requestedDoorDistance: distance,
        before,
        after,
      });
    }
    transfer.end = await sample();
  }
  expect(report.errors).toEqual([]);
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
