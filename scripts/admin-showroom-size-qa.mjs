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
const out = path.join(project, "artifacts/admin-showroom-size");
await mkdir(out, { recursive: true });
const before = createHash("sha256")
  .update(await readFile(".local/data.json"))
  .digest("hex");
const fixture = await mkdtemp(path.join(os.tmpdir(), "museum-showroom-size-"));
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
  const source = seed.artworks.find((a) => a.slotId === "room-1-slot-05");
  const allStored = async () =>
    await (await context.request.get(`${origin}/api/admin/artworks`)).json();
  const stored = async () =>
    (await allStored()).artworks.find((a) => a.id === source.id);
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
  async function edit(p) {
    await p
      .locator(".admin-artwork-card")
      .filter({ hasText: source.title })
      .click();
    await p.locator('[data-section="placement"] > summary').click();
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
  async function imageRatios(p, scope) {
    const ratios = await p
      .locator(`${scope} .admin-wall-artwork img`)
      .evaluateAll((images) =>
        images.map((img) => {
          const r = img.getBoundingClientRect(),
            f = img.parentElement.getBoundingClientRect();
          return {
            actual: r.width / r.height,
            natural: img.naturalWidth / img.naturalHeight,
            area: (r.width * r.height) / (f.width * f.height),
          };
        }),
      );
    expect(ratios.length).toBeGreaterThan(0);
    for (const r of ratios) {
      expect(r.natural).toBeGreaterThan(0);
      expect(Math.abs(r.actual / r.natural - 1)).toBeLessThan(0.025);
      expect(r.area).toBeGreaterThan(0.5);
    }
  }
  await enter(page);
  await edit(page);
  const scale = page.getByLabel("Taille dans le showroom", { exact: true });
  const width = page.getByLabel("Largeur dans le showroom (cm)", {
    exact: true,
  });
  const height = page.getByLabel("Hauteur dans le showroom (cm)", {
    exact: true,
  });
  const originalScale = await scale.inputValue();
  await page.getByLabel("Largeur réelle (cm)", { exact: true }).fill("30");
  await page.getByLabel("Hauteur réelle (cm)", { exact: true }).fill("60");
  await expect(scale).toHaveValue(originalScale);
  await save(page);
  expect((await stored()).displayScale).toBe(source.displayScale ?? 1);
  await width.fill("100");
  await width.press("Tab");
  expect(Number(await width.inputValue())).toBeCloseTo(100, 0);
  expect(Number(await height.inputValue())).toBeCloseTo(
    (100 * source.imageHeight) / source.imageWidth,
    0,
  );
  await imageRatios(page, ".admin-placement");
  await page
    .locator(".admin-placement-adjust")
    .screenshot({ path: path.join(out, "independent-size-fields.png") });
  await save(page);
  expect(await stored()).toMatchObject({ widthCm: 30, heightCm: 60 });
  mark(
    "Real dimensions are descriptive only; independent showroom width/height stay proportional and persist without changing the description",
  );
  const handle = page.getByRole("button", {
    name: "Redimensionner le tableau",
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  let box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(handle).toHaveAttribute("data-resizing", "true");
  await page.mouse.move(box.x + 90, box.y + 180, { steps: 12 });
  await page.mouse.up();
  await expect(handle).not.toHaveAttribute("data-resizing", "true");
  await expect(scale).toHaveValue("100");
  expect(Number(await width.inputValue())).toBeCloseTo(
    ((3 * source.imageWidth) / source.imageHeight) * 100,
    0,
  );
  await handle.press("Home");
  await expect(scale).toHaveValue("1");
  await handle.press("ArrowRight");
  await expect(scale).toHaveValue("2");
  await handle.press("End");
  await expect(scale).toHaveValue("100");
  await width.fill("9999");
  await width.press("Tab");
  await expect(scale).toHaveValue("100");
  await page
    .getByRole("button", { name: "Partir des dimensions réelles", exact: true })
    .click();
  await expect(width).toHaveValue("30");
  await scale.fill("60");
  await save(page);
  const saved = await stored();
  expect(
    (
      await context.request.post(`${origin}/api/admin/artworks`, {
        data: { ...saved, displayScale: 1.01 },
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(400);
  expect((await stored()).displayScale).toBe(saved.displayScale);
  mark(
    "Real mouse resize, keyboard arrows/Home/End, numerical clamp and explicit copy from real dimensions; oversized API input rejected",
  );
  await page
    .getByRole("button", { name: "Toutes les œuvres", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Réorganiser la salle 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Afficher le mur B · Mur droit", exact: true })
    .click();
  await page
    .locator(".room-layout-slot-list")
    .getByRole("button", {
      name: `B1 · Sélectionner ${source.title}`,
      exact: true,
    })
    .click();
  await page.locator(".room-layout-adjust > summary").click();
  await expect(scale).toHaveValue("60");
  await handle.scrollIntoViewIfNeeded();
  box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 60, { steps: 14 });
  await page.mouse.up();
  expect(Number(await scale.inputValue())).toBeGreaterThan(60);
  await page
    .getByRole("button", { name: "Annuler le geste", exact: true })
    .click();
  await expect(scale).toHaveValue("60");
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  expect(Number(await scale.inputValue())).toBeGreaterThan(60);
  await expect(page.locator(".room-layout-reserve-heading")).toContainText(
    "0 à replacer",
  );
  await page
    .locator(".room-layout-board")
    .screenshot({ path: path.join(out, "wall-proportions-desktop.png") });
  await imageRatios(page, ".room-layout-board");
  const apply = page.getByRole("button", {
    name: "Appliquer à la galerie",
    exact: true,
  });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(page.getByRole("heading", { name: /Les œuvres/ })).toBeVisible();
  expect(await stored()).toMatchObject({
    widthCm: 30,
    heightCm: 60,
    roomId: source.roomId,
    slotId: source.slotId,
  });
  mark(
    "Room handle resizes without dragging into the reserve; undo reverses the whole gesture in one step; apply preserves metadata and room",
  );
  await page
    .getByRole("button", { name: "Réorganiser la salle 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Afficher le mur B · Mur droit", exact: true })
    .click();
  const upper = seed.artworks.find((a) => a.slotId === "room-1-slot-06");
  await page
    .locator(".room-layout-slot-list")
    .getByRole("button", {
      name: `B2 · Sélectionner ${upper.title}`,
      exact: true,
    })
    .click();
  await page.locator(".room-layout-adjust > summary").click();
  await expect(
    page.locator('.admin-movement-zone[data-zone-id="room-1-slot-06"]'),
  ).toBeVisible();
  expect(
    await page
      .locator('.admin-movement-zone[data-zone-id="room-1-slot-06"]')
      .evaluate((el) => getComputedStyle(el).pointerEvents),
  ).toBe("auto");
  const upperButton = page.locator(
    ".room-layout-board .admin-wall-slot.selected",
  );
  await upperButton.scrollIntoViewIfNeeded();
  const hitbox = await upperButton.boundingBox();
  const painted = await upperButton
    .locator(".admin-wall-artwork")
    .boundingBox();
  expect(Math.abs(hitbox.width - painted.width)).toBeLessThan(1);
  expect(Math.abs(hitbox.height - painted.height)).toBeLessThan(1);
  const horizontal = page.getByLabel("Horizontal (cm)", { exact: true });
  const originalX = Number(await horizontal.inputValue());
  const moveZone = await page
    .locator('.admin-movement-zone[data-zone-id="room-1-slot-06"]')
    .boundingBox();
  await page.mouse.move(
    hitbox.x + hitbox.width / 2,
    hitbox.y + hitbox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    hitbox.x + hitbox.width / 2 + (moveZone.width * 0.1) / 2.47,
    hitbox.y + hitbox.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(horizontal).toHaveValue(String(originalX + 10));
  await expect(page.locator(".room-layout-reserve-heading")).toContainText(
    "0 à replacer",
  );
  await page
    .getByRole("button", { name: "Annuler le geste", exact: true })
    .click();
  await expect(horizontal).toHaveValue(String(originalX));
  await page
    .locator(".room-layout-board")
    .screenshot({ path: path.join(out, "paired-paintings-zones.png") });
  mark(
    "Each painting has its own accurate hitbox above its dashed zone; direct room drag moves 10cm and undoes in one gesture",
  );
  await handle.press("End");
  expect(Number(await scale.inputValue())).toBeLessThan(100);
  await expect(apply).toBeEnabled();
  await page
    .getByRole("button", {
      name: "Remettre comme dans la galerie",
      exact: true,
    })
    .click();
  await page
    .locator(".room-layout-slot-list")
    .getByRole("button", {
      name: `B1 · Sélectionner ${source.title}`,
      exact: true,
    })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".admin-room-map")).toBeVisible();
  await expect(page.locator(".room-layout-map-panel")).toHaveCount(0);
  await scale.fill("40");
  await imageRatios(page, ".room-layout-board");
  await handle.scrollIntoViewIfNeeded();
  box = await handle.boundingBox();
  expect(await handle.evaluate((el) => getComputedStyle(el).touchAction)).toBe(
    "none",
  );
  const cdp = await context.newCDPSession(page);
  const finger = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [finger],
  });
  await expect(handle).toHaveAttribute("data-resizing", "true");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: finger.x + 12, y: finger.y + 20 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(Number(await scale.inputValue())).toBeGreaterThan(40);
  await expect(apply).toBeEnabled();
  await page
    .locator(".room-layout-board")
    .screenshot({ path: path.join(out, "wall-proportions-mobile.png") });
  await page
    .locator(".room-layout-wall")
    .screenshot({ path: path.join(out, "resize-mobile.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 300, height: 750 });
  await imageRatios(page, ".room-layout-board");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await apply.click();
  await expect(page.getByRole("heading", { name: /Les œuvres/ })).toBeVisible();
  mark(
    "Expansion stops before neighboring frames; touch resize works at mobile widths; proportional previews and always-expanded plan at 390 and 300px",
  );
  safari = await webkit.launch({ headless: true });
  const safariContext = await safari.newContext({
    viewport: { width: 390, height: 844 },
  });
  const sp = await safariContext.newPage();
  sp.on("pageerror", (error) => errors.push(error.message));
  await enter(sp);
  await edit(sp);
  const sw = sp.getByLabel("Largeur dans le showroom (cm)", { exact: true });
  await sw.fill("80,5");
  await sw.press("Tab");
  expect(Number((await sw.inputValue()).replace(",", "."))).toBeCloseTo(
    80.5,
    0,
  );
  await sp
    .getByRole("button", { name: "Redimensionner le tableau", exact: true })
    .press("ArrowRight");
  await save(sp);
  await imageRatios(sp, ".admin-placement");
  const axe = await new AxeBuilder({ page: sp })
    .include(".admin-placement")
    .analyze();
  a11y.push({
    browser: "WebKit",
    screen: "placement and showroom sizing",
    violations: axe.violations,
  });
  expect(axe.violations).toEqual([]);
  await sp
    .locator(".admin-placement-adjust")
    .screenshot({ path: path.join(out, "sizing-webkit.png") });
  await sp.reload();
  await sp
    .locator(".admin-artwork-card")
    .filter({ hasText: source.title })
    .click();
  await expect(
    sp.getByLabel("Largeur réelle (cm)", { exact: true }),
  ).toHaveValue("30");
  await expect(
    sp.getByLabel("Hauteur réelle (cm)", { exact: true }),
  ).toHaveValue("60");
  mark(
    "WebKit decimal size entry, keyboard resize, save/reopen and zero axe violations; descriptive dimensions stay separate",
  );
  await page.close();
  await sp.close();
  const immersive = await context.newPage();
  await immersive.setViewportSize({ width: 1000, height: 750 });
  immersive.on("pageerror", (error) => errors.push(error.message));
  await immersive.emulateMedia({ reducedMotion: "reduce" });
  await immersive.goto(`${origin}/?vue=oeuvre&slug=${source.slug}`);
  await expect(immersive.locator(".visit-details")).toContainText(
    source.title,
    { timeout: 60000 },
  );
  await expect(immersive.locator("canvas")).toHaveAttribute(
    "data-navigation-state",
    "arrived",
    { timeout: 60000 },
  );
  await immersive.screenshot({
    path: path.join(out, "resized-work-webgl.png"),
    timeout: 60000,
  });
  await immersive.close();
  mark(
    "Resized painting loads and is framed in actual WebGL using the saved showroom scale",
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
