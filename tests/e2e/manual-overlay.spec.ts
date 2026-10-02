import { test, expect, type Locator, type Page } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

async function holdDrag(page: Page, canvas: Locator) {
  await page.mouse.move(630, 380);
  await page.mouse.down();
  await page.mouse.move(820, 410, { steps: 12 });
  await expect(canvas).toHaveAttribute("data-look-state", "dragging");
}

async function target(canvas: Locator): Promise<number[]> {
  return JSON.parse((await canvas.getAttribute("data-camera-target"))!);
}

test("an overlay or a newer artwork request cancels a held drag without navigating back on release", async ({
  page,
}) => {
  await page.goto("/?vue=salle&salle=room-1");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
    timeout: 60000,
  });

  await holdDrag(page, canvas);
  await page
    .locator(".visit-navigation")
    .getByRole("link", { name: "À propos", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/vue=apropos/);
  await expect(canvas).not.toHaveAttribute("data-look-state", "dragging");
  const beforeMove = await target(canvas);
  await page.mouse.move(940, 450, { steps: 8 });
  await page.waitForTimeout(150);
  const afterMove = await target(canvas);
  expect(
    Math.hypot(...afterMove.map((value, i) => value - beforeMove[i])),
  ).toBeLessThan(0.05);
  await page.mouse.up();
  await page.waitForTimeout(150);
  await expect(page).toHaveURL(/vue=apropos/);
  await expect(page.locator(".visit-editorial[open]")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".visit-editorial")).toBeHidden();
  await holdDrag(page, canvas);
  await page
    .getByRole("button", { name: "Changer de salle", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Les salles", exact: true }),
  ).toBeVisible();
  await expect(canvas).not.toHaveAttribute("data-look-state", "dragging");
  await page.mouse.move(940, 450, { steps: 8 });
  await page.mouse.up();
  await expect(
    page.getByRole("dialog", { name: "Les salles", exact: true }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await holdDrag(page, canvas);
  await page.locator(".visit-film-card").first().focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/vue=oeuvre/);
  const selectedUrl = page.url();
  await expect(canvas).not.toHaveAttribute("data-look-state", "dragging");
  // The cancelled press can outlive a short click debounce while a new work loads.
  await page.waitForTimeout(550);
  await page.mouse.up();
  await page.waitForTimeout(150);
  await expect(page).toHaveURL(selectedUrl);
  await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
    timeout: 60000,
  });
});
