import { test, expect } from "@playwright/test";
for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
  [978, 878],
]) {
  test(`expanded browsing and automatic artwork information at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/?vue=salle&salle=room-1");
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-tour-state",
      "walking",
      { timeout: 60000 },
    );
    await expect(page.locator(".visit-auto-preview")).toBeVisible({
      timeout: 60000,
    });
    await expect(page.locator(".visit-filmstrip")).toBeVisible();
    const canvas = await page.locator("canvas").elementHandle();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const initialDock = await page.locator(".visit-dock").boundingBox();
    expect(initialDock!.width).toBe(Math.min(1080, width - 48));
    expect(initialDock!.height).toBeGreaterThan(180);
    expect(initialDock!.height).toBeLessThan(230);
    await expect
      .poll(async () => {
        const preview = await page
          .locator(".visit-auto-preview")
          .getAttribute("data-artwork-id");
        return (
          preview ===
          (await page.locator("canvas").getAttribute("data-tour-artwork"))
        );
      })
      .toBe(true);
    await page.screenshot({
      path: `artifacts/experience-qa/restored-room-${width}.png`,
    });
    await page.locator(".visit-film-card").first().click();
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-navigation-state",
      "arrived",
      { timeout: 60000 },
    );
    await expect(page.locator(".visit-details")).toBeVisible();
    await expect(page.locator(".visit-filmstrip")).toBeVisible();
    await page.screenshot({
      path: `artifacts/experience-qa/restored-artwork-${width}.png`,
    });
    const detail = await page.locator(".visit-details").boundingBox(),
      dock = await page.locator(".visit-dock").boundingBox();
    expect(detail!.y + detail!.height).toBeLessThanOrEqual(dock!.y);
    const url = page.url();
    await page
      .getByRole("button", { name: "Masquer les informations", exact: true })
      .click();
    await expect(page.locator(".visit-details")).toBeHidden();
    await expect(page).toHaveURL(url);
    await page
      .getByRole("button", { name: "Œuvre suivante", exact: true })
      .click();
    await expect(page.locator(".visit-details")).toBeVisible();
    await expect(page.locator(".visit-artwork-caption")).toHaveCount(0);
    const navigation = page.locator(".visit-navigation");
    await navigation
      .getByRole("link", { name: "À propos", exact: true })
      .click();
    const editorial = page.locator(".visit-editorial[open]");
    await expect(editorial).toBeVisible();
    const header = (await page.locator(".visit-header").boundingBox())!;
    expect((await editorial.boundingBox())!.y).toBeGreaterThan(
      header.y + header.height,
    );
    await expect
      .poll(() =>
        editorial.locator("img").evaluate((image) => {
          const artwork = image as HTMLImageElement;
          return artwork.complete && artwork.naturalWidth > 0;
        }),
      )
      .toBe(true);
    await expect
      .poll(async () => {
        const active = (await navigation
          .getByRole("link", { name: "À propos", exact: true })
          .boundingBox())!;
        const indicator = (await navigation
          .locator(".visit-navigation-indicator")
          .boundingBox())!;
        return Math.abs(active.x - indicator.x);
      })
      .toBeLessThan(2);
    await page.screenshot({
      path: `artifacts/experience-qa/accessible-about-${width}.png`,
    });
    await navigation
      .getByRole("link", { name: "Contact", exact: true })
      .click();
    await expect(editorial).toHaveAttribute(
      "aria-label",
      "Contacter l’artiste",
    );
    await navigation
      .getByRole("link", { name: "Accueil", exact: true })
      .click();
    await expect(page.locator(".visit-editorial")).toBeHidden();
    expect(
      await canvas!.evaluate(
        (node) => node === document.querySelector("canvas"),
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
