import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 667, height: 375 },
]) {
  test(`phone ${viewport.width}×${viewport.height}: catalogue, artwork and contact without WebGL`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    const data = await (await request.get("/api/museum/data")).json();
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("/");
    await expect(page).toHaveURL(/\/oeuvres$/);
    await expect(page.locator(".catalogue-card")).toHaveCount(
      data.artworks.length,
    );
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Entrer dans la visite 3D" }),
    ).toBeHidden();
    expect(
      requests.some((url) => /\.glb|MuseumCanvas|MuseumScene/.test(url)),
    ).toBe(false);
    const story = page.locator(".collection-mobile-copy").first();
    await expect(story).not.toHaveAttribute("open");
    if (viewport.height > 520)
      await expect(page.locator(".catalogue-image").first()).toBeInViewport();
    await story.locator("summary").click();
    await expect(story).toHaveAttribute("open", "");
    await story.locator("summary").click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/finishing-qa/catalogue-${viewport.width}.png`,
      fullPage: false,
    });
    const first = data.artworks[0];
    await page.goto(`/?vue=oeuvre&slug=${first.slug}`);
    await expect(page).toHaveURL(new RegExp(`/oeuvres/${first.slug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      first.title,
    );
    await expect(page.locator("canvas")).toHaveCount(0);
    await page
      .getByRole("link", { name: "S’informer sur cette œuvre" })
      .click();
    await expect(page.locator(".contact-context")).toContainText(first.title);
    await expect(page.getByLabel("Votre nom", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Votre email", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Envoyer le message" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "Écrire avec votre messagerie" }),
    ).toHaveAttribute("href", new RegExp(`^mailto:${data.settings.email}`));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({
      path: `artifacts/finishing-qa/contact-${viewport.width}.png`,
      fullPage: true,
    });
  });
}

test("phone user agent preserves deep-link context before hydration, even in landscape", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3000/");
  await expect(page.locator(".catalogue-card").first()).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.goto("http://127.0.0.1:3000/?vue=contact");
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Entrer dans la visite 3D" }),
  ).toBeHidden();
  await context.close();
});

for (const target of ["artwork", "contact"] as const) {
  test(`switching to the phone catalogue keeps the current ${target} after a desktop selection`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const data = await (await request.get("/api/museum/data")).json();
    await page.goto("/");
    await expect(page.locator(".visit-film-card").first()).toBeVisible({
      timeout: 60000,
    });
    await page.locator(".visit-film-card").first().click();
    await expect(page).toHaveURL(/vue=oeuvre&slug=/);
    const slug = new URL(page.url()).searchParams.get("slug")!;
    const selected = data.artworks.find(
      (artwork: { slug: string }) => artwork.slug === slug,
    )!;
    let classicPath = `/oeuvres/${encodeURIComponent(slug)}`;
    if (target === "contact") {
      await expect(
        page.locator('.visit-details[data-visible="true"]'),
      ).toBeVisible({ timeout: 60000 });
      await page
        .getByRole("button", {
          name: "S’informer sur cette œuvre",
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(/vue=contact&oeuvre=/);
      classicPath = `/contact?oeuvre=${encodeURIComponent(slug)}`;
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => {
        const url = new URL(page.url());
        return url.pathname + url.search;
      })
      .toBe(classicPath);
    await expect(page.locator("canvas")).toHaveCount(0);
    if (target === "artwork")
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        selected.title,
      );
    else
      await expect(page.locator(".contact-context")).toContainText(
        selected.title,
      );
  });
}
