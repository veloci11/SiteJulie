import { openArtworkDrawer } from "./navigation-helpers";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("public catalogue, complete art, contact and keyboard accessible content", async ({
  page,
}) => {
  await page.goto("/oeuvres");
  await expect(page.locator(".catalogue-card")).toHaveCount(8);
  await expect(
    page.getByRole("heading", { name: /Les œuvres.*au fil des couleurs/ }),
  ).toBeVisible();
  await page.locator(".catalogue-card").first().click();
  await expect(page).toHaveURL(/oeuvres\/oeuvre-03/);
  await expect(page.locator(".artwork-original img")).toBeVisible();
  await expect(page.getByText("Prix sur demande")).toBeVisible();
  await page.getByRole("link", { name: "S’informer sur cette œuvre" }).click();
  await expect(page).toHaveURL(/contact\?oeuvre=oeuvre-03/);
  await expect(page.locator(".contact-context")).toContainText("Œuvre 03");
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  await page.getByRole("link", { name: "Faire une demande générale" }).click();
  await expect(page.locator(".contact-context")).toHaveCount(0);
  await expect(page).toHaveTitle(/Contact/);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({
    path: "docs/captures/contact-classic.png",
    fullPage: true,
  });
});
test("3D collection drawer, rapid last selection, contextual contact and history", async ({
  page,
}) => {
  test.setTimeout(150000);
  // The local owner can edit availability between runs. Check agreement with
  // the public catalogue instead of assuming that every fixture is available.
  const catalogue = await page.context().newPage();
  await catalogue.goto("/oeuvres");
  const publishedLabels = await Promise.all(
    ["03", "06", "07", "08"].map(async (id) => {
      const card = catalogue.locator(
        `.catalogue-card[href="/oeuvres/oeuvre-${id}"]`,
      );
      return {
        price: await card.locator(".catalogue-caption p").innerText(),
        status: await card.locator(":scope > small").innerText(),
      };
    }),
  );
  await catalogue.close();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Découvrir les œuvres" }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.locator("picture.visit-arrival")).toHaveClass(/is-ready/, {
    timeout: 60000,
  });
  await expect(page.locator(".visit-film-card")).toHaveCount(4);
  await expect(page.locator(".visit-filmstrip")).toHaveAttribute(
    "aria-label",
    "Les œuvres de Visages",
  );
  expect(
    await page
      .locator(".visit-film-card")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-artwork")),
      ),
  ).toEqual(["03", "06", "07", "08"].map((id) => `oeuvre-${id}`));
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveCount(1);
  const originalCanvas = await canvas.elementHandle();
  await expect(page.locator(".visit-film-price")).toHaveText(
    publishedLabels.map((label) => label.price),
  );
  await expect(page.locator(".visit-film-status")).toHaveText(
    publishedLabels.map((label) => label.status),
  );
  await expect(
    page.getByRole("button", { name: "Réduire les miniatures" }),
  ).toHaveCount(0);
  await expect(page.locator(".visit-filmstrip")).toBeVisible();
  await page.screenshot({ path: "docs/captures/home-desktop.png" });

  await openArtworkDrawer(page);
  const collection = page.getByRole("dialog", {
    name: "Les œuvres",
    exact: true,
  });
  await expect(collection).toBeVisible();
  await expect(collection.locator(".visit-art-card")).toHaveCount(8);
  expect(
    await collection
      .locator(".visit-art-card")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label")),
      ),
  ).toEqual(
    ["03", "06", "07", "08", "01", "02", "04", "05"].map(
      (id) => `Choisir Œuvre ${id}`,
    ),
  );
  await collection
    .getByRole("button", { name: "Visages", exact: true })
    .click();
  await expect(collection.locator(".visit-art-card")).toHaveCount(4);
  await collection
    .getByRole("button", { name: "Choisir Œuvre 03", exact: true })
    .click();
  await expect(collection).not.toBeVisible();
  await expect(canvas).toHaveAttribute("data-navigation-state", "traveling");
  // Retarget the same live journey twice: only the last selection may arrive.
  await page
    .getByRole("button", { name: "Découvrir Œuvre 06", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Découvrir Œuvre 08", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Fiche de Œuvre 08" }),
  ).toBeVisible({ timeout: 45000 });
  await expect(canvas).toHaveAttribute("data-navigation-state", "arrived");
  await expect(page).toHaveURL(/slug=oeuvre-08/);
  await expect(
    page.getByRole("button", { name: "Découvrir Œuvre 08", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "docs/captures/artwork-desktop.png" });

  await page
    .getByRole("button", { name: "S’informer sur cette œuvre" })
    .click();
  const contact = page.getByRole("dialog", {
    name: "Contacter l’artiste",
  });
  await expect(contact).toBeVisible({ timeout: 45000 });
  await expect(contact.locator(".contact-context")).toContainText("Œuvre 08");
  await expect(contact.locator('a[href^="mailto:"]')).toHaveCount(0);
  await page.screenshot({ path: "docs/captures/contact-3d.png" });
  await contact
    .getByRole("button", { name: "Faire une demande générale" })
    .click();
  await expect(contact).toBeVisible();
  await expect(contact.locator(".contact-context")).toHaveCount(0);
  await contact.getByRole("button", { name: "Revenir à la galerie" }).click();
  await expect(contact).not.toBeVisible();
  await page.getByRole("link", { name: "À propos", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "À propos de l’artiste" }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/captures/about-3d.png" });
  await page.goBack();
  await expect(page).toHaveURL(/vue=salle&salle=room-1/);
  await expect(page.locator(".visit-editorial")).not.toBeVisible();
  await page.goBack();
  await expect(contact).toBeVisible();
  await expect(page.locator(".contact-context")).toHaveCount(0);
  await expect(canvas).toHaveCount(1);
  expect(
    await originalCanvas!.evaluate(
      (node) => node === document.querySelector("canvas"),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("rooms drawer, keyboard focus and reduced-motion inter-room navigation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?vue=oeuvre&slug=oeuvre-08");
  await expect(
    page.getByRole("complementary", { name: "Fiche de Œuvre 08" }),
  ).toBeVisible({ timeout: 60000 });
  const canvas = page.locator("canvas");
  // Record changes, including short-lived states between Playwright assertions.
  await canvas.evaluate((node) => {
    node.dataset.observedMotion = "";
    new MutationObserver((records) => {
      const prior = records.map((record) => record.oldValue).filter(Boolean);
      node.dataset.observedMotion +=
        [...prior, node.dataset.navigationState].join(",") + ",";
    }).observe(node, {
      attributes: true,
      attributeFilter: ["data-navigation-state"],
      attributeOldValue: true,
    });
  });
  const opener = await openArtworkDrawer(page);
  const collection = page.getByRole("dialog", {
    name: "Les œuvres",
    exact: true,
  });
  await expect(collection).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/slug=oeuvre-08/);
  await page.keyboard.press("Escape");
  await expect(collection).not.toBeVisible();
  await expect(opener).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("complementary", { name: "Fiche de Œuvre 03" }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-camera-room", "room-1");
  await expect(canvas).toHaveAttribute("data-navigation-state", "arrived");
  await expect(page.locator(".visit-room-switch")).toContainText("Visages");
  expect(
    await page
      .locator(".visit-film-card")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-artwork")),
      ),
  ).toEqual(["03", "06", "07", "08"].map((id) => `oeuvre-${id}`));
  await expect(
    page.locator(".visit-work-steps").getByRole("button"),
  ).toHaveCount(2);
  await expect(
    page.locator('.visit-film-card[data-artwork="oeuvre-03"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("complementary", { name: "Fiche de Œuvre 08" }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-camera-room", "room-1");

  await page.locator(".visit-room-switch").click();
  const rooms = page.getByRole("dialog", { name: "Les collections" });
  await expect(rooms.locator(".visit-room-card")).toHaveCount(2);
  await rooms.getByRole("button", { name: /Récits & paysages/ }).focus();
  await page.keyboard.press("Enter");
  await expect(rooms).not.toBeVisible();
  await expect(page).toHaveURL(/vue=salle&salle=room-2/);
  await expect(page.locator(".visit-hero")).toContainText("Récits & paysages");
  await expect(canvas).toHaveAttribute("data-camera-room", "room-2");
  await page.getByRole("button", { name: "Découvrir les œuvres" }).click();
  await expect(collection).toBeVisible();
  await collection
    .getByRole("button", { name: "Choisir Œuvre 01", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Fiche de Œuvre 01" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".visit-details")).toHaveCount(0);
  await expect(page).toHaveURL(/vue=salle&salle=room-2/);
  await page
    .getByRole("button", { name: "Visiter Visages", exact: true })
    .click();
  await expect(page.locator(".visit-hero")).toContainText("Visages");
  await expect(canvas).toHaveAttribute("data-camera-room", "room-1");
  expect(await canvas.getAttribute("data-observed-motion")).not.toMatch(
    /traveling|reframing/,
  );
});

test("closed visit has two rooms and never loads the removed exterior", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/?vue=terrasse");
  await expect(
    page.getByRole("button", { name: "Découvrir les œuvres" }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".visit-hero")).toContainText("Visages");
  await expect(page.locator("picture.visit-arrival")).toHaveClass(/is-ready/, {
    timeout: 60000,
  });
  await expect(page.locator(".visit-film-card")).toHaveCount(4);
  const originalCanvas = await page.locator("canvas").elementHandle();
  await page.locator(".visit-room-switch").click();
  const rooms = page.getByRole("dialog", { name: "Les collections" });
  await expect(rooms.locator(".visit-room-card")).toHaveCount(2);
  await expect(
    rooms.getByRole("heading", { name: "La terrasse", exact: true }),
  ).toHaveCount(0);
  await rooms.getByRole("button", { name: /Récits & paysages/ }).click();
  await expect(page.locator(".visit-hero")).toContainText("Récits & paysages");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-camera-room",
    "room-2",
  );
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-navigation-state",
    "arrived",
  );
  expect(
    await originalCanvas!.evaluate(
      (node) => node === document.querySelector("canvas"),
    ),
  ).toBe(true);
  expect(
    requests.some((url) =>
      /outside-baked|coastal-environment|sky-lighting|plaster-detail|upper-sky/.test(
        url,
      ),
    ),
  ).toBe(false);
  expect(requests.some((url) => url.includes("end-cap-contemporary.glb"))).toBe(
    false,
  );
  expect(
    requests.some((url) => url.includes("extension-terminal-contemporary.glb")),
  ).toBe(true);
  expect(requests.some((url) => url.includes("fig-reading.glb"))).toBe(true);
  expect(requests.some((url) => url.includes("fig-central.glb"))).toBe(true);
  await page.screenshot({ path: "docs/captures/closed-salon-mobile.png" });
});

test("WebGL failure preserves complete catalogue and contact", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith("webgl")) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto("/?vue=oeuvre&slug=oeuvre-03");
  await expect(
    page.getByText("La visite 3D n’est pas disponible dans ce navigateur."),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Découvrir le catalogue", exact: true })
    .click();
  await expect(page).toHaveURL("/oeuvres/oeuvre-03");
});
