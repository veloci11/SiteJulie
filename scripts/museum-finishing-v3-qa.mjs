import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const output = "artifacts/finishing-v3";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 701, height: 600 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [name, query] of [
      ["hall", ""],
      ["salon", "?vue=salle&salle=room-2"],
      ["atelier", "?vue=apropos"],
      ["contact", "?vue=contact"],
    ]) {
      await page.goto(`http://127.0.0.1:3000/${query}`);
      await expect(page.locator(".visit-shell")).toHaveAttribute(
        "data-arrival-state",
        "live",
        { timeout: 60000 },
      );
      await expect(page.locator("canvas")).toHaveAttribute(
        "data-navigation-state",
        "arrived",
      );
      await expect(
        page.locator(".visit-tour-toggle,.visit-tour-caption"),
      ).toHaveCount(0);
      const controls = [];
      for (const selector of [
        ".visit-room-switch",
        ".visit-collection-button",
        ".visit-next-room",
      ]) {
        const button = page.locator(selector);
        await button.click({ trial: true });
        const box = await button.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        expect(box.height).toBeGreaterThanOrEqual(43);
        controls.push({ selector, box });
      }
      for (let index = 1; index < controls.length; index++) {
        expect(
          controls[index - 1].box.x + controls[index - 1].box.width,
        ).toBeLessThanOrEqual(controls[index].box.x + 1);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page.screenshot({
        path: `${output}/${name}-${viewport.width}.png`,
      });
      results.push({
        name,
        viewport,
        controls,
        camera: await page
          .locator("canvas")
          .evaluate((node) => ({ ...node.dataset })),
        errors: [...errors],
      });
    }
    expect(errors).toEqual([]);
    await page.close();
  }
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ browser: browser.version(), results }, null, 2),
  );
  console.log(
    `${results.length} real browser views checked; no JS errors or overlapping dock controls.`,
  );
} finally {
  await browser.close();
}
