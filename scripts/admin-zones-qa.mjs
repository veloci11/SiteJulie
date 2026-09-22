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

const project = process.cwd();
const out = path.join(project, "artifacts/admin-zones");
await mkdir(out, { recursive: true });
const before = createHash("sha256")
  .update(await readFile(".local/data.json"))
  .digest("hex");
const fixture = await mkdtemp(path.join(os.tmpdir(), "museum-zones-"));
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
    MUSEUM_ARRIVAL_GENERATION: "0",
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

  const bySlot = (suffix) =>
    seed.artworks.find((a) => a.slotId === `room-1-slot-${suffix}`);
  const lower = bySlot("13"),
    upper = bySlot("02"),
    incoming = bySlot("04"),
    blocked = bySlot("03");
  async function enter(p) {
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
  }
  const open = async (p) =>
    p
      .getByRole("button", {
        name: /^(Réorganiser la salle 1|Reprendre le brouillon 1)$/,
      })
      .click();
  const select = async (p, a) =>
    p
      .locator(".room-layout-slot-list")
      .getByRole("button", {
        name: new RegExp("Sélectionner " + a.title + "$"),
      })
      .click();
  const zone = (p, number) =>
    p.locator(`.admin-movement-zone[data-zone-id="room-1-slot-${number}"]`);
  const work = (p, a) =>
    p.locator(`.room-layout-board [data-artwork-id="${a.id}"]`);
  const draftSave = (p) =>
    p.getByRole("button", { name: "Enregistrer le brouillon", exact: true });
  const apply = (p) =>
    p.getByRole("button", { name: "Appliquer à la galerie", exact: true });
  const session = async () =>
    (
      await context.request.get(`${origin}/api/admin/room-layout?roomId=room-1`)
    ).json();
  const publicData = async () =>
    (await context.request.get(`${origin}/api/museum/data`)).json();
  const geometry = async (p, ids) =>
    Object.fromEntries(
      await Promise.all(
        ids.map(async (id) => [
          id,
          await p.locator(`[data-artwork-id="${id}"]`).getAttribute("style"),
        ]),
      ),
    );
  await enter(page);
  const initialPublic = await publicData();
  await open(page);
  await expect(page.locator(".admin-movement-zone")).toHaveCount(4);
  await expect(
    page.locator(
      '.room-layout-board [data-zone-id="room-1-slot-02"].admin-wall-slot',
    ),
  ).toHaveCount(2);
  await expect(page.locator(".room-layout-workspace")).not.toContainText(
    "A2 bas",
  );
  await expect(page.locator(".admin-room-map")).toBeVisible();
  for (const a of [lower, upper]) {
    const hit = await work(page, a).boundingBox();
    const frame = await work(page, a)
      .locator(".admin-wall-artwork")
      .boundingBox();
    expect(Math.abs(hit.width - frame.width)).toBeLessThan(1);
    expect(Math.abs(hit.height - frame.height)).toBeLessThan(1);
  }
  mark(
    "A2 is one persistent dashed zone containing both original works; hitboxes follow each actual frame",
  );
  await select(page, lower);
  await page.locator(".room-layout-adjust > summary").click();
  const x = page.getByLabel("Horizontal (cm)", { exact: true });
  const startX = Number(await x.inputValue());
  await work(page, lower).scrollIntoViewIfNeeded();
  const r = await work(page, lower).boundingBox(),
    z = await zone(page, "02").boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    r.x + r.width / 2 + (z.width * 0.35) / 2.47,
    r.y + r.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(x).toHaveValue(String(startX + 35));
  await page
    .getByRole("button", { name: "Annuler le geste", exact: true })
    .click();
  await expect(x).toHaveValue(String(startX));
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect(x).toHaveValue(String(startX + 35));
  await draftSave(page).click();
  await expect(page.locator(".room-layout-status")).toContainText(
    "Brouillon enregistré",
  );
  expect(await publicData()).toEqual(initialPublic);
  await page.reload();
  await open(page);
  await select(page, lower);
  await page.locator(".room-layout-adjust > summary").click();
  await expect(x).toHaveValue(String(startX + 35));
  mark(
    "The former lower work moves freely sideways in A2; one-step undo/redo and private draft resume preserve its position",
  );
  const existingBefore = await geometry(page, [lower.id, upper.id]);
  await select(page, incoming);
  await page
    .getByRole("button", { name: "Mettre en réserve", exact: true })
    .click();
  await zone(page, "02").click({ position: { x: 4, y: 4 } });
  await expect(page.locator(".room-layout-reserve-heading")).toContainText(
    "0 à replacer",
  );
  await expect(
    page.locator(
      '.room-layout-board [data-zone-id="room-1-slot-02"].admin-wall-slot',
    ),
  ).toHaveCount(3);
  expect(await geometry(page, [lower.id, upper.id])).toEqual(existingBefore);
  await expect(apply(page)).toBeEnabled();
  await page
    .locator(".room-layout-board")
    .screenshot({ path: path.join(out, "three-paintings-a2.png") });
  mark(
    "A third painting fits into A2 by resizing only that incoming painting; both existing frames stay exactly unchanged",
  );
  await select(page, blocked);
  await page
    .getByRole("button", { name: "Mettre en réserve", exact: true })
    .click();
  const beforeRejected = await geometry(page, [
    lower.id,
    upper.id,
    incoming.id,
  ]);
  await page
    .getByRole("button", { name: "A1 · Ajouter dans cette zone", exact: true })
    .click();
  await expect(page.locator(".room-layout-status")).toContainText("Impossible");
  await expect(page.locator(".room-layout-status")).toContainText("25 cm");
  await expect(page.locator(".room-layout-reserve-heading")).toContainText(
    "1 à replacer",
  );
  await expect(apply(page)).toBeDisabled();
  expect(await geometry(page, [lower.id, upper.id, incoming.id])).toEqual(
    beforeRejected,
  );
  await draftSave(page).click();
  await expect(page.locator(".room-layout-status")).toContainText(
    "Brouillon enregistré",
  );
  const pending = (await session()).draft;
  const forged = structuredClone(pending.plan);
  const target = forged.items.find((a) => a.artworkId === incoming.id),
    anchor = forged.items.find((a) => a.artworkId === upper.id);
  Object.assign(target, {
    slotId: anchor.slotId,
    placementOffsetX: anchor.placementOffsetX,
    placementOffsetY: anchor.placementOffsetY,
  });
  Object.assign(
    forged.items.find((a) => a.artworkId === blocked.id),
    { slotId: "room-1-slot-03", placementOffsetX: 0, placementOffsetY: 0 },
  );
  const rejected = await context.request.post(
    `${origin}/api/admin/room-layout`,
    {
      headers: { origin },
      data: {
        action: "apply",
        expectedDraftVersion: pending.version,
        plan: forged,
      },
    },
  );
  expect(rejected.status()).toBe(409);
  expect(await publicData()).toEqual(initialPublic);
  await zone(page, "03").click({ position: { x: 4, y: 4 } });
  await expect(page.locator(".room-layout-reserve-heading")).toContainText(
    "0 à replacer",
  );
  await expect(apply(page)).toBeEnabled();
  await apply(page).click();
  await expect(page.getByRole("heading", { name: /Les œuvres/ })).toBeVisible();
  const applied = await publicData();
  expect(
    applied.artworks.filter((a) => a.slotId === "room-1-slot-02"),
  ).toHaveLength(3);
  expect(applied.artworks.filter((a) => a.roomId === "room-2")).toEqual(
    initialPublic.artworks.filter((a) => a.roomId === "room-2"),
  );
  mark(
    "Overfilled zones refuse unreadable additions without losing the reserve; server rejects overlap; applying a shared zone preserves room 2",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await select(page, lower);
  await expect(page.locator(".admin-movement-zone")).toHaveCount(4);
  const imageRatios = await page
    .locator(".room-layout-board img")
    .evaluateAll((imgs) =>
      imgs.map((img) => {
        const b = img.getBoundingClientRect();
        return [b.width / b.height, img.naturalWidth / img.naturalHeight];
      }),
    );
  for (const [actual, natural] of imageRatios)
    expect(Math.abs(actual / natural - 1)).toBeLessThan(0.03);
  await work(page, lower).scrollIntoViewIfNeeded();
  const touchBox = await work(page, lower).boundingBox();
  const cdp = await context.newCDPSession(page);
  const finger = {
    x: touchBox.x + touchBox.width / 2,
    y: touchBox.y + touchBox.height / 2,
  };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [finger],
  });
  await expect(work(page, lower)).toHaveAttribute("data-moving", "true");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: finger.x - 5, y: finger.y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(work(page, lower)).not.toHaveAttribute("data-moving", "true");
  await expect(apply(page)).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".room-layout-wall")
    .screenshot({ path: path.join(out, "zones-mobile.png") });
  await page.setViewportSize({ width: 300, height: 750 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".admin-movement-zone")).toHaveCount(4);
  mark(
    "Always-visible zone boundaries, independent touch dragging, correct image proportions and no overflow at 390px and 300px",
  );
  safari = await webkit.launch({ headless: true });
  const sc = await safari.newContext({ viewport: { width: 390, height: 844 } }),
    sp = await sc.newPage();
  sp.on("pageerror", (e) => errors.push(e.message));
  await enter(sp);
  await open(sp);
  await select(sp, incoming);
  await sp
    .getByRole("button", { name: "Redimensionner le tableau", exact: true })
    .press("ArrowLeft");
  await expect(apply(sp)).toBeEnabled();
  await draftSave(sp).click();
  await expect(sp.locator(".room-layout-status")).toContainText(
    "Brouillon enregistré",
  );
  const axe = await new AxeBuilder({ page: sp })
    .include(".room-layout-editor")
    .analyze();
  a11y.push({ browser: "WebKit", violations: axe.violations });
  expect(axe.violations).toEqual([]);
  await sp.reload();
  await open(sp);
  await expect(
    sp.locator(
      '.room-layout-board [data-zone-id="room-1-slot-02"].admin-wall-slot',
    ),
  ).toHaveCount(3);
  await sp
    .locator(".room-layout-wall")
    .screenshot({ path: path.join(out, "zones-webkit.png") });
  mark(
    "WebKit keyboard resizing and draft persistence work with three paintings in A2; zero axe violations",
  );
  await page.close();
  await sp.close();
  const immersive = await context.newPage();
  await immersive.setViewportSize({ width: 1000, height: 750 });
  immersive.on("pageerror", (e) => errors.push(e.message));
  await immersive.emulateMedia({ reducedMotion: "reduce" });
  await immersive.goto(`${origin}/?vue=oeuvre&slug=${incoming.slug}`);
  await expect(immersive.locator(".visit-details")).toContainText(
    incoming.title,
    { timeout: 60000 },
  );
  await expect(immersive.locator("canvas")).toHaveAttribute(
    "data-navigation-state",
    "arrived",
    { timeout: 60000 },
  );
  await immersive.screenshot({
    path: path.join(out, "shared-zone-webgl.png"),
    timeout: 60000,
  });
  await immersive.close();
  mark(
    "The saved shared zone loads and frames its newly added painting in actual WebGL",
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
