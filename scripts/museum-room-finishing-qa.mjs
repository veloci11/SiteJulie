// Targeted browser review of the inter-room ceiling seam and portrait cartel.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const output = "artifacts/contemporary/finishing";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1.5 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:3000/");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
      timeout: 60000,
    });
    const samples = [];
    for (const phase of [0.22, 0.56]) {
      await page.waitForFunction(
        (phase) =>
          Number(document.querySelector("canvas")?.dataset.tourProgress) >=
          phase,
        phase,
        { timeout: 40000 },
      );
      samples.push(await canvas.evaluate((node) => ({ ...node.dataset })));
      await page.screenshot({
        path: `${output}/walk-${viewport.width}-${phase}.png`,
      });
    }
    await page.locator(".visit-collection-button").click();
    await page
      .getByRole("checkbox", { name: "Garder une vue fixe à l’accueil" })
      .check();
    await page.keyboard.press("Escape");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("http://127.0.0.1:3000/?vue=oeuvre&slug=oeuvre-03");
    await expect(
      page.getByRole("complementary", { name: "Fiche de Œuvre 03" }),
    ).toBeVisible({ timeout: 60000 });
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-detail-state",
      "ready",
      { timeout: 30000 },
    );
    await page.screenshot({
      path: `${output}/portrait-cartel-${viewport.width}.png`,
    });
    expect(errors).toEqual([]);
    results.push({ viewport, samples, errors });
    await page.close();
  }
  await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
  console.log(
    JSON.stringify(
      results.map(({ viewport, errors }) => ({ viewport, errors })),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
