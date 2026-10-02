import { expect, test, type Page, type Locator } from "@playwright/test";

async function assertBarsAvailable(page: Page, window: Locator) {
  const header = (await page.locator(".visit-header").boundingBox())!;
  const dock = (await page.locator(".visit-dock").boundingBox())!;
  await expect
    .poll(async () => {
      const bounds = (await window.boundingBox())!;
      return (
        bounds.y >= header.y + header.height &&
        bounds.y + bounds.height <= dock.y
      );
    })
    .toBe(true);
  for (const selector of [
    ".visit-navigation a",
    ".visit-room-switch",
    ".visit-film-card",
  ]) {
    const button = page.locator(selector).first();
    const bounds = (await button.boundingBox())!;
    expect(
      await button.evaluate(
        (node, point) => {
          return (
            !node.closest("[inert]") &&
            node.contains(document.elementFromPoint(point.x, point.y))
          );
        },
        { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      ),
    ).toBe(true);
  }
}

for (const width of [1440, 978]) {
  test(`both navigation bars stay available in every window at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
      timeout: 60000,
    });
    await expect(page.locator(".visit-filmstrip")).toBeVisible();
    const original = await canvas.elementHandle();
    const navigation = page.locator(".visit-navigation");
    const editorial = page.locator(".visit-editorial[open]");
    const drawer = page.locator(".visit-dialog[open]");

    await navigation
      .getByRole("link", { name: "À propos", exact: true })
      .click();
    await expect(editorial).toBeVisible();
    await expect(page.locator(".visit-filmstrip")).toBeVisible();
    await assertBarsAvailable(page, editorial);
    await editorial.locator("img").evaluate(async (node) => {
      await (node as HTMLImageElement).decode();
    });
    await page.screenshot({
      path: `artifacts/window-navigation/about-${width}.png`,
    });

    await page
      .getByRole("button", { name: "Changer de salle", exact: true })
      .click();
    await expect(drawer).toBeVisible();
    await expect(editorial).toBeHidden();
    await assertBarsAvailable(page, drawer);
    await navigation
      .getByRole("link", { name: "Contact", exact: true })
      .click();
    await expect(drawer).toBeHidden();
    await expect(editorial).toHaveAttribute(
      "aria-label",
      "Contacter l’artiste",
    );
    await assertBarsAvailable(page, editorial);

    await page.locator(".visit-film-card").first().click();
    await expect(editorial).toBeHidden();
    await expect(canvas).toHaveAttribute("data-navigation-state", "arrived");
    await expect(
      page.locator('.visit-details[data-visible="true"]'),
    ).toBeVisible();

    await navigation
      .getByRole("button", { name: "Les œuvres", exact: true })
      .click();
    await expect(drawer).toBeVisible();
    expect(await drawer.evaluate((node) => node.matches(":modal"))).toBe(false);
    await assertBarsAvailable(page, drawer);
    const card = drawer.locator(".visit-art-card").first();
    const price = (await card.locator("small").first().boundingBox())!;
    const availability = (await card.locator("small").last().boundingBox())!;
    expect(availability.y).toBeGreaterThanOrEqual(price.y + price.height);
    await page.screenshot({
      path: `artifacts/window-navigation/artworks-${width}.png`,
    });
    await navigation
      .getByRole("link", { name: "À propos", exact: true })
      .click();
    await expect(drawer).toBeHidden();
    await expect(editorial).toBeVisible();
    const about = page.url();

    await page
      .getByRole("button", { name: "Œuvre suivante", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(editorial).toBeHidden();
    await expect(page).not.toHaveURL(about);
    await expect(page).toHaveURL(/vue=oeuvre&slug=/);
    await expect(canvas).toHaveAttribute("data-navigation-state", "arrived");
    await navigation
      .getByRole("button", { name: "Les œuvres", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(
      navigation.getByRole("button", { name: "Les œuvres", exact: true }),
    ).toBeFocused();
    expect(
      await original!.evaluate(
        (node) => node === document.querySelector("canvas"),
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
