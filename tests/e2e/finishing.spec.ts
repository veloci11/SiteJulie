import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("server HTML includes works, canonical metadata and protected admin routes", async ({
  page,
  request,
}) => {
  const data = await (await request.get("/api/museum/data")).json();
  const home = await (await request.get("/")).text();
  expect(home).toContain(data.artworks[0].title);
  expect(home).toContain('rel="canonical"');
  // The homepage supplies the page subject; the metadata helper adds the artist once.
  expect(home).toContain(
    `<title>Artiste peintre | ${data.settings.artistName}</title>`,
  );
  expect(home).toContain(
    `property="og:title" content="Artiste peintre | ${data.settings.artistName}"`,
  );
  expect(home).toContain('href="/oeuvres/');
  for (const route of [
    "/api/admin/artworks",
    "/api/admin/room-layout?roomId=room-1",
  ]) {
    const response = await request.get(route);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
  const login = await request.get("/admin");
  expect(login.headers()["x-robots-tag"]).toContain("noindex");
  expect(await (await request.get("/robots.txt")).text()).toContain(
    "Disallow: /",
  );
  await page.goto("/oeuvres");
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  const first = data.artworks[0];
  await page.goto(`/oeuvres/${first.slug}`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `http://127.0.0.1:3000/oeuvres/${first.slug}`,
  );
  const structured = JSON.parse(
    await page.locator('script[type="application/ld+json"]').innerText(),
  );
  expect(structured.name).toBe(first.title);
  expect(structured.creator.name).toBe(data.settings.artistName);
  await page.goto(`/contact?oeuvre=${first.slug}`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "http://127.0.0.1:3000/contact",
  );
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({
    path: "artifacts/finishing-qa/contact-desktop.png",
    fullPage: true,
  });
});

test("missing room posters are replaced with current, fully loaded room captures", async ({
  page,
  request,
}) => {
  test.setTimeout(150000);
  const status = await (await request.get("/api/museum/arrival/status")).json();
  // A previous local run may have generated posters. Exercise the uncached
  // browser path without deleting data or depending on that persistent cache.
  await page.route("**/api/museum/arrival/status", (route) =>
    route.fulfill({
      json: { ...status, ready: false, captureMethod: "browser" },
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".visit-dock")).toBeVisible({ timeout: 60000 });
  await page
    .getByRole("button", { name: "Changer de salle", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Les salles", exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.locator('.visit-room-preview[data-preview-ready="true"]'),
  ).toHaveCount(2, { timeout: 110000 });
  await expect(dialog.locator(".visit-room-preview-pending")).toHaveCount(0);
  expect(await page.locator("canvas").count()).toBe(1);
  await expect(page.locator('iframe[src^="/visite/apercu"]')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "artifacts/finishing-qa/rooms-current.png" });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Changer de salle", exact: true })
    .click();
  await expect(
    dialog.locator('.visit-room-preview[data-preview-ready="true"]'),
  ).toHaveCount(2);
  await expect(page.locator('iframe[src^="/visite/apercu"]')).toHaveCount(0);
});

test("3D contact form sends through a mocked endpoint and removes public demo copy in real-data mode", async ({
  page,
  request,
}) => {
  test.setTimeout(100000);
  const data = await (await request.get("/api/museum/data")).json();
  await page.route("**/api/museum/data", (route) =>
    route.fulfill({ json: { ...data, mode: "blob", contactEnabled: true } }),
  );
  let payload: Record<string, unknown> | undefined;
  await page.route("**/api/contact", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".visit-dock")).toBeVisible({ timeout: 60000 });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("link", { name: "Contact", exact: true }).click();
  const form = page.getByRole("form", { name: "Envoyer un message" });
  await expect(
    form.getByRole("button", { name: "Envoyer le message" }),
  ).toBeEnabled();
  await form.getByLabel("Votre nom").fill("Visiteur de test");
  await form.getByLabel("Votre email").fill("test@example.test");
  await form
    .getByLabel("Votre message")
    .fill("Un message de vérification sans envoi réel.");
  await form.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(page.getByText("Votre message a été envoyé.")).toBeVisible();
  expect(payload?.email).toBe("test@example.test");
  expect(payload).not.toHaveProperty("to");
  await page.getByRole("button", { name: "Revenir à la galerie" }).click();
  await page.setViewportSize({ width: 790, height: 878 });
  await page
    .getByRole("button", { name: "Ouvrir le menu", exact: true })
    .click();
  await expect(page.locator(".visit-demo-note")).toHaveCount(0);
});
