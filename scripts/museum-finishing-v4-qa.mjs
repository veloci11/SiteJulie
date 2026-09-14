import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const output =
  process.env.MUSEUM_VIEWS_OUTPUT || "artifacts/finishing-v4/views";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 701, height: 600 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 667, height: 375 },
  ]) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [name, query] of [
      ["hall", "?vue=salle&salle=room-1"],
      ["salon", "?vue=salle&salle=room-2"],
      ["about", "?vue=apropos"],
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
        page.locator(
          ".visit-tour-toggle,.visit-tour-caption,.visit-film-toggle,.visit-motion-setting",
        ),
      ).toHaveCount(0);
      const controls = [];
      if (name === "about" || name === "contact") {
        const modal = page.getByRole("dialog", {
          name:
            name === "about" ? "À propos de l’artiste" : "Contacter l’artiste",
        });
        await expect(modal).toBeVisible();
        const box = await modal.boundingBox();
        expect(
          Math.abs(box.x + box.width / 2 - viewport.width / 2),
        ).toBeLessThan(2);
        expect(
          Math.abs(box.y + box.height / 2 - viewport.height / 2),
        ).toBeLessThan(2);
        expect(box.height).toBeLessThanOrEqual(viewport.height - 32);
        expect(box.width).toBeLessThanOrEqual(viewport.width - 30);
        await modal
          .getByRole("button", { name: "Revenir à la galerie" })
          .click({ trial: true });
        controls.push({ selector: ".visit-editorial", box });
      } else {
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
        for (let i = 1; i < controls.length; i++)
          expect(
            controls[i - 1].box.x + controls[i - 1].box.width,
          ).toBeLessThanOrEqual(controls[i].box.x + 1);
        if (viewport.width > 700 && viewport.height > 520)
          await expect(page.locator(".visit-filmstrip")).toBeVisible();
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
    `${results.length} browser views checked; centered dialogs and accessible dock, no JS errors or overflow.`,
  );
} finally {
  await browser.close();
}
