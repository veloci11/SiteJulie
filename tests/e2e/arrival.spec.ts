import { test, expect } from "@playwright/test";

test("the server-rendered gallery image is visible with JavaScript disabled", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:3000/");
    const image = page.locator("picture.visit-arrival img");
    await expect(image).toBeVisible();
    expect(
      await image.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 400,
      ),
    ).toBe(true);
    expect(
      await image.evaluate((img: HTMLImageElement) => img.currentSrc),
    ).toContain("view=portrait");
    await expect(page.locator(".visit-hero")).toContainText("Visages");
    await expect(page.locator(".visit-loading")).toHaveCount(0);
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.screenshot({
      path: "artifacts/contemporary/arrival-no-javascript-mobile.png",
    });
    await page
      .getByRole("link", { name: "Catalogue classique", exact: true })
      .click();
    await expect(page.locator(".catalogue-card")).toHaveCount(8);
  } finally {
    await context.close();
  }
});

test("slow 3D resources leave a usable gallery image, then fade into the real scene", async ({
  page,
}) => {
  test.setTimeout(120000);
  let resume!: () => void;
  const held = new Promise<void>((resolve) => {
    resume = resolve;
  });
  await page.route("**/*.glb", async (route) => {
    await held;
    await route.continue();
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const poster = page.locator("picture.visit-arrival");
    await expect(poster).not.toHaveClass(/is-ready/);
    await expect
      .poll(() =>
        poster
          .locator("img")
          .evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 400,
          ),
      )
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "Découvrir les œuvres", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".visit-loading")).toHaveCount(0);
    await page.screenshot({
      path: "artifacts/contemporary/arrival-before-3d.png",
    });
    resume();
    await expect(poster).toHaveClass(/is-ready/, { timeout: 60000 });
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-renderer-ready",
      "true",
    );
    await expect(poster).toHaveCSS("opacity", "0", { timeout: 5000 });
    await expect(page.locator(".visit-film-card")).toHaveCount(4);
    expect(errors).toEqual([]);
  } finally {
    resume();
  }
});
