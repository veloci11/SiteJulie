import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.MUSEUM_QA_URL || "http://127.0.0.1:3011";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  let phase = "museum";
  const requests = new Map();
  cdp.on("Network.responseReceived", ({ requestId, response, timestamp }) => {
    const url = new URL(response.url);
    if (url.pathname.startsWith("/api/media/") || url.pathname.endsWith(".glb"))
      requests.set(requestId, {
        url: url.pathname + url.search,
        phase,
        status: response.status,
        cached: !!response.fromDiskCache,
        bytes: 0,
        timestamp,
      });
  });
  cdp.on("Network.loadingFinished", ({ requestId, encodedDataLength }) => {
    const request = requests.get(requestId);
    if (request) request.bytes = encodedDataLength;
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page
    .locator('canvas[data-renderer-ready="true"]')
    .waitFor({ timeout: 60000 });
  const initial = await page
    .locator("canvas")
    .evaluate((n) => ({ ...n.dataset }));
  const readyMs = await page.evaluate(
    () => performance.getEntriesByName("museum-ready")[0]?.startTime,
  );
  const earlyRequests = [...requests.values()].map((r) => r.url);
  await page
    .locator('canvas[data-all-rooms-ready="true"]')
    .waitFor({ timeout: 60000 });
  await page.screenshot({ path: "artifacts/loading-qa/after-home.png" });
  phase = "catalogue";
  await page
    .getByRole("link", { name: "Voir le catalogue", exact: true })
    .click();
  await page.waitForURL("**/oeuvres");
  // Scroll each row to trigger native lazy images without disabling the browser cache.
  for (const image of await page.locator(".catalogue-image img").all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((n) => n.decode());
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: "artifacts/loading-qa/after-catalogue.png" });
  const list = [...requests.values()];
  const catalogue = list.filter(
    (r) => r.phase === "catalogue" && r.url.includes("variant=room"),
  );
  const report = {
    browser: await browser.version(),
    viewport: { width: 1440, height: 900 },
    network: "local, unthrottled, fresh browser context",
    readyMs,
    initial,
    earlyRequests,
    requests: list,
    catalogueTransferredBytes: catalogue.reduce((sum, r) => sum + r.bytes, 0),
    catalogueResponses: catalogue.length,
    errors,
  };
  await mkdir("artifacts/loading-qa", { recursive: true });
  await writeFile(
    "artifacts/loading-qa/after.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      readyMs,
      initialRooms: initial.loadedRooms,
      catalogueTransferredBytes: report.catalogueTransferredBytes,
      catalogueResponses: catalogue.length,
      errors,
    }),
  );
  if (report.catalogueTransferredBytes !== 0 || errors.length)
    throw new Error("Image cache regression");
} finally {
  await browser.close();
}
