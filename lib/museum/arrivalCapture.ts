import sharp from "sharp";
import type { ArrivalCapture } from "./arrivalGeneration";
import { arrivalRooms, arrivalViews } from "./arrivalImage";
import { arrivalFingerprint } from "./arrival";

export const captureArrivalBatch: ArrivalCapture = async (
  data,
  origin,
  stillCurrent,
) => {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    timeout: 20_000,
    args: [
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const timer = setTimeout(() => {
    void browser.close();
  }, 180_000);
  const files = new Map<string, Buffer>();
  try {
    for (const room of arrivalRooms(data))
      for (const view of arrivalViews) {
        if (!(await stillCurrent())) return files;
        const page = await browser.newPage({
          viewport:
            view === "wide"
              ? { width: 1600, height: 1000 }
              : { width: 430, height: 932 },
          deviceScaleFactor: 1.5,
          reducedMotion: "reduce",
          serviceWorkers: "block",
        });
        try {
          // This browser is anonymous, fixed to the local server and cannot create
          // recursive arrival jobs or retrieve arbitrary remote network resources.
          await page.route("**/*", (route) => {
            const url = new URL(route.request().url());
            if (
              url.origin !== origin ||
              url.pathname.startsWith("/api/museum/arrival")
            )
              return route.abort();
            return route.continue();
          });
          await page.goto(
            `${origin}/visite/apercu?room=${room}&fingerprint=${arrivalFingerprint(data)}`,
            {
              waitUntil: "domcontentloaded",
              timeout: 60_000,
            },
          );
          await page
            .locator(
              'canvas[data-navigation-state="arrived"][data-all-rooms-ready="true"]',
            )
            .waitFor({ timeout: 60_000 });
          await page.waitForTimeout(1000);
          await page.addStyleTag({
            content:
              ".visit-header,.visit-dock,.visit-scene>:not(.canvas-wrap){display:none!important}",
          });
          const pixels = await page
            .locator("canvas")
            .screenshot({ timeout: 20_000 });
          const image = await sharp(pixels)
            .resize({
              width: view === "wide" ? 1920 : 720,
              withoutEnlargement: true,
            })
            .webp({ quality: 88, smartSubsample: true })
            .toBuffer();
          files.set(`${room}-${view}.webp`, image);
        } finally {
          await page.close();
        }
      }
    return files;
  } finally {
    clearTimeout(timer);
    await browser.close();
  }
};
