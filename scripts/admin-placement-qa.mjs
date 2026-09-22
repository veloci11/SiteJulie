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
const out = path.join(project, "artifacts/admin-placement");
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
    path.join(project, ".local/seed.json"),
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
  await page
    .locator(".admin-artwork-card")
    .filter({ hasText: original.title })
    .click();
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue(
    original.title,
  );
  checks.push("Existing demo login UI opens the isolated eight-work seed");
  const save = page.getByRole("button", {
    name: "Enregistrer les modifications",
    exact: true,
  });
  async function stored() {
    const response = await context.request.get(`${origin}/api/admin/artworks`);
    expect(response.status()).toBe(200);
    return (await response.json()).artworks.find((a) => a.id === original.id);
  }
  async function submit() {
    const response = page.waitForResponse(
      (r) =>
        r.url() === `${origin}/api/admin/artworks` &&
        r.request().method() === "POST",
    );
    await save.click();
    expect((await response).status()).toBe(200);
    await expect(save).toBeEnabled();
  }
  await page.getByRole("button", { name: "Mur droit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Mur droit · 2 · occupé/ }),
  ).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Mur droit · 1 · emplacement libre",
      exact: true,
    })
    .click();
  const scale = page.getByRole("slider", {
    name: "Taille dans le showroom",
    exact: true,
  });
  await scale.fill("60");
  const draggable = page.locator(".admin-wall-slot.selected .is-draggable");
  await expect(draggable).toBeVisible();
  await draggable.scrollIntoViewIfNeeded();
  const zone = await page.locator(".admin-movement-zone").boundingBox();
  async function dragBy(dx, dy) {
    const box = await draggable.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(draggable).toHaveAttribute("data-dragging", "true");
    await page.mouse.move(
      box.x + box.width / 2 + dx,
      box.y + box.height / 2 + dy,
      { steps: 6 },
    );
    await page.mouse.up();
    await expect(draggable).not.toHaveAttribute("data-dragging", "true");
  }
  await dragBy((0.2 * zone.width) / 2.47, (-0.15 * zone.height) / 3.17);
  await expect(page.getByLabel("Horizontal (cm)", { exact: true })).toHaveValue(
    "20",
  );
  await expect(
    page
      .locator(".admin-placement")
      .getByLabel("Hauteur (cm)", { exact: true }),
  ).toHaveValue("15");
  await dragBy(-500, 200);
  const xInput = page.getByLabel("Horizontal (cm)", { exact: true });
  const yInput = page
    .locator(".admin-placement")
    .getByLabel("Hauteur (cm)", { exact: true });
  await expect(xInput).toHaveValue(await xInput.getAttribute("min"));
  await expect(yInput).toHaveValue(await yInput.getAttribute("min"));
  expect(
    await draggable.evaluate((el) => getComputedStyle(el).touchAction),
  ).toBe("none");
  expect(
    await page
      .locator(".admin-wall-preview")
      .evaluate((el) => getComputedStyle(el).touchAction),
  ).not.toBe("none");
  checks.push(
    "Real pointer capture drag updates centimetre inputs; dragging beyond preview clamps at safe bounds; only the selected painting disables touch scrolling",
  );

  await page.getByLabel("Horizontal (cm)", { exact: true }).fill("20");
  await page
    .locator(".admin-placement")
    .getByLabel("Hauteur (cm)", { exact: true })
    .fill("15");
  await page
    .getByLabel(/^Description/)
    .fill("Description modifiée sur fixture jetable.");
  await page.getByLabel(/^Disponibilité/).selectOption("sold");
  await expect(page.locator(".admin-placement-ok")).toContainText(
    "sans chevauchement",
  );
  await submit();
  const placed = await stored();
  expect(placed).toMatchObject({
    slotId: "room-1-slot-05",
    roomId: "room-1",
    placementOffsetX: 0.2,
    placementOffsetY: 0.15,
    displayScale: 0.6,
    availability: "sold",
    publication: "published",
  });
  expect(placed.image).toBe(original.image);
  expect(placed.widthCm).toBe(original.widthCm);
  expect(placed.heightCm).toBe(original.heightCm);
  placements.push(placed);
  checks.push(
    "Visual wall selection, occupied target disabled, scale/offsets/content/sold saved without changing source or declared dimensions",
  );
  await page
    .locator(".admin-placement")
    .screenshot({ path: path.join(out, "wall-placement-desktop.png") });
  const rejected = await context.request.post(`${origin}/api/admin/artworks`, {
    headers: { origin },
    data: { ...placed, placementOffsetX: 5 },
  });
  expect(rejected.status()).toBe(409);
  expect(await stored()).toEqual(placed);
  checks.push(
    "Server rejects forged out-of-zone offset with no partial mutation",
  );
  const publicPage = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await publicPage.goto(`${origin}/oeuvres/${placed.slug}`);
  await expect(
    publicPage.getByRole("heading", { name: placed.title, exact: true }),
  ).toBeVisible();
  await expect(publicPage.locator(".availability")).toHaveText("Vendue");
  await expect(
    publicPage.getByText("Description modifiée sur fixture jetable.", {
      exact: true,
    }),
  ).toBeVisible();
  await publicPage.screenshot({
    path: path.join(out, "sold-public-detail.png"),
    fullPage: true,
  });
  await publicPage.goto(`${origin}/oeuvres`);
  const soldCard = publicPage.locator(
    `.catalogue-card[href="/oeuvres/${placed.slug}"]`,
  );
  await expect(soldCard).toHaveAttribute("data-availability", "sold");
  await expect(soldCard.getByText("Vendue", { exact: true })).toBeVisible();
  const soldImage = soldCard.locator(".catalogue-image img");
  await expect(soldImage).toBeVisible();
  const computed = await soldImage.evaluate((img) => ({
    filter: getComputedStyle(img).filter,
    opacity: getComputedStyle(img).opacity,
    source: img.currentSrc,
  }));
  expect(computed.filter).toContain("grayscale");
  expect(computed.filter).toContain("saturate");
  expect(Number(computed.opacity)).toBeCloseTo(0.7);
  const publicMedia = await publicPage.request.get(computed.source);
  expect(publicMedia.status()).toBe(200);
  expect(digest(await publicMedia.body())).toBe(before["oeuvre-03-room.webp"]);
  for (const variant of ["thumb", "room", "detail"])
    expect(
      digest(
        await readFile(
          path.join(fixture, "media", `oeuvre-03-${variant}.webp`),
        ),
      ),
    ).toBe(before[`oeuvre-03-${variant}.webp`]);
  await soldCard.screenshot({
    path: path.join(out, "sold-catalogue-card.png"),
  });
  checks.push(
    "Public catalogue sold data attribute and visible grayscale/saturation/opacity; served WebP bytes, fixture variants and original source are unchanged",
  );
  await publicPage.close();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page
    .getByRole("button", {
      name: "Ouvrir l’atelier de démonstration",
      exact: true,
    })
    .click();
  await page
    .locator(".admin-artwork-card")
    .filter({ hasText: original.title })
    .click();
  await expect(page.getByLabel("Horizontal (cm)", { exact: true })).toHaveValue(
    "20",
  );
  await expect(
    page
      .locator(".admin-placement")
      .getByLabel("Hauteur (cm)", { exact: true }),
  ).toHaveValue("15");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".admin-placement")
    .screenshot({ path: path.join(out, "wall-placement-mobile.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".admin-placement")
    .getByLabel("Hauteur (cm)", { exact: true })
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.screenshot({
    path: path.join(out, "mobile-controls-viewport.png"),
  });

  await page.getByLabel(/^Disponibilité/).selectOption("available");
  await submit();
  expect(await stored()).toMatchObject({
    availability: "available",
    publication: "published",
    placementOffsetX: 0.2,
    placementOffsetY: 0.15,
    displayScale: 0.6,
  });
  const disk = JSON.parse(
    await readFile(path.join(fixture, "data.json"), "utf8"),
  );
  expect(disk.artworks.find((a) => a.id === original.id)).toEqual(
    await stored(),
  );
  checks.push(
    "Sold remains public with edited content; offsets survive re-login; mobile editor has no horizontal overflow; returning to available keeps publication and placement",
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
