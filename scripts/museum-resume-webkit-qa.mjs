import { webkit, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const output =
  process.env.MUSEUM_QA_OUTPUT ?? "artifacts/finishing-v7/webkit-resume";
await mkdir(output, { recursive: true });
const browser = await webkit.launch();
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor: 2,
      reducedMotion: "no-preference",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:3000/?vue=oeuvre&slug=oeuvre-03");
    const canvas = page.locator("canvas");
    await expect(page.locator(".visit-details")).toBeVisible({
      timeout: 60000,
    });
    await expect(canvas).toHaveAttribute(
      "data-render-quality",
      "webkit-balanced",
    );
    await expect(page.locator(".visit-dock")).toHaveCSS(
      "backdrop-filter",
      "none",
    );
    const buffer = await canvas.evaluate((n) => ({
      width: n.width,
      height: n.height,
      ratio: n.dataset.pixelRatio,
      budget: n.dataset.pixelBudget,
    }));
    expect(Number(buffer.ratio)).toBeLessThanOrEqual(1.25);
    await canvas.click({ position: { x: 12, y: 120 } });
    await expect(page.locator(".visit-details")).toHaveCount(0);
    await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
      timeout: 30000,
    });
    const samples = await canvas.evaluate(
      (node) =>
        new Promise((resolve) => {
          const started = performance.now(),
            records = [];
          let previous = -1;
          function record() {
            const time = Number(node.dataset.cameraSampleTime);
            if (time !== previous) {
              records.push({
                time,
                frames: Number(node.dataset.frameCount),
                drawCalls: Number(node.dataset.drawCalls),
                triangles: Number(node.dataset.triangles),
                position: JSON.parse(node.dataset.cameraPosition),
              });
              previous = time;
            }
            if (performance.now() - started < 7000)
              requestAnimationFrame(record);
            else resolve(records);
          }
          requestAnimationFrame(record);
        }),
    );
    const intervals = samples
      .slice(1)
      .map((s, i) => s.time - samples[i].time)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    const duration = samples.at(-1).time - samples[0].time;
    const stats = {
      presentedSamples: samples.length,
      meanFps: ((samples.length - 1) * 1000) / duration,
      medianFrameMs: intervals[Math.floor(intervals.length * 0.5)],
      p95FrameMs: intervals[Math.floor(intervals.length * 0.95)],
      maxFrameMs: intervals.at(-1),
    };
    await page.screenshot({ path: `${output}/walking-${viewport.width}.png` });
    expect(errors).toEqual([]);
    results.push({
      viewport,
      deviceScaleFactor: 2,
      buffer,
      stats,
      errors,
      samples,
    });
    await page.close();
  }
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        engine:
          "Playwright WebKit, macOS headless; not the Safari app or a physical iPhone",
        version: browser.version(),
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      results.map(({ samples, ...r }) => r),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
