import { chromium } from "@playwright/test";
import sharp from "sharp";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log(m.text().slice(0, 500));
});
for (const [name, url] of [
  ["home", "/"],
  ["salon", "/?vue=salle&salle=room-2"],
  ["art", "/?vue=oeuvre&slug=oeuvre-01"],
  ["contact", "/?vue=contact"],
]) {
  await page.goto("http://127.0.0.1:3000" + url);
  await page
    .locator('canvas[data-navigation-state="arrived"]')
    .waitFor({ timeout: 60000 });
  await page
    .locator(".visit-loading")
    .waitFor({ state: "hidden", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `artifacts/museum/warm-${name}.png` });
  if (name === "home" || name === "salon") {
    // Room-picker assets show the architecture only; evidence above keeps the UI.
    const previewStyle = await page.addStyleTag({
      content:
        ".visit-header,.visit-dock,.visit-scene> :not(.canvas-wrap){visibility:hidden!important}",
    });
    await sharp(await page.locator("canvas").screenshot())
      .resize(800, 500, { fit: "cover" })
      .webp({ quality: 85 })
      .toFile(`public/museum/preview-room-${name === "home" ? 1 : 2}.webp`);
    await previewStyle.evaluate((style) => style.remove());
  }
  console.log(
    name,
    await page.locator("canvas").evaluate((c) => ({ ...c.dataset })),
  );
}
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://127.0.0.1:3000/?vue=oeuvre&slug=oeuvre-01");
await page
  .locator('canvas[data-navigation-state="arrived"]')
  .waitFor({ timeout: 60000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: "artifacts/museum/warm-mobile.png" });
console.log("errors", errors);
await browser.close();
