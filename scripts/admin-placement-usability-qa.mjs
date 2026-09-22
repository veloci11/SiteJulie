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
const out = path.join(project, "artifacts/admin-placement-usability");
await mkdir(out, { recursive: true });
const before = createHash("sha256")
  .update(await readFile(".local/data.json"))
  .digest("hex");
const fixture = await mkdtemp(
  path.join(os.tmpdir(), "museum-placement-usability-"),
);
await cp(".local/data.json", path.join(fixture, "seed.json"));
await cp(".local/media", path.join(fixture, "media"), { recursive: true });
const seed = JSON.parse(
  await readFile(path.join(fixture, "seed.json"), "utf8"),
);
// Free one target in the throwaway copy only.
const movedSource = seed.artworks.find((artwork) => artwork.id === "oeuvre-03");
for (const artwork of seed.artworks) {
  if (artwork.slotId === "room-1-slot-05") artwork.publication = "draft";
}
await writeFile(path.join(fixture, "seed.json"), JSON.stringify(seed));
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

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    hasTouch: true,
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  async function openArtwork(p) {
    await p.goto(`${origin}/admin`);
    const login = p.getByRole("button", {
      name: "Ouvrir l’atelier de démonstration",
    });
    if (await login.count()) await login.click();
    await p
      .locator(".admin-artwork-card")
      .filter({ hasText: movedSource.title })
      .click();
    await p.locator('[data-section="placement"] > summary').click();
  }
  const stored = async () =>
    (
      await (await context.request.get(`${origin}/api/admin/artworks`)).json()
    ).artworks.find((a) => a.id === movedSource.id);
  const save = page.getByRole("button", {
    name: "Enregistrer les modifications",
    exact: true,
  });
  async function submit(p = page) {
    await p
      .getByRole("button", {
        name: "Enregistrer les modifications",
        exact: true,
      })
      .click();
    await expect(p.locator(".admin-dirty-state")).toHaveText(
      "Tout est enregistré",
    );
    await expect(p.locator(".admin-save-feedback")).toHaveClass(/is-success/);
  }
  await openArtwork(page);
  const firstSlot = (await stored()).slotId;
  for (const name of [
    "B · Mur droit",
    "A · Mur gauche",
    "D · Mur derrière",
    "C · Mur en face",
    "B · Mur droit",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".admin-wall-heading")).toContainText(name);
    await expect(page.locator(".admin-dirty-state")).toHaveText(
      "Tout est enregistré",
    );
  }
  await expect(
    page.locator(".admin-wall-inventory button:disabled").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "B1 · Choisir cet emplacement", exact: true })
    .click();
  expect((await stored()).slotId).toBe(firstSlot);
  const scale = page.getByLabel("Taille dans le showroom", { exact: true });
  const x = page.getByLabel("Horizontal (cm)", { exact: true });
  const y = page
    .locator(".admin-placement")
    .getByLabel("Hauteur (cm)", { exact: true });
  await scale.fill("60");
  const drag = page.locator(".admin-wall-slot.selected .is-draggable");
  await drag.scrollIntoViewIfNeeded();
  const zone = await page.locator(".admin-movement-zone").boundingBox();
  const box = await drag.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(drag).toHaveAttribute("data-dragging", "true");
  await page.mouse.move(
    box.x + box.width / 2 + (0.2 * zone.width) / 2.47,
    box.y + box.height / 2 - (0.15 * zone.height) / 3.17,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(x).toHaveValue("20");
  await expect(y).toHaveValue("15");
  mark(
    "Wall exploration does not move the painting; occupied places protected; true mouse drag moves +20/+15 cm before explicit save",
  );
  const movedBox = await drag.boundingBox();
  await page.mouse.move(
    movedBox.x + movedBox.width / 2,
    movedBox.y + movedBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(movedBox.x - 500, movedBox.y + 300, { steps: 10 });
  await page.mouse.up();
  await expect(drag).not.toHaveAttribute("data-dragging", "true");
  for (const input of [x, y]) {
    const label = await input.locator("..").locator("small").innerText();
    await expect(input).toHaveValue(`-${label.match(/−(\d+)/)[1]}`);
  }
  mark(
    "A drag outside the wall keeps pointer capture and stops exactly at the safe bounds",
  );
  await x.fill("");
  await x.pressSequentially("-20");
  await y.fill("");
  await y.pressSequentially("-15");
  await expect(x).toHaveValue("-20");
  await expect(y).toHaveValue("-15");
  await submit();
  const placed = await stored();
  expect(placed).toMatchObject({
    slotId: "room-1-slot-05",
    displayScale: 0.6,
    placementOffsetX: -0.2,
    placementOffsetY: -0.15,
    publication: "published",
  });
  expect(placed.image).toBe(movedSource.image);
  await page
    .getByRole("button", { name: "Toutes les œuvres", exact: true })
    .click();
  await page
    .locator(".admin-artwork-card")
    .filter({ hasText: movedSource.title })
    .click();
  await page.locator('[data-section="placement"] > summary').click();
  await expect(x).toHaveValue("-20");
  await expect(y).toHaveValue("-15");
  mark(
    "Minus signs survive real keystrokes, save and reopening; image and publication unchanged",
  );
  await page
    .getByRole("button", { name: "B1 · Ce tableau", exact: true })
    .click();
  await expect(x).toHaveValue("-20");
  await page
    .getByRole("button", { name: "A · Mur gauche", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revenir au tableau", exact: true })
    .click();
  await expect(x).toHaveValue("-20");
  await x.fill("99999");
  await save.click();
  await expect(x).toBeFocused();
  await expect(page.locator(".admin-save-feedback")).toContainText(
    "nombre entier",
  );
  expect((await stored()).placementOffsetX).toBe(-0.2);
  await page
    .getByRole("button", {
      name: "Recentrer et rétablir la taille",
      exact: true,
    })
    .click();
  await expect(x).toHaveValue("0");
  await expect(y).toHaveValue("0");
  await scale.fill("60");
  await x.fill("-");
  await save.click();
  await expect(x).toBeFocused();
  await page
    .getByRole("button", {
      name: "Déplacer de 1 cm vers la gauche",
      exact: true,
    })
    .click();
  await expect(x).toHaveValue("-1");
  await x.press("ArrowDown");
  await expect(x).toHaveValue("-2");
  await x.press("ArrowUp");
  await expect(x).toHaveValue("-1");
  const rejected = await context.request.post(`${origin}/api/admin/artworks`, {
    headers: { origin },
    data: { ...placed, placementOffsetX: 5 },
  });
  expect(rejected.ok()).toBe(false);
  expect((await stored()).placementOffsetX).toBe(-0.2);
  mark(
    "Reselect/return preserves offsets; incomplete/out-of-range input blocks save; reset and step controls recover; server rejects forged offset",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", {
      name: "Déplacer de 1 cm vers la droite",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Monter de 1 cm", exact: true })
    .click();
  await expect(x).toHaveValue("0");
  await expect(y).toHaveValue("1");
  await drag.scrollIntoViewIfNeeded();
  const mobileZone = await page.locator(".admin-movement-zone").boundingBox();
  const mobileBox = await drag.boundingBox();
  const finger = {
    x: mobileBox.x + mobileBox.width / 2,
    y: mobileBox.y + mobileBox.height / 2,
  };
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [finger],
  });
  await expect(drag).toHaveAttribute("data-dragging", "true");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: finger.x + (0.1 * mobileZone.width) / 2.47, y: finger.y },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(drag).not.toHaveAttribute("data-dragging", "true");
  expect(Number(await x.inputValue())).toBeGreaterThan(5);
  expect(Number(await x.inputValue())).toBeLessThan(15);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".admin-placement-adjust")
    .screenshot({ path: path.join(out, "mobile-controls.png") });
  await submit();
  expect((await stored()).placementOffsetX).toBe(
    Number(await x.inputValue()) / 100,
  );
  await page.setViewportSize({ width: 844, height: 390 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  mark(
    "Mobile step controls and emulated touch drag work, persist and fit portrait/landscape; no physical phone benchmark",
  );
  safari = await webkit.launch({ headless: true });
  const safariContext = await safari.newContext({
    viewport: { width: 390, height: 844 },
  });
  const safariPage = await safariContext.newPage();
  safariPage.on("pageerror", (error) => errors.push(error.message));
  await openArtwork(safariPage);
  const sx = safariPage.getByLabel("Horizontal (cm)", { exact: true });
  await sx.fill("");
  await sx.pressSequentially("-20");
  await expect(sx).toHaveValue("-20");
  await submit(safariPage);
  const axe = await new AxeBuilder({ page: safariPage })
    .include(".admin-placement")
    .analyze();
  a11y.push({
    browser: "WebKit",
    screen: "placement",
    violations: axe.violations,
  });
  expect(axe.violations).toEqual([]);
  await safariPage
    .locator(".admin-placement-adjust")
    .screenshot({ path: path.join(out, "webkit-controls.png") });
  mark(
    "WebKit also types and saves negative positions; placement passes axe checks",
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
