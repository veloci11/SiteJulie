import { webkit, expect } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";

const output =
  process.env.MUSEUM_WEBKIT_OUTPUT || "artifacts/finishing-v5/webkit";
await mkdir(output, { recursive: true });
const browser = await webkit.launch();
const results = [];
const ids = {
  "room-1": ["03", "06", "07", "08"],
  "room-2": ["01", "02", "04", "05"],
};
async function expectRoomFilm(page, room) {
  await expect(page.locator(".visit-film-card")).toHaveCount(4);
  expect(
    await page
      .locator(".visit-film-card")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.artwork)),
  ).toEqual(ids[room].map((id) => `oeuvre-${id}`));
}
async function arrived(page, number, room) {
  await expect(
    page.getByRole("complementary", {
      name: `Fiche de Œuvre ${number}`,
      exact: true,
    }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.locator("picture.visit-arrival")).toHaveClass(/is-ready/);
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-camera-room",
    room,
  );
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-navigation-state",
    "arrived",
  );
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-detail-state",
    "ready",
    { timeout: 30000 },
  );
  await expectRoomFilm(page, room);
  return page.locator("canvas").evaluate((node) => ({ ...node.dataset }));
}
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:3000/?vue=oeuvre&slug=oeuvre-08");
    const vertical = await arrived(page, "08", "room-1");
    const originalCanvas = await page.locator("canvas").elementHandle();
    const canvasBox = await page.locator("canvas").boundingBox();
    expect(canvasBox).toEqual({ x: 0, y: 0, ...viewport });
    await expect(page.locator(".visit-shell")).toHaveCSS(
      "position",
      "relative",
    );
    await expect(page.locator(".visit-header")).toHaveCSS(
      "position",
      "absolute",
    );
    // Trial clicks prove actual hit targets are not covered by WebGL.
    await page.locator(".visit-back").click({ trial: true });
    await page
      .getByRole("button", { name: "Œuvre suivante", exact: true })
      .click({ trial: true });
    await page.screenshot({
      path: `${output}/refined-webkit-${viewport.width}.png`,
    });
    if (viewport.width === 390) {
      // Stress only the visible label; this never changes the saved artwork.
      const heading = page.locator(".visit-details h2");
      const title = await heading.textContent();
      await heading.evaluate((node) => {
        node.textContent = "Titre de vérification volontairement très long";
      });
      const headingBox = await heading.boundingBox();
      const priceBox = await page.locator(".visit-price").boundingBox();
      expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(priceBox.y);
      await expect(heading).toHaveCSS("text-overflow", "ellipsis");
      await page.screenshot({
        path: `${output}/mobile-long-title-layout.png`,
      });
      await heading.evaluate((node, original) => {
        node.textContent = original;
      }, title);
    } else {
      await expect(page.locator(".visit-filmstrip")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Réduire les miniatures" }),
      ).toHaveCount(0);
    }
    await page.locator(".visit-back").click();
    await expect(page.locator(".visit-hero")).toContainText("Visages");
    await expect(
      page.getByRole("button", { name: "Découvrir les œuvres", exact: true }),
    ).toBeVisible();
    await page.locator(".visit-collection-button").click();
    const collection = page.getByRole("dialog", {
      name: "Les œuvres",
      exact: true,
    });
    await expect(collection.locator(".visit-art-card")).toHaveCount(8);
    await collection
      .getByRole("button", { name: "Récits & paysages", exact: true })
      .click();
    await expect(collection.locator(".visit-art-card")).toHaveCount(4);
    await collection
      .getByRole("button", { name: "Choisir Œuvre 04", exact: true })
      .click();
    const horizontal = await arrived(page, "04", "room-2");
    await page.screenshot({
      path: `${output}/refined-webkit-horizontal-${viewport.width}.png`,
    });
    await page
      .getByRole("button", { name: "Œuvre suivante", exact: true })
      .click();
    const next = await arrived(page, "05", "room-2");
    // Next stays within the current collection: 05 ->01.
    await page
      .getByRole("button", { name: "Œuvre suivante", exact: true })
      .click();
    await arrived(page, "01", "room-2");
    await page.goBack();
    await arrived(page, "05", "room-2");
    expect(await page.locator("canvas").boundingBox()).toEqual(canvasBox);
    expect(
      await originalCanvas.evaluate(
        (node) => node === document.querySelector("canvas"),
      ),
    ).toBe(true);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    results.push({
      viewport,
      errors,
      vertical,
      horizontal,
      next,
      overflow,
      stableFullCanvas: true,
      longTitleOrPersistentFilmstrip: true,
      roomFilmIds: ids,
    });
    expect(errors).toEqual([]);
    expect(overflow).toBe(false);
    await page.close();
  }
  await writeFile(
    `${output}/refined-webkit-report.json`,
    JSON.stringify({ engine: browser.version(), results }, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
