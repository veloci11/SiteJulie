// Runs a real, disposable local admin acceptance journey. Never edits the main .local dataset.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import {
  mkdtemp,
  readFile,
  writeFile,
  cp,
  rm,
  mkdir,
  symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
const sourceState = async () =>
  Object.fromEntries(
    await Promise.all(
      ["seed.json", "data.json"].map(async (name) => {
        try {
          return [
            name,
            createHash("sha256")
              .update(await readFile(path.join(".local", name)))
              .digest("hex"),
          ];
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
          return [name, null];
        }
      }),
    ),
  );
const sourceBefore = await sourceState();
const fixture = await mkdtemp(path.join(os.tmpdir(), "museum-browser-"));
const port = Number(process.env.ADMIN_QA_PORT || 3001);
const origin = `http://127.0.0.1:${port}`;
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", resolve);
});
await new Promise((resolve) => probe.close(resolve));
process.env.NEXT_PUBLIC_SITE_URL = origin;
process.env.MUSEUM_LOCAL_DATA_DIR = fixture;
process.env.MUSEUM_DATA_MODE = "demo";
process.env.MUSEUM_LOCAL_PREVIEW = "1";
await cp(".local/seed.json", path.join(fixture, "seed.json"));
await cp(".local/media", path.join(fixture, "media"), { recursive: true });
const project = path.join(fixture, "project");
await mkdir(project);
for (const name of [
  "app",
  "components",
  "lib",
  "public",
  "package.json",
  "tsconfig.json",
  "next-env.d.ts",
  "postcss.config.mjs",
])
  await cp(name, path.join(project, name), { recursive: true });
