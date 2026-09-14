// Bounded UI acceptance on a throwaway seed copy. Reuses the existing standalone
// build; never rebuilds/copies the project, never targets the user's data server.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import {
  mkdtemp,
  readFile,
  writeFile,
  cp,
  rm,
  mkdir,
  access,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const project = process.cwd();
const port = 3003;
const origin = `http://127.0.0.1:${port}`;
const out = path.join(project, "artifacts/admin-save-collections");
const standalone = path.join(project, ".next/standalone");
await access(path.join(standalone, "server.js"));
await access(path.join(standalone, ".next/static"));
await mkdir(out, { recursive: true });
// Refuse an occupied port instead of connecting to or stopping somebody else's server.
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", resolve);
});
await new Promise((resolve) => probe.close(resolve));
const digest = (value) => createHash("sha256").update(value).digest("hex");
async function sourceState() {
  const result = {};
  for (const name of ["seed.json", "data.json"]) {
    try {
      result[name] = digest(await readFile(path.join(project, ".local", name)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      result[name] = null;
    }
  }
  for (const variant of ["thumb", "room", "detail"]) {
    result[`oeuvre-03-${variant}.webp`] = digest(
      await readFile(
        path.join(project, ".local/media", `oeuvre-03-${variant}.webp`),
      ),
    );
  }
  const manifest = JSON.parse(
    await readFile(
      path.join(project, "references/artworks/manifest.json"),
      "utf8",
    ),
  );
  result.originalSource = digest(
    await readFile(
      path.join(project, "ImageOeuvre", manifest.artworks[2].source_filename),
    ),
  );
  return result;
}
const before = await sourceState();
const fixture = await mkdtemp(path.join(os.tmpdir(), "museum-placement-qa-"));
if (path.resolve(fixture) === path.resolve(project, ".local"))
  throw new Error("Fixture must be isolated");
let child,
  browser,
  page,
  serverLog = "",
  passed = false;
const checks = [];
const placements = [];
const errors = [];
const started = Date.now();
const hardLimit = setTimeout(() => {
  browser?.close().catch(() => {});
  child?.kill("SIGTERM");
}, 180000);
try {
  await cp(
    path.join(
      project,
      ".local",
      before["data.json"] ? "data.json" : "seed.json",
    ),
    path.join(fixture, "seed.json"),
  );
  await cp(path.join(project, ".local/media"), path.join(fixture, "media"), {
    recursive: true,
  });
  const seed = JSON.parse(
    await readFile(path.join(fixture, "seed.json"), "utf8"),
  );
  expect(seed.rooms).toEqual(["room-1", "room-2"]);
  const original = seed.artworks.find((a) => a.id === "oeuvre-03");
  expect(original.collection).toBe("Visages");
  expect(original.roomId).toBe("room-1");
  for (const room of seed.rooms)
    expect(
      seed.artworks.some(
        (a) => a.roomId === room && a.publication === "published",
      ),
    ).toBe(true);
  child = spawn(process.execPath, [path.join(standalone, "server.js")], {
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
  child.stdout.on("data", (chunk) => {
    serverLog += chunk;
  });
  child.stderr.on("data", (chunk) => {
    serverLog += chunk;
  });
  child.on("error", (error) => {
    serverLog += String(error);
  });
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null)
      throw new Error(`Fixture server exited: ${serverLog}`);
    try {
      const r = await fetch(`${origin}/admin`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) break;
    } catch {}
    if (i === 39) throw new Error(`Fixture server not ready: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  // The login UI is served by /admin; /api/admin/login is its existing POST route.
  // There is no separate /admin/login page in the current app.
  await page.goto(`${origin}/admin`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", {
      name: "Ouvrir l’atelier de démonstration",
      exact: true,
    })
    .click();
  await expect(page.locator(".admin-artwork-card")).toHaveCount(8);
  await expect(page.locator(".admin-collection-group")).toHaveCount(2);
  for (const group of await page.locator(".admin-collection-group").all())
    expect(
      await group.locator(".admin-order-number").allTextContents(),
    ).toEqual(["1", "2", "3", "4"]);
  await page.screenshot({
    path: path.join(out, "collections-desktop.png"),
    fullPage: true,
  });
  await page
    .locator(".admin-artwork-card")
    .filter({ hasText: original.title })
    .click();
  const save = page.getByRole("button", {
    name: "Enregistrer les modifications",
    exact: true,
  });
  async function read() {
    const r = await context.request.get(`${origin}/api/admin/artworks`);
    expect(r.status()).toBe(200);
    return r.json();
  }
  async function stored() {
    return (await read()).artworks.find((a) => a.id === original.id);
  }
  async function submit(status = 200) {
    const pending = page.waitForResponse(
      (r) =>
        r.url() === `${origin}/api/admin/artworks` &&
        r.request().method() === "POST",
    );
    await save.click();
    const r = await pending;
    expect(r.status()).toBe(status);
    await expect(save).toBeEnabled();
    return r.json();
  }
  const title = "Portrait — vérification de l’enregistrement";
  await page.getByLabel("Titre", { exact: true }).fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Texte enregistré sur la fixture uniquement.");
  await page.getByLabel(/^Disponibilité/).selectOption("sold");
  await submit();
  await expect(page.locator(".admin-save-feedback")).toContainText(
    "Enregistré",
  );
  expect(await stored()).toMatchObject({
    title,
    availability: "sold",
    publication: "published",
  });
  await page.screenshot({ path: path.join(out, "save-success.png") });
  const firstSaved = await stored();
  await page.getByLabel(/^Identifiant du lien/).fill("oeuvre-01");
  await submit(409);
  await expect(
    page.locator('.admin-save-feedback[role="alert"]'),
  ).toContainText("existe déjà");
  const errorRect = await page.locator(".admin-save-feedback").boundingBox();
  expect(errorRect.y).toBeGreaterThanOrEqual(0);
  expect(errorRect.y + errorRect.height).toBeLessThanOrEqual(1000);
  expect(await stored()).toEqual(firstSaved);
  await page.screenshot({ path: path.join(out, "save-error-visible.png") });
  await page.getByLabel(/^Identifiant du lien/).fill(original.slug);
  checks.push(
    "Real save 200 persists title/content/sold; server 409 leaves data intact and error fully visible next to Save",
  );
  await page.getByLabel("Titre", { exact: true }).fill("");
  await save.click();
  await expect(page.locator(".admin-save-feedback")).toContainText("Titre");
  expect(await stored()).toEqual(firstSaved);
  await page.getByLabel("Titre", { exact: true }).fill(title);
  checks.push(
    "Invalid required field yields explicit feedback without a partial write",
  );
  await page.getByLabel(/^Collection/).selectOption("Récits & paysages");
  await expect(page.locator(".admin-placement-room")).toContainText("Salle 2");
  await expect(page.locator(".admin-wall-slot.selected")).toHaveCount(1);
  await expect(page.getByLabel(/^Position dans la collection/)).toHaveValue(
    "4",
  );
  await submit();
  const moved = await stored();
  expect(moved).toMatchObject({
    collection: "Récits & paysages",
    roomId: "room-2",
    order: 4,
    publication: "published",
    availability: "sold",
  });
  expect(moved.slotId).toMatch(/^room-2-slot-/);
  expect(moved.image).toBe(original.image);
  const allMoved = await read();
  expect(allMoved.rooms).toEqual(seed.rooms);
  expect(
    allMoved.artworks
      .filter((a) => a.collection === "Visages")
      .map((a) => a.order),
  ).toEqual([0, 1, 2]);
  expect(
    allMoved.artworks
      .filter((a) => a.collection === "Récits & paysages")
      .map((a) => a.order),
  ).toEqual([0, 1, 2, 3, 4]);
  placements.push(moved);
  await page
    .locator(".admin-placement")
    .screenshot({ path: path.join(out, "collection-placement.png") });
  await page.getByLabel(/^Position dans la collection/).selectOption("0");
  await submit();
  const reordered = await stored();
  expect(reordered.order).toBe(0);
  expect(
    (await read()).artworks
      .filter((a) => a.collection === "Récits & paysages")
      .map((a) => a.id),
  ).toEqual([original.id, "oeuvre-01", "oeuvre-02", "oeuvre-04", "oeuvre-05"]);
  const stale = await context.request.post(`${origin}/api/admin/artworks`, {
    headers: { origin },
    data: moved,
  });
  expect(stale.status()).toBe(409);
  expect(await stored()).toEqual(reordered);
  checks.push(
    "Collection change chooses a compatible free place in room 2; local ranks close gaps in room 1; inserting at position 1 shifts peers atomically; stale revision rejected",
  );
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Ouvrir l’atelier de démonstration",
      exact: true,
    })
    .click();
  const group = page.locator(
    '.admin-collection-group[data-collection="Récits & paysages"]',
  );
  await expect(group.locator(".admin-artwork-card").first()).toContainText(
    title,
  );
  expect(await group.locator(".admin-order-number").allTextContents()).toEqual([
    "1",
    "2",
    "3",
    "4",
    "5",
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  const longTitle = group
    .locator(".admin-artwork-card")
    .first()
    .locator(".admin-artwork-title");
  await expect(longTitle).toBeVisible();
  expect(
    await longTitle.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  const titleRect = await longTitle.boundingBox();
  const cardRect = await group
    .locator(".admin-artwork-card")
    .first()
    .boundingBox();
  expect(titleRect.x + titleRect.width).toBeLessThanOrEqual(
    cardRect.x + cardRect.width,
  );
  await page.screenshot({
    path: path.join(out, "collections-mobile.png"),
    fullPage: true,
  });
  await group.locator(".admin-artwork-card").first().click();
  await expect(page.getByLabel(/^Collection/)).toHaveValue("Récits & paysages");
  await expect(page.getByLabel(/^Position dans la collection/)).toHaveValue(
    "0",
  );
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue(title);
  await submit();
  await page.screenshot({ path: path.join(out, "mobile-save-feedback.png") });
  const mobileError = await page.locator(".admin-save-feedback").boundingBox();
  expect(mobileError.y).toBeGreaterThanOrEqual(0);
  expect(mobileError.y + mobileError.height).toBeLessThanOrEqual(844);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const disk = JSON.parse(
    await readFile(path.join(fixture, "data.json"), "utf8"),
  );
  expect(disk.artworks.find((a) => a.id === original.id)).toEqual(
    await stored(),
  );
  const anonymous = await browser.newContext();
  const denied = await anonymous.request.get(`${origin}/api/admin/artworks`);
  expect(denied.status()).toBe(401);
  const publicPage = await anonymous.newPage();
  await publicPage.goto(`${origin}/oeuvres`);
  await expect(
    publicPage.locator(`.catalogue-card[href="/oeuvres/${original.slug}"]`),
  ).toHaveAttribute("data-availability", "sold");
  await anonymous.close();
  checks.push(
    "Logout/login preserves moved room, content and local position; mobile Save feedback fits viewport; disk persistence and anonymous admin denial verified",
  );
  expect(errors).toEqual([]);
  passed = true;
} catch (error) {
  errors.push(String(error));
  await page
    ?.screenshot({ path: path.join(out, "failure.png"), fullPage: true })
    .catch(() => {});
} finally {
  clearTimeout(hardLimit);
  await browser?.close();
  if (child && child.exitCode === null) {
    const stopped = once(child, "exit");
    child.kill("SIGTERM");
    const killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await stopped;
    clearTimeout(killTimer);
  }
  await rm(fixture, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
  const after = await sourceState();
  const sourceUnchanged = JSON.stringify(before) === JSON.stringify(after);
  if (!sourceUnchanged) {
    passed = false;
    errors.push(
      "Main .local seed/data changed during isolated QA; investigate concurrent writes",
    );
  }
  await writeFile(path.join(out, "server.log"), serverLog);
  const report = {
    passed,
    port,
    checkedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    sourceHashes: before,
    webGL: false,
    checks,
    placements,
    errors,
    fixtureRemoved: true,
    mainSeedAndDataUnchanged: sourceUnchanged,
    reusedStandaloneBuild: true,
    rebuiltProject: false,
  };
  await writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = passed ? 0 : 1;
}
