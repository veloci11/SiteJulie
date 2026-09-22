// Real browser acceptance on a throwaway copy. Never uses production storage.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import {
  artworkSize,
  slotForArtwork,
} from "../lib/museum/config.ts";

const project = process.cwd();
const out = path.join(project, "artifacts/admin-initial-size");
await mkdir(out, { recursive: true });
const before = createHash("sha256")
  .update(await readFile(".local/data.json"))
  .digest("hex");
const fixture = await mkdtemp(path.join(os.tmpdir(), "museum-initial-size-"));
await cp(".local/data.json", path.join(fixture, "seed.json"));
await cp(".local/media", path.join(fixture, "media"), { recursive: true });
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
    MUSEUM_ARRIVAL_GENERATION: "0",
    MUSEUM_LOCAL_DATA_DIR: fixture,
    NEXT_PUBLIC_SITE_URL: origin,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "",
  browser,
  page;
child.stdout.on("data", (chunk) => {
  log += chunk;
});
child.stderr.on("data", (chunk) => {
  log += chunk;
});
const checks = [],
  errors = [];
let passed = false;
const mark = (name) => {
  checks.push(name);
  console.log(`PASS ${name}`);
};
const hardLimit = setTimeout(() => {
  browser?.close().catch(() => {});
  child.kill("SIGTERM");
}, 360000);
try {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(log);
    try {
      if ((await fetch(`${origin}/admin`)).ok) break;
    } catch {}
    if (i === 79) throw new Error("Server unavailable");
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    hasTouch: true,
  });
  context.setDefaultTimeout(10000);
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const allStored = async () =>
    await (await context.request.get(`${origin}/api/admin/artworks`)).json();
  async function enter(p) {
    // This campaign isolates sizing. Arrival-poster generation has its own QA.
    await p.route("**/api/museum/arrival/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ready: true }),
      }),
    );
    await p.goto(`${origin}/admin`);
    const login = p.getByRole("button", {
      name: "Ouvrir l’atelier de démonstration",
    });
    if (await login.count()) await login.click();
    await expect(p.getByRole("heading", { name: /Les œuvres/ })).toBeVisible();
  }
  async function save(p) {
    await p
      .getByRole("button", {
        name: "Enregistrer les modifications",
        exact: true,
      })
      .click();
    await expect(p.locator(".admin-dirty-state")).toHaveText(
      "Tout est enregistré",
    );
  }
  await enter(page);
  await page
    .getByRole("button", { name: "Ajouter une œuvre", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Titre", { exact: true })
    .fill("Fixture temporaire 50 × 90");
  await page.getByLabel("Largeur réelle (cm)", { exact: true }).fill("50");
  await page.getByLabel("Hauteur réelle (cm)", { exact: true }).fill("90");
  const buffer = await sharp({
    create: { width: 500, height: 900, channels: 3, background: "#795f72" },
  })
    .png()
    .toBuffer();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "fixture-50-90.png",
      mimeType: "image/png",
      buffer,
    });
  await expect(page.locator(".admin-pending-image")).toBeVisible();
  await page
    .getByLabel("Texte alternatif")
    .fill("Rectangle de test sans valeur artistique");
  await page
    .locator(".admin-publication select")
    .selectOption("published");
  await save(page);
  const created = (await allStored()).artworks.find(
    (a) => a.title === "Fixture temporaire 50 × 90",
  );
  expect(created.publication).toBe("published");
  expect(created.imageWidth).toBe(500);
  expect(created.imageHeight).toBe(900);
  const size = artworkSize(created, slotForArtwork(created));
  expect(size.width).toBeCloseTo(0.5, 7);
  expect(size.height).toBeCloseTo(0.9, 7);
  await page.locator('[data-section="placement"] > summary').click();
  await expect(
    page.getByLabel("Taille dans le showroom", { exact: true }),
  ).toHaveValue("100");
  await page
    .locator(".admin-placement-adjust")
    .screenshot({ path: path.join(out, "new-painting-50-90.png") });
  await page.reload();
  await page
    .locator(".admin-artwork-card")
    .filter({ hasText: "Fixture temporaire 50 × 90" })
    .click();
  await page.locator('[data-section="placement"] > summary').click();
  await expect(
    page.getByLabel("Taille dans le showroom", { exact: true }),
  ).toHaveValue("100");
  const publicData = await (
    await context.request.get(`${origin}/api/museum/data`)
  ).json();
  const exposed = publicData.artworks.find((a) => a.id === created.id);
  expect(artworkSize(exposed, slotForArtwork(exposed)).height).toBeCloseTo(
    0.9,
    7,
  );
  mark(
    "A brand-new 500×900 image with dimensions entered before upload publishes at exactly 50×90 cm and 100%, then preserves both after reopening",
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
        sourceUnchanged,
        fixtureRemoved: true,
      },
      null,
      2,
    ),
  );
  process.exitCode = passed ? 0 : 1;
}