await symlink(
  path.resolve("node_modules"),
  path.join(project, "node_modules"),
  "dir",
);
await writeFile(
  path.join(project, "next.config.mjs"),
  `export default {allowedDevOrigins:['127.0.0.1'],turbopack:{root:${JSON.stringify(process.cwd())}}};`,
);
const build = spawn(
  process.execPath,
  [path.resolve("node_modules/next/dist/bin/next"), "build", "--webpack"],
  { cwd: project, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
);
let buildLog = "";
build.stdout.on("data", (s) => (buildLog += s));
build.stderr.on("data", (s) => (buildLog += s));
const [buildCode] = await once(build, "exit");
if (buildCode !== 0) {
  console.error(buildLog);
  await rm(fixture, { recursive: true, force: true });
  process.exit(1);
}
const child = spawn(
  process.execPath,
  [
    path.resolve("node_modules/next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { cwd: project, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
child.stdout.on("data", (s) => (logs += s));
child.stderr.on("data", (s) => (logs += s));
for (let tries = 0; tries < 120; tries++) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/admin`);
    if (response.ok) break;
  } catch {}
  if (tries === 119) throw new Error(logs);
  await new Promise((r) => setTimeout(r, 500));
}
let browser;
let qaPage;
let passed = false;
try {
  browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: [
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const admin = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await admin.newPage();
  qaPage = page;
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  const errors = [];
  publicPage.on("pageerror", (error) => errors.push(error.message));
  const save = async () => {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/artworks") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", {
        name: "Enregistrer les modifications",
        exact: true,
      })
      .click();
    const result = await response;
    expect(result.ok(), await result.text()).toBe(true);
    await expect(
      page.getByRole("button", {
        name: "Enregistrer les modifications",
        exact: true,
      }),
    ).toBeEnabled();
  };
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/admin`, {
    waitUntil: "networkidle",
  });
  await page
    .getByRole("button", { name: "Ouvrir l’atelier de démonstration" })
    .click();
  await page.getByRole("button", { name: "Ajouter une œuvre" }).click();
  await page.getByLabel("Titre", { exact: true }).fill("Fixture QA temporaire");
  await page.getByLabel("Identifiant du lien").fill("fixture-qa-temporaire");
  await page.getByLabel("Collection / série", { exact: true }).fill("Visages");
  const file = path.join(fixture, "fixture.png");
  await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#776e91" },
  })
    .png()
    .toFile(file);
  await page.locator("input[type=file]").setInputFiles(file);
  await expect(
    page.getByText("Image traitée : miniature, vue de salle et détail prêts."),
  ).toBeVisible({ timeout: 60000 });
  await page
    .getByLabel("Texte alternatif")
    .fill("Rectangle violet, fixture de validation jetable.");
  const draftData = JSON.parse(
    await readFile(path.join(fixture, "data.json"), "utf8"),
  );
  const draft = draftData.artworks.find(
    (a) => a.slug === "fixture-qa-temporaire",
  );
  expect(draft.publication).toBe("draft");
  expect(
    (
      await publicContext.request.get(`${origin}/oeuvres/${draft.slug}`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await publicContext.request.get(
        `${origin}/api/media/${draft.id}?variant=detail`,
      )
    ).status(),
  ).toBe(401);
  expect(
    (await publicContext.request.get(`${origin}/api/admin/artworks`)).status(),
  ).toBe(401);
  await page.getByLabel("Affichage du prix").selectOption("public");
  await page.getByLabel("Prix", { exact: true }).fill("1234.56");
  await page
    .getByLabel("Publication", { exact: false })
    .selectOption("published");
  await save();
  await expect(
    page.getByText(
      "Œuvre publiée. Elle est visible dans le musée et le catalogue.",
    ),
  ).toBeVisible();
  await publicPage.goto(
    `http://127.0.0.1:${port}/oeuvres/fixture-qa-temporaire`,
  );
  await expect(
    publicPage.getByRole("heading", { name: "Fixture QA temporaire" }),
  ).toBeVisible();
  await expect(
    publicPage.getByText(/1[\s\u00a0\u202f]?234,56/).first(),
  ).toBeVisible();
  await mkdir("artifacts/admin", { recursive: true });
  await page.screenshot({
    path: "artifacts/admin/published-fixture.png",
    fullPage: true,
  });
  // A real edit after first publication must reach a separate anonymous session.
  await page.getByLabel("Prix", { exact: true }).fill("2345.67");
  await page.getByLabel(/^Disponibilité/).selectOption("reserved");
  await save();
  await publicPage.reload();
  await expect(publicPage.locator(".artwork-price")).toContainText(
    /2[\s\u00a0\u202f]?345,67/,
  );
  await expect(publicPage.locator(".availability")).toHaveText("Réservée");
  await page.getByLabel(/^Disponibilité/).selectOption("sold");
  await save();
  await publicPage.reload();
  await expect(publicPage.locator(".availability")).toHaveText("Vendue");
  const immersive = await publicContext.newPage();
  await immersive.setViewportSize({ width: 1440, height: 900 });
  await immersive.goto(`${origin}/?vue=oeuvre&slug=${draft.slug}`);
  await expect(immersive.locator(".visit-details .visit-price")).toContainText(
    /2[\s\u00a0\u202f]?345,67/,
    { timeout: 60000 },
  );
  const film = immersive.locator(`[data-artwork="${draft.id}"]`);
  await expect(film.locator(".visit-film-price")).toContainText(
    /2[\s\u00a0\u202f]?345,67/,
  );
  await expect(film.locator(".visit-film-status")).toHaveText("Vendue");
  await immersive.locator(".visit-collection-button").click();
  await expect(
    immersive.locator(`[id="selection-price-${draft.id}"]`),
  ).toContainText(/2[\s\u00a0\u202f]?345,67/);
  await immersive.screenshot({
    path: "artifacts/admin/public-selection-price.png",
    fullPage: true,
  });
  await immersive.close();
  await page.getByLabel("Affichage du prix").selectOption("on_request");
  await save();
  await expect(
    page.getByText(
      "Œuvre publiée. Elle est visible dans le musée et le catalogue.",
    ),
  ).toBeVisible();
  await publicPage.reload();
  expect(await publicPage.content()).not.toContain("234567");
  expect(await publicPage.locator("body").innerText()).not.toMatch(
    /2[\s\u00a0\u202f]?345,67/,
  );
  const saved = JSON.parse(
    await readFile(path.join(fixture, "data.json"), "utf8"),
  );
  const artwork = saved.artworks.find(
    (a) => a.slug === "fixture-qa-temporaire",
  );
  expect(artwork.priceMinor).toBe(234567);
  expect(artwork.slotId).toBeTruthy();
  const mobile = await publicContext.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${origin}/?vue=oeuvre&slug=${artwork.slug}`);
  await expect(mobile.locator(".visit-details .visit-price")).toContainText(
    "Prix sur demande",
    { timeout: 60000 },
  );
  await expect(mobile.locator(".visit-price-status")).toHaveText("Vendue");
  await expect(mobile.locator(".visit-price-status")).toBeVisible();
  expect(await mobile.content()).not.toContain("234567");
  await mobile.screenshot({
    path: "artifacts/admin/mobile-hidden-price-sold.png",
    fullPage: true,
  });
  await mobile.close();
  const catalogHtml = await (
    await publicContext.request.get(`${origin}/oeuvres`)
  ).text();
  expect(catalogHtml).not.toContain("234567");
  expect(catalogHtml).not.toMatch(/2[\s\u00a0\u202f]?345,67/);
  expect(await publicPage.content()).not.toContain('"priceVisibility"');
  await expect(publicPage.locator(".artwork-price")).toHaveText(
    "Prix sur demande",
  );
  console.log(
    "Creation, upload, price changes, public filmstrip and mobile sold state passed.",
  );
  // Settings are edited through the real admin UI and are read without rebuilding.
  await page
    .getByRole("button", { name: "Textes & contact", exact: true })
    .click();
  await page.getByLabel("Nom de l’artiste").fill("Artiste QA — fictive");
  await page.getByLabel("Accroche courte").fill("Signature QA temporaire");
  await page.getByLabel("Titre d’accueil").fill("Accueil QA temporaire");
  await page
    .getByLabel(/^Présentation/)
    .fill("Biographie QA fictive, uniquement pour ce test jetable.");
  await page
    .locator(".admin-card")
    .filter({
      has: page.getByRole("heading", { name: "À propos", exact: true }),
    })
    .getByLabel("Titre du mur")
    .fill("À propos QA");
  await page
    .locator(".admin-card")
    .filter({
      has: page.getByRole("heading", { name: "Contact", exact: true }),
    })
    .getByLabel("Titre du mur")
    .fill("Contact QA");
  await page
    .getByLabel("Message d’accueil")
    .fill("Message QA temporaire, aucun envoi.");
  await page
    .getByLabel("Adresse email publique")
    .fill("atelier-qa@example.com");
  await page.getByLabel("Devise par défaut").selectOption("CHF");
  const settingsSaved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/settings") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Enregistrer les textes" }).click();
  expect((await settingsSaved).ok()).toBe(true);
  await expect(page.getByText("Textes et contact mis à jour.")).toBeVisible();
  await page.screenshot({
    path: "artifacts/admin/settings-fixture.png",
    fullPage: true,
  });
  await publicPage.goto(`${origin}/a-propos`);
  await expect(
    publicPage.getByText(
      "Biographie QA fictive, uniquement pour ce test jetable.",
    ),
  ).toBeVisible();
  await publicPage.goto(`${origin}/contact?oeuvre=${artwork.slug}`);
  await expect(
    publicPage.getByRole("heading", { name: "Contact QA" }),
  ).toBeVisible();
  await expect(
    publicPage.getByText(artwork.title, { exact: true }),
  ).toBeVisible();
  const mailto = await publicPage
    .getByRole("link", { name: "Écrire un message" })
    .getAttribute("href");
  const mail = new URL(mailto);
  expect(mail.protocol).toBe("mailto:");
  expect(mail.pathname).toBe("atelier-qa@example.com");
  expect(mail.searchParams.get("subject")).toContain(artwork.id);
  expect(mail.searchParams.get("body")).toContain(artwork.title);
  expect(mail.searchParams.get("body")).toContain(
    `${origin}/oeuvres/${artwork.slug}`,
  );
  await expect(
    publicPage.getByText("Ouvre votre application de messagerie."),
  ).toBeVisible();
  await publicContext.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin,
  });
  await publicPage
    .getByRole("button", { name: "Copier l’adresse email" })
    .click();
  await expect(publicPage.getByText("Adresse copiée.")).toBeVisible();
  expect(await publicPage.evaluate(() => navigator.clipboard.readText())).toBe(
    "atelier-qa@example.com",
  );
  await publicPage.screenshot({
    path: "artifacts/admin/contact-fixture.png",
    fullPage: true,
  });
  await publicPage
    .getByRole("link", { name: "Faire une demande générale" })
    .click();
  await expect(publicPage.locator(".contact-context")).toHaveCount(0);
  const generic = await publicPage
    .getByRole("link", { name: "Écrire un message" })
    .getAttribute("href");
  expect(decodeURIComponent(generic)).not.toContain(artwork.id);
  expect(decodeURIComponent(generic)).not.toContain(artwork.title);
  console.log("Artist settings, contextual 2D mailto and clipboard passed.");
  const contact3d = await publicContext.newPage();
  await contact3d.goto(`${origin}/?vue=contact&oeuvre=${artwork.id}`);
  const contactLink3d = contact3d.getByRole("link", {
    name: "Écrire un message",
  });
  await expect(contactLink3d).toHaveAttribute("href", mailto, {
    timeout: 60000,
  });
  await contact3d
    .getByRole("button", { name: "Copier l’adresse email" })
    .click();
  await expect(contact3d.getByText("Adresse copiée.")).toBeVisible();
  expect(await contact3d.evaluate(() => navigator.clipboard.readText())).toBe(
    "atelier-qa@example.com",
  );
  await contact3d.screenshot({
    path: "artifacts/admin/contact-immersive-fixture.png",
    fullPage: true,
  });
  await contact3d.close();
  console.log("Immersive mailto and clipboard passed.");
  await page.getByRole("button", { name: "Les œuvres", exact: true }).click();
  await page.getByRole("button", { name: /Fixture QA temporaire/ }).click();
  await page.getByLabel("Publication", { exact: false }).selectOption("draft");
  await save();
  expect(
    (
      await publicContext.request.get(`${origin}/oeuvres/${artwork.slug}`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await publicContext.request.get(
        `${origin}/api/media/${artwork.id}?variant=room`,
      )
    ).status(),
  ).toBe(401);
  expect(
    await (await publicContext.request.get(`${origin}/sitemap.xml`)).text(),
  ).not.toContain(artwork.slug);
  await page
    .getByLabel("Publication", { exact: false })
    .selectOption("published");
  await save();
  expect(
    (
      await publicContext.request.get(`${origin}/oeuvres/${artwork.slug}`)
    ).status(),
  ).toBe(200);
  const persisted = JSON.parse(
    await readFile(path.join(fixture, "data.json"), "utf8"),
  );
  expect(persisted.settings.email).toBe("atelier-qa@example.com");
  expect(persisted.settings.currency).toBe("CHF");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page
    .getByRole("button", { name: "Ouvrir l’atelier de démonstration" })
    .click();
  await page.getByRole("button", { name: /Fixture QA temporaire/ }).click();
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue(
    "Fixture QA temporaire",
  );
  await page
    .getByLabel("Publication", { exact: false })
    .selectOption("archived");
  await save();
  await expect(page.getByText("Modifications enregistrées.")).toBeVisible();
  const response = await publicPage.goto(`${origin}/oeuvres/${artwork.slug}`);
  expect(response.status()).toBe(404);
  const media = await publicContext.request.get(
    `http://127.0.0.1:${port}/api/media/${artwork.id}?variant=room`,
  );
  expect(media.status()).toBe(401);
  expect(errors).toEqual([]);
  expect(await sourceState()).toEqual(sourceBefore);
  const report = {
    passed: true,
    checkedAt: new Date().toISOString(),
    sourceUnchanged:
      JSON.stringify(await sourceState()) === JSON.stringify(sourceBefore),
    mainSourceHashes: sourceBefore,
    browser: "Chromium headless",
    viewport: "1440×1000",
    checks: [
      "sign in",
      "create draft",
      "real PNG upload and Sharp variants",
      "publish + automatic slot",
      "public separate session with price",
      "edit price 1234.56 to 2345.67 in separate anonymous session",
      "reserved and sold stay published with public badges",
      "immersive filmstrip and collection display changed price; mobile sold badge stays visible with hidden price",
      "hide price without HTML/RSC/catalogue leakage while retaining internal amount",
      "draft page/media and anonymous admin API deny access",
      "artist, biography, home/contact texts, email and default currency persist",
      "2D and immersive contextual mailto exact recipient/reference/title/absolute link and generic context reset",
      "real clipboard copy; no email link clicked or message sent",
      "depublish -> page/media denied; republish restores page; demo stays excluded from sitemap",
      "persist across logout/login",
      "archive -> public 404 and private media denied",
    ],
    fixtureRemoved: true,
  };
  await writeFile(
    "artifacts/admin/browser-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
  passed = true;
} catch (error) {
  console.error(error);
  await qaPage?.screenshot({
    path: "artifacts/admin/qa-failure.png",
    fullPage: true,
  });
} finally {
  await browser?.close();
  const stopped = once(child, "exit");
  child.kill("SIGTERM");
  await stopped;
  await rm(fixture, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
  process.exitCode = passed ? 0 : 1;
}
