import { test, expect, type Locator, type Page } from "@playwright/test";

async function expectInsideViewport(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectFullCanvas(page: Page) {
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () => {
      const box = await page.locator("canvas").boundingBox();
      return (
        box &&
        Object.fromEntries(
          Object.entries(box).map(([key, value]) => [key, Math.round(value)]),
        )
      );
    })
    .toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 667, height: 375 },
]) {
  test(`mobile ${viewport.width}×${viewport.height}: deep link, collection and stable full-screen canvas`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?vue=oeuvre&slug=oeuvre-08");
    await expect(
      page.getByRole("complementary", { name: "Fiche de Œuvre 08" }),
    ).toBeVisible({ timeout: 60000 });
    const canvas = page.locator("canvas");
    const originalCanvas = await canvas.elementHandle();
    await expect(canvas).toHaveAttribute("data-camera-room", "room-1");
    await expect(canvas).toHaveAttribute("data-navigation-state", "arrived");
    await expectFullCanvas(page);
    await expect(page.locator(".visit-film-card")).toHaveCount(4);
    await expect(page.locator(".visit-filmstrip")).toHaveAttribute(
      "aria-label",
      "Les œuvres de Visages",
    );
    await expectInsideViewport(page.locator(".visit-brand"), page);
    await expectInsideViewport(page.locator(".visit-back"), page);
    await expectInsideViewport(
      page.getByRole("button", { name: "S’informer sur cette œuvre" }),
      page,
    );
    await expectInsideViewport(
      page.getByRole("button", { name: "Œuvre suivante", exact: true }),
      page,
    );
    await expectInsideViewport(page.locator(".visit-room-switch"), page);
    await expect(
      page.getByRole("link", { name: "Catalogue classique", exact: true }),
    ).toHaveAttribute("href", "/oeuvres/oeuvre-08");
    await page.screenshot({
      path: `docs/captures/artwork-mobile-${viewport.width}x${viewport.height}.png`,
    });

    const canvasBox = await canvas.boundingBox();
    await page.locator(".visit-back").click();
    await expect(page.locator(".visit-details")).toHaveCount(0);
    await expect(page.locator(".visit-hero")).toContainText("Visages");
    await expect(page).toHaveURL(/vue=salle&salle=room-1/);
    expect(await canvas.boundingBox()).toEqual(canvasBox);

    // Use the compact menu, then the actual collection drawer (no hidden filmstrip clicks).
    await page
      .getByRole("button", { name: "Ouvrir le menu", exact: true })
      .click();
    const menu = page.getByRole("dialog", { name: "Bienvenue", exact: true });
    await expect(menu).toBeVisible();
    await expectInsideViewport(
      menu.getByRole("button", { name: "Les œuvres", exact: true }),
      page,
    );
    await menu.getByRole("button", { name: "Les œuvres", exact: true }).click();
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
    await expect(collection).not.toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Fiche de Œuvre 04" }),
    ).toBeVisible();
    await expect(canvas).toHaveAttribute("data-camera-room", "room-2");
    await expect(page).toHaveURL(/slug=oeuvre-04/);
    await expect(page.locator(".visit-filmstrip")).toHaveAttribute(
      "aria-label",
      "Les œuvres de Récits & paysages",
    );
    expect(
      await page
        .locator(".visit-film-card")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-artwork")),
        ),
    ).toEqual(["01", "02", "04", "05"].map((id) => `oeuvre-${id}`));
    expect(await canvas.boundingBox()).toEqual(canvasBox);
    expect(
      await originalCanvas!.evaluate(
        (node) => node === document.querySelector("canvas"),
      ),
    ).toBe(true);
    await expectFullCanvas(page);
    await expectInsideViewport(
      page.getByRole("button", { name: "S’informer sur cette œuvre" }),
      page,
    );
    await page
      .getByRole("button", { name: "Œuvre suivante", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Fiche de Œuvre 05" }),
    ).toBeVisible();
    await expect(canvas).toHaveAttribute("data-navigation-state", "arrived");
    await page
      .getByRole("link", { name: "Catalogue classique", exact: true })
      .click();
    await expect(page).toHaveURL("/oeuvres/oeuvre-05");
    await expect(page.locator(".artwork-original img")).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("slow touch swipe selects the next artwork without a stray canvas click", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  await page.goto("/?vue=oeuvre&slug=oeuvre-08");
  await expect(
    page.getByRole("complementary", { name: "Fiche de Œuvre 08" }),
  ).toBeVisible({ timeout: 60000 });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 310, y: 340 }],
  });
  // A held finger remains a valid drag, including when a slower GPU delays input.
  await page.waitForTimeout(1100);
  for (const x of [275, 230, 175, 120, 75]) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: 340 }],
    });
    await page.waitForTimeout(30);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(
    page.getByRole("complementary", { name: "Fiche de Œuvre 03" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/slug=oeuvre-03/);
  await page.waitForTimeout(450);
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-detail-artwork",
    "oeuvre-03",
  );
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-camera-room",
    "room-1",
  );
  await expect(page.locator(".visit-filmstrip")).toHaveAttribute(
    "aria-label",
    "Les œuvres de Visages",
  );
  await expect(
    page.locator(".visit-work-steps").getByRole("button"),
  ).toHaveCount(2);
  await expect(
    page.locator('.visit-film-card[data-artwork="oeuvre-03"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await session.detach();
});
