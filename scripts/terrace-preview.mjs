import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:3000/?vue=terrasse");
await page
  .getByRole("heading", { name: "Un souffle de lumière." })
  .waitFor({ timeout: 60000 });
await page
  .locator('canvas[data-navigation-state="arrived"]')
  .waitFor({ timeout: 60000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: "artifacts/museum/terrace-desktop.png" });
const previewStyle = await page.addStyleTag({
  content:
    ".visit-header,.visit-dock,.visit-scene> :not(.canvas-wrap){visibility:hidden!important}",
});
await sharp(await page.locator("canvas").screenshot())
  .resize(1000, 500, { fit: "cover" })
  .webp({ quality: 85 })
  .toFile("public/museum/preview-terrace.webp");
await previewStyle.evaluate((style) => style.remove());
console.log(
  await page.locator("canvas").evaluate((c) => ({ ...c.dataset })),
  errors,
);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(2000);
await page.screenshot({ path: "artifacts/museum/terrace-mobile.png" });
await browser.close();
