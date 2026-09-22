// Real browser acceptance on a throwaway copy. Never uses production storage.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

const project = process.cwd();
const out = path.join(project, "artifacts/admin-ergonomics");
await mkdir(out, { recursive: true });
const before = createHash("sha256")
  .update(await readFile(".local/data.json"))
  .digest("hex");
const fixture = await mkdtemp(
  path.join(os.tmpdir(), "museum-admin-acceptance-"),
);
await cp(".local/data.json", path.join(fixture, "seed.json"));
await cp(".local/media", path.join(fixture, "media"), { recursive: true });
const seed = JSON.parse(
  await readFile(path.join(fixture, "seed.json"), "utf8"),
);
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", resolve);
});
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
// Keep a concurrent build from replacing manifests under this running server.
const standalone = path.join(fixture, "app");
await cp(path.join(project, ".next/standalone"), standalone, {
  recursive: true,
});
await cp(".next/static", path.join(standalone, ".next/static"), {
  recursive: true,
});
await cp("public", path.join(standalone, "public"), { recursive: true });
const child = spawn(process.execPath, [path.join(standalone, "server.js")], {
  cwd: standalone,
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    MUSEUM_DATA_MODE: "demo",
    MUSEUM_LOCAL_PREVIEW: "1",
    MUSEUM_LOCAL_DATA_DIR: fixture,
    NEXT_PUBLIC_SITE_URL: origin,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "",
  browser,
  page,
  safari;
child.stdout.on("data", (chunk) => {
  log += chunk;
});
child.stderr.on("data", (chunk) => {
  log += chunk;
});
const checks = [],
  errors = [],
  a11y = [];
let passed = false;
const mark = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
const hardLimit = setTimeout(() => {
  browser?.close().catch(() => {});
  safari?.close().catch(() => {});
  child.kill("SIGTERM");
}, 240000);
try {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(`Server stopped: ${log}`);
    try {
      if (
        (await fetch(`${origin}/admin`, { signal: AbortSignal.timeout(1500) }))
          .ok
      )
        break;
    } catch {}
    if (i === 79) throw new Error("Server unavailable");
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    // Functional rendering checks should not depend on the desktop GPU state.
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  const unauthenticated = await browser.newContext();
  expect(
    (
      await unauthenticated.request.get(`${origin}/api/admin/artworks`)
    ).status(),
  ).toBe(401);
  expect(
    (
      await unauthenticated.request.post(`${origin}/api/admin/artworks`, {
        headers: { origin },
        data: seed.artworks[0],
      })
    ).status(),
  ).toBe(401);
  await page.goto(`${origin}/admin`);
  await page
    .getByRole("button", { name: "Ouvrir l’atelier de démonstration" })
    .click();
  await expect(page.locator(".admin-artwork-card")).toHaveCount(
    seed.artworks.length,
  );
  mark("Login and anonymous read/write rejection");
  const savedData = async () => {
    const response = await context.request.get(`${origin}/api/admin/artworks`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const save = page.getByRole("button", {
    name: "Enregistrer les modifications",
    exact: true,
  });
  const feedback = page.locator(".admin-save-feedback");
  async function submit() {
    await save.click();
    await expect(feedback).toHaveClass(/is-success/, { timeout: 45000 });
    await expect(save).toBeEnabled();
    await expect(page.locator(".admin-dirty-state")).toHaveText(
      "Tout est enregistré",
    );
  }
  async function openSection(name) {
    const section = page.locator(`[data-section="${name}"]`);
    if (!((await section.getAttribute("open")) !== null))
      await section.locator("summary").click();
  }
  let lowerPlans = 0;
  for (let index = 0; index < seed.artworks.length; index++) {
    await page.locator(".admin-artwork-card").nth(index).click();
    await expect(page.locator(".admin-dirty-state")).toHaveText(
      "Tout est enregistré",
    );
    if (index === 0) {
      await openSection("placement");
      const choice = page.locator(".admin-placement-choice");
      const originalChoice = await choice.locator("strong").innerText();
      for (const name of [
        "A · Mur gauche",
        "B · Mur droit",
        "C · Mur en face",
        "D · Mur derrière",
      ]) {
        const wall = page.getByRole("button", { name, exact: true });
        await wall.focus();
        await wall.press("Enter");
        await expect(wall).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator(".admin-wall-heading")).toContainText(name);
        await expect(choice.locator("strong")).toHaveText(originalChoice);
        await expect(page.locator(".admin-dirty-state")).toHaveText(
          "Tout est enregistré",
        );
        await expect(
          page.locator(".admin-wall-inventory button:disabled").first(),
        ).toBeVisible();
      }
      await page
        .getByRole("button", { name: "Revenir au tableau", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Voir le mur A sur le plan", exact: true })
        .click();
      await expect(page.locator(".admin-map-gaze-label")).toHaveText(
        "Vue du mur A",
      );
      await expect(choice.locator("strong")).toHaveText(originalChoice);
      const planBackWall = page.getByRole("button", {
        name: "Voir le mur D sur le plan",
        exact: true,
      });
      await planBackWall.focus();
      await planBackWall.press("Space");
      await expect(page.locator(".admin-map-gaze-label")).toHaveText(
        "Vue du mur D",
      );
      await page
        .getByRole("button", { name: "Revenir au tableau", exact: true })
        .click();
      await expect(page.getByLabel("Horizontal (cm)")).toBeVisible();
      await expect(page.locator(".admin-room-map svg")).toContainText(
        "Passage · Salle 2",
      );
      await page
        .locator(".admin-room-map")
        .screenshot({ path: path.join(out, "wall-map-desktop.png") });
      await page
        .locator(".admin-wall-inventory")
        .screenshot({ path: path.join(out, "wall-neighbours-desktop.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        (await page.locator(".admin-plan-drawing").boundingBox()).width,
      ).toBeGreaterThan(280);
      await expect(page.locator(".admin-plan-drawing")).toContainText("A2 bas");
      await expect(page.locator(".admin-plan-drawing")).toContainText("B2 bas");
      await page
        .locator(".admin-plan-drawing")
        .screenshot({ path: path.join(out, "wall-plan-mobile.png") });
      await page
        .locator(".admin-room-map")
        .screenshot({ path: path.join(out, "wall-map-mobile.png") });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.setViewportSize({ width: 1440, height: 900 });
      mark(
        "Four fixed wall references, real passages, occupied neighbours, keyboard exploration without moving or dirtying artwork, mobile plan",
      );
    }
    const openedTitle = await page
      .getByLabel("Titre", { exact: true })
      .inputValue();
    const original = seed.artworks.find(
      (artwork) => artwork.title === openedTitle,
    );
    if (original && /-slot-1[34]$/.test(original.slotId)) {
      await openSection("placement");
      await expect(page.locator(".admin-map-current-code")).toHaveText(
        original.slotId.endsWith("13") ? "A2 bas" : "B2 bas",
      );
      await expect(
        page.locator('.admin-plan-drawing circle[fill="#24646c"]'),
      ).toHaveCount(1);
      lowerPlans++;
    }
    await submit();
    await page
      .getByRole("button", { name: "Toutes les œuvres", exact: true })
      .click();
  }
  expect((await savedData()).artworks.length).toBe(seed.artworks.length);
  mark(
    `All ${seed.artworks.length} existing works open cleanly and save without validation errors`,
  );
  expect(lowerPlans).toBe(2);
  mark(
    "Each lower painting has its own plan marker and selection without highlighting the upper painting",
  );
  // Search never leaves an unexplained blank page and ignores accents/case.
  await page.getByLabel("Rechercher une œuvre").fill("zzzz-inexistant");
  await expect(
    page.getByRole("heading", { name: "Aucune œuvre ne correspond" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Réinitialiser les filtres" }).click();
  await expect(page.locator(".admin-artwork-card")).toHaveCount(
    seed.artworks.length,
  );
  await page.screenshot({
    path: path.join(out, "collection-desktop.png"),
    fullPage: true,
  });
  mark("Search, result counts and empty-state recovery");
  await page
    .getByRole("button", { name: "Ajouter une œuvre", exact: true })
    .first()
    .click();
  const imageBuffer = await sharp({
    create: { width: 600, height: 900, channels: 3, background: "#795f72" },
  })
    .png()
    .toBuffer();
  const image = {
    name: "tableau-qa.png",
    mimeType: "image/png",
    buffer: imageBuffer,
  };
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid"),
  });
  await expect(feedback).toContainText("ne peut pas être lue");
  await page.locator("input[type=file]").setInputFiles(image);
  await expect(page.locator(".admin-pending-image")).toContainText(
    "tableau-qa.png",
  );
  expect((await savedData()).artworks.length).toBe(seed.artworks.length);
  await page
    .getByLabel("Titre", { exact: true })
    .fill("Création QA temporaire");
  await page
    .getByLabel("Texte alternatif")
    .fill("Rectangle mauve de test, sans valeur artistique.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Toutes les œuvres", exact: true })
    .click();
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue(
    "Création QA temporaire",
  );
  await expect(page.locator(".admin-pending-image")).toBeVisible();
  mark(
    "Image before title, invalid file, no implicit save and unsaved-navigation protection",
  );
  // Full initial rooms are deliberately preserved: enable a new room through the UI.
  await openSection("placement");
  await page
    .getByRole("button", { name: "+ Créer une collection", exact: true })
    .click();
  await page
    .getByLabel("Nom de la collection")
    .fill("Collection QA temporaire");
  await page.getByRole("radio", { name: "Salle 2", exact: true }).focus();
  await page
    .getByRole("radio", { name: "Salle 2", exact: true })
    .press("Space");
  await expect(
    page.getByRole("radio", { name: "Salle 2", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("radio", { name: "Salle 2", exact: true })
    .press("ArrowLeft");
  await expect(
    page.getByRole("radio", { name: "Salle 1", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".admin-room-options")).toContainText(
    seed.artworks[0].collection,
  );
  await expect(page.locator("dialog .admin-placement-warning")).toContainText(
    "Salle complète",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator("dialog")
    .screenshot({ path: path.join(out, "collection-room-mobile.png") });
  const createButton = await page
    .getByRole("button", { name: "Créer la collection", exact: true })
    .boundingBox();
  expect(createButton.y).toBeGreaterThan(0);
  expect(createButton.y + createButton.height).toBeLessThanOrEqual(844);
  const modalAxe = await new AxeBuilder({ page }).include("dialog").analyze();
  a11y.push({
    browser: "Chromium",
    screen: "collection room chooser",
    violations: modalAxe.violations,
  });
  expect(modalAxe.violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .locator("dialog")
    .screenshot({ path: path.join(out, "collection-room-desktop.png") });
  mark(
    "Visual room chooser preserves the name, supports native keyboard selection, warns for full rooms, keeps mobile actions visible and passes axe",
  );
  await page
    .getByRole("button", { name: "Activer une nouvelle salle", exact: true })
    .click();
  await expect(
    page.getByRole("radio", {
      name: `Salle ${seed.rooms.length + 1}`,
      exact: true,
    }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Créer la collection", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Collection", exact: true }),
  ).toHaveValue("Collection QA temporaire");
  // Closing a modal restores focus to the originating button.
  await expect(
    page.getByRole("button", { name: "+ Créer une collection", exact: true }),
  ).toBeFocused();
  await page.locator('[data-section="placement"] > summary').click();
  mark(
    "Full room recovery, room activation and collection creation without losing the draft",
  );
  await openSection("sale");
  await page.getByLabel("Affichage du prix").selectOption("public");
  const price = page.getByLabel(/^Prix\s*/).filter({ visible: true });
  await price.fill("");
  await price.pressSequentially("1234,56");
  await expect(price).toHaveValue("1234,56");
  await page.getByLabel("Disponibilité").selectOption("reserved");
  await page.locator('[data-section="sale"] > summary').click();
  await page
    .getByLabel("Publication", { exact: false })
    .selectOption("published");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  const imageTop = (await page.locator(".admin-image-preview").boundingBox()).y;
  expect(imageTop).toBeLessThan(650);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(out, "creation-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: path.join(out, "creation-desktop.png"),
    fullPage: true,
  });
  await submit();
  let created = (await savedData()).artworks.find(
    (a) => a.title === "Création QA temporaire",
  );
  expect(created).toMatchObject({
    priceMinor: 123456,
    publication: "published",
    availability: "reserved",
    collection: "Collection QA temporaire",
    roomId: `room-${seed.rooms.length + 1}`,
  });
  expect(created.imageWidth).toBe(600);
  expect(created.slotId).toBeTruthy();
  const publicPage = await unauthenticated.newPage();
  await publicPage.goto(`${origin}/oeuvres/${created.slug}`);
  await expect(publicPage.locator(".artwork-price")).toContainText("1");
  expect(await publicPage.locator("body").innerText()).toMatch(
    /1[\s\u00a0\u202f]?234,56/,
  );
  mark(
    `Create → image → publish → public price; mobile image at ${Math.round(imageTop)}px`,
  );
  const immersive = await unauthenticated.newPage();
  immersive.on("pageerror", (error) => errors.push(error.message));
  await immersive.emulateMedia({ reducedMotion: "reduce" });
  await immersive.goto(`${origin}/?vue=oeuvre&slug=${created.slug}`);
  await expect(immersive.locator(".visit-details")).toContainText(
    created.title,
    { timeout: 60000 },
  );
  await expect(immersive.locator("canvas")).toHaveAttribute(
    "data-camera-room",
    created.roomId,
  );
  await expect(immersive.locator("canvas")).toHaveAttribute(
    "data-navigation-state",
    "arrived",
  );
  await immersive.screenshot({
    path: path.join(out, "new-room-published-webgl.png"),
  });
  await immersive.close();
  mark("Newly activated room displays the published work in actual WebGL");

  // Native validation opens collapsed sections and focuses the field.
  await openSection("sale");
  await price.fill("12,345");
  await page.locator('[data-section="sale"] > summary').click();
  await save.click();
  await expect(price).toBeFocused();
  await expect(feedback).toContainText("deux décimales");
  await price.fill("2345.67");
  await page.getByLabel("Affichage du prix").selectOption("on_request");
  await page.getByLabel("Disponibilité").selectOption("sold");
  await submit();
  created = (await savedData()).artworks.find((a) => a.id === created.id);
  expect(created.priceMinor).toBe(234567);
  await publicPage.reload();
  await expect(publicPage.locator(".artwork-price")).toHaveText(
    "Prix sur demande",
  );
  expect(await publicPage.content()).not.toContain("234567");
  mark(
    "Decimal validation, hidden internal price and sold work kept published",
  );
  // Save failures and delayed responses preserve fields and prevent racing navigation.
  await page.getByLabel("Titre", { exact: true }).fill("Création QA corrigée");
  await page.route("**/api/admin/artworks", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 503,
      contentType: "text/html",
      body: "<h1>Unavailable</h1>",
    });
  });
  await save.click();
  await expect(feedback).toContainText("Vos saisies sont conservées");
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue(
    "Création QA corrigée",
  );
  await page.unroute("**/api/admin/artworks");
  await page.route("**/api/admin/artworks", async (route) => {
    if (route.request().method() === "POST")
      await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await save.click();
  await expect(
    page.getByRole("button", { name: "Les œuvres", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Titre", { exact: true })).toBeDisabled();
  await expect(feedback).toHaveClass(/is-success/);
  await page.unroute("**/api/admin/artworks");
  mark("Non-JSON server failure recovery and controls locked during save");
  // A failed image upload can be retried without creating a duplicate record.
  await page
    .locator("input[type=file]")
    .setInputFiles({ ...image, name: "replacement.png" });
  await expect(page.locator(".admin-pending-image")).toBeVisible();
  await page.route("**/api/admin/upload?*", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await save.click();
  await expect(feedback).toContainText(
    "nouvelle image n’a pas été enregistrée",
  );
  await expect(page.locator(".admin-pending-image")).toBeVisible();
  await page.unroute("**/api/admin/upload?*");
  await submit();
  expect(
    (await savedData()).artworks.filter((a) => a.id === created.id),
  ).toHaveLength(1);
  await expect(page.locator(".admin-pending-image")).toHaveCount(0);
  mark("Image upload retry preserves the draft and does not create duplicates");
  // Expired authentication preserves the complete form instead of redirecting it.
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Saisie conservée pendant une expiration de session.");
  await page.route("**/api/admin/artworks", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 401,
          contentType: "application/json",
          body: '{"error":"Accès refusé"}',
        })
      : route.continue(),
  );
  await save.click();
  await expect(feedback).toContainText("session a expiré");
  await expect(feedback.getByRole("link")).toHaveAttribute("target", "_blank");
  await expect(
    page.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Saisie conservée pendant une expiration de session.");
  await page.unroute("**/api/admin/artworks");
  await submit();
  mark("Expired session keeps inputs and offers sign-in in another tab");
  // An edit in a second tab must not be silently overwritten.
  const current = (await savedData()).artworks.find((a) => a.id === created.id);
  expect(
    (
      await context.request.post(`${origin}/api/admin/artworks`, {
        headers: { origin },
        data: { ...current, title: "Version autre onglet QA" },
      })
    ).ok(),
  ).toBe(true);
  await page.getByLabel("Titre", { exact: true }).fill("Version locale QA");
  await save.click();
  await expect(feedback).toContainText("modifiée");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Recharger la version enregistrée" })
    .click();
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue(
    "Version locale QA",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Recharger la version enregistrée" })
    .click();
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue(
    "Version autre onglet QA",
  );
  mark("Stale revision rejection and explicit, cancellable recovery");
  // Manual wall selection, precise placement and state persistence.
  await openSection("placement");
  await page
    .getByRole("button", { name: "B · Mur droit", exact: true })
    .click();
  await page
    .getByRole("button", { name: "B1 · Choisir cet emplacement", exact: true })
    .click();
  await expect(page.locator(".admin-placement-choice")).toContainText(
    "B · Mur droit · B1",
  );
  expect(
    (await savedData()).artworks.find((a) => a.id === created.id).slotId,
  ).toBe(current.slotId);
  await submit();
  expect(
    (await savedData()).artworks.find((a) => a.id === created.id).slotId,
  ).toBe(`${created.roomId}-slot-05`);
  await expect(page.locator(".admin-room-map svg")).toContainText(
    `Passage · Salle ${seed.rooms.length}`,
  );
  await expect(page.locator(".admin-room-map svg")).toContainText("Mur fermé");
  mark(
    "Choosing B1 explicitly moves the artwork only on save; extension plan shows the previous room and closed end",
  );
  await page
    .getByRole("button", { name: "Choisir automatiquement un emplacement" })
    .click();
  await page.getByLabel("Taille dans le showroom", { exact: true }).fill("70");
  await page.getByLabel("Horizontal (cm)").fill("5");
  await submit();
  expect(
    (await savedData()).artworks.find((a) => a.id === created.id)
      .placementOffsetX,
  ).toBe(0.05);
  await page.screenshot({
    path: path.join(out, "placement-desktop.png"),
    fullPage: true,
  });
  const axe = await new AxeBuilder({ page }).include(".admin-shell").analyze();
  a11y.push({
    browser: "Chromium",
    screen: "editor",
    violations: axe.violations,
  });
  expect(
    axe.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        issue: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  mark(
    "Wall adjustment persists and editor passes automated accessibility checks",
  );
  await page.getByLabel("Publication", { exact: false }).selectOption("draft");
  await submit();
  expect(
    (
      await unauthenticated.request.get(`${origin}/oeuvres/${created.slug}`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await unauthenticated.request.get(
        `${origin}/api/media/${created.id}?variant=room`,
      )
    ).status(),
  ).toBe(401);
  await page
    .getByLabel("Publication", { exact: false })
    .selectOption("published");
  await submit();
  await page
    .getByLabel("Publication", { exact: false })
    .selectOption("archived");
  await submit();
  expect(
    (
      await unauthenticated.request.get(`${origin}/oeuvres/${created.slug}`)
    ).status(),
  ).toBe(404);
  mark("Depublish, republish and archive protect public page and media");
  await page
    .getByRole("button", { name: "Textes & contact", exact: true })
    .click();
  await page.getByLabel("Accroche courte").fill("Texte temporaire QA");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Les œuvres", exact: true }).click();
  await expect(page.getByLabel("Accroche courte")).toHaveValue(
    "Texte temporaire QA",
  );
  await page.getByLabel("Adresse email publique").fill("qa@example.com");
  await page
    .getByRole("button", { name: "Enregistrer les textes", exact: true })
    .click();
  await expect(feedback).toHaveText("Textes et contact mis à jour.");
  expect((await savedData()).settings.tagline).toBe("Texte temporaire QA");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(out, "settings-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  mark(
    "Settings protect unsaved text and save with visible feedback on mobile",
  );
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ouvrir l’atelier de démonstration" })
    .click();
  await expect(page.getByRole("heading", { name: "Les œuvres" })).toBeVisible();
  await page.getByRole("button", { name: /^Archivées/ }).click();
  await expect(
    page
      .locator(".admin-artwork-card")
      .filter({ hasText: "Version autre onglet QA" }),
  ).toBeVisible();
  mark(
    "Logout/login returns to the collection and preserves the saved archive",
  );
  // Real WebKit engine, portrait and landscape (desktop emulation, not a physical phone).
  safari = await webkit.launch({ headless: true });
  const safariPage = await safari.newPage({
    viewport: { width: 390, height: 844 },
  });
  safariPage.on("pageerror", (error) => errors.push(error.message));
  await safariPage.goto(`${origin}/admin`);
  await safariPage
    .getByRole("button", { name: "Ouvrir l’atelier de démonstration" })
    .click();
  await safariPage
    .getByRole("button", { name: "Ajouter une œuvre", exact: true })
    .first()
    .click();
  await safariPage.locator("input[type=file]").setInputFiles(image);
  await expect(safariPage.locator(".admin-pending-image")).toBeVisible();
  await safariPage
    .getByLabel("Titre", { exact: true })
    .fill("Brouillon WebKit QA");
  await safariPage
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();
  await expect(safariPage.locator(".admin-save-feedback")).toHaveClass(
    /is-success/,
  );
  await safariPage.locator('[data-section="placement"] > summary').click();
  await safariPage
    .getByRole("button", { name: "D · Mur derrière", exact: true })
    .click();
  await expect(safariPage.locator(".admin-wall-heading")).toContainText(
    "D · Mur derrière",
  );
  await expect(safariPage.locator(".admin-dirty-state")).toHaveText(
    "Tout est enregistré",
  );
  await safariPage
    .locator(".admin-room-map")
    .screenshot({ path: path.join(out, "wall-map-webkit.png") });
  expect(
    await safariPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await safariPage.locator('[data-section="placement"] > summary').click();
  await safariPage.evaluate(() => scrollTo(0, 0));
  await safariPage.screenshot({
    path: path.join(out, "webkit-portrait.png"),
    fullPage: true,
  });
  await safariPage.setViewportSize({ width: 844, height: 390 });
  expect(
    await safariPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await safariPage.screenshot({
    path: path.join(out, "webkit-landscape.png"),
    fullPage: true,
  });
  mark(
    "WebKit real image upload and draft save, portrait and landscape without overflow",
  );
  expect(errors).toEqual([]);
  passed = true;
} catch (error) {
  errors.push(String(error));
  console.error(error);
  await page
    ?.screenshot({ path: path.join(out, "failure.png"), fullPage: true })
    .catch(() => {});
} finally {
  clearTimeout(hardLimit);
  await browser?.close();
  await safari?.close();
  if (child.exitCode === null) {
    const stopped = once(child, "exit");
    child.kill("SIGTERM");
    const kill = setTimeout(() => child.kill("SIGKILL"), 5000);
    await stopped;
    clearTimeout(kill);
  }
  await rm(fixture, { recursive: true, force: true });
  const after = createHash("sha256")
    .update(await readFile(".local/data.json"))
    .digest("hex");
  const sourceUnchanged = before === after;
  if (!sourceUnchanged) {
    passed = false;
    errors.push("Main data changed during the run.");
  }
  await writeFile(path.join(out, "server.log"), log);
  await writeFile(
    path.join(out, "report.json"),
    JSON.stringify(
      {
        passed,
        checkedAt: new Date().toISOString(),
        checks,
        errors,
        a11y,
        sourceUnchanged,
        fixtureRemoved: true,
      },
      null,
      2,
    ),
  );
  process.exitCode = passed ? 0 : 1;
}
