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
const out = path.join(project, "artifacts/admin-room-layout");
await mkdir(out, { recursive: true });
const before = createHash("sha256")
  .update(await readFile(".local/data.json"))
  .digest("hex");
const fixture = await mkdtemp(path.join(os.tmpdir(), "museum-room-layout-"));
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
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    hasTouch: true,
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const url = `${origin}/api/admin/room-layout`;
  const publicData = async () =>
    await (await fetch(`${origin}/api/museum/data`)).json();
  const initialPublic = await publicData();
  expect((await fetch(`${url}?roomId=room-1`)).status).toBe(401);
  expect(
    (
      await context.request.post(url, { data: {}, headers: { Origin: origin } })
    ).status(),
  ).toBe(401);
  async function enter(p) {
    await p.goto(`${origin}/admin`);
    const login = p.getByRole("button", {
      name: "Ouvrir l’atelier de démonstration",
    });
    if (await login.count()) await login.click();
    await expect(p.getByRole("heading", { name: /Les œuvres/ })).toBeVisible();
  }
  async function open(p, room = 1) {
    await p
      .getByRole("button", {
        name: new RegExp(
          `^(Réorganiser la salle|Reprendre le brouillon) ${room}$`,
        ),
      })
      .click();
    await expect(p.locator(".room-layout-board")).toBeVisible();
  }
  const reserveCount = (p, count) =>
    expect(p.locator(".room-layout-reserve-heading")).toContainText(
      `${count} à replacer`,
    );
  const apply = (p) =>
    p.getByRole("button", { name: "Appliquer à la galerie", exact: true });
  const saveDraft = (p) =>
    p.getByRole("button", { name: "Enregistrer le brouillon", exact: true });
  const back = (p) =>
    p.getByRole("button", { name: "Retour aux œuvres", exact: true });
  const chooseWall = (p, wall) =>
    p
      .getByRole("button", { name: new RegExp(`^Afficher le mur ${wall} ·`) })
      .click();
  const select = (p, code) =>
    p
      .locator(".room-layout-slot-list")
      .getByRole("button", { name: new RegExp(`^${code} · Sélectionner`) })
      .click();
  const install = (p, code) =>
    p
      .locator(".room-layout-slot-list")
      .getByRole("button", { name: `${code} · Installer ici`, exact: true })
      .click();
  const remove = (p) =>
    p.getByRole("button", { name: "Mettre en réserve", exact: true }).click();
  const first = seed.artworks.find((a) => a.slotId === "room-1-slot-01");
  const second = seed.artworks.find((a) => a.slotId === "room-1-slot-05");
  const session = async () =>
    await (await context.request.get(`${url}?roomId=room-1`)).json();
  const stored = async () =>
    await (await context.request.get(`${origin}/api/admin/artworks`)).json();
  const post = (data) =>
    context.request.post(url, { data, headers: { Origin: origin } });
  await enter(page);
  const originalAdmin = await stored();
  await open(page);
  expect((await session()).artworks).toHaveLength(14);
  expect((await session()).artworks.every((a) => a.roomId === "room-1")).toBe(
    true,
  );
  await expect(page.locator(".room-layout-editor")).toContainText(
    "Une seule salle",
  );
  await expect(
    page.getByRole("button", { name: "Textes & contact", exact: true }),
  ).toBeDisabled();
  await reserveCount(page, 0);
  await select(page, "A1");
  await remove(page);
  await reserveCount(page, 1);
  await expect(apply(page)).toBeDisabled();
  expect(await publicData()).toEqual(initialPublic);
  await page
    .getByRole("button", { name: "Annuler le geste", exact: true })
    .click();
  await reserveCount(page, 0);
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await reserveCount(page, 1);
  await page
    .getByRole("button", { name: "Tout mettre en réserve", exact: true })
    .click();
  await reserveCount(page, 14);
  await expect(apply(page)).toBeDisabled();
  expect(await publicData()).toEqual(initialPublic);
  await page
    .getByRole("button", { name: "Annuler le geste", exact: true })
    .click();
  await reserveCount(page, 1);
  await page.screenshot({
    path: path.join(out, "room-editor-desktop.png"),
    fullPage: true,
  });
  mark(
    "Anonymous reads/writes denied; editor locked to 14 published works in room 1; reserve, bulk removal, undo/redo and public isolation work",
  );

  await back(page).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Continuer l’édition", exact: true })
    .click();
  await reserveCount(page, 1);
  await back(page).click();
  await page
    .getByRole("button", {
      name: "Enregistrer le brouillon et quitter",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Reprendre le brouillon 1", exact: true }),
  ).toBeVisible();
  await page.reload();
  await open(page);
  await reserveCount(page, 1);
  const draft = (await session()).draft;
  expect(
    draft.plan.items.find((i) => i.artworkId === first.id).slotId,
  ).toBeNull();
  expect(
    (
      await post({
        action: "apply",
        expectedDraftVersion: draft.version,
        plan: draft.plan,
      })
    ).status(),
  ).toBe(409);
  const foreign = structuredClone(draft.plan);
  foreign.items[0].slotId = "room-2-slot-01";
  expect(
    (
      await post({
        action: "draft",
        expectedDraftVersion: draft.version,
        plan: foreign,
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await context.request.post(url, {
        data: {
          action: "draft",
          expectedDraftVersion: draft.version,
          plan: draft.plan,
        },
        headers: { Origin: "https://foreign.invalid" },
      })
    ).status(),
  ).toBe(403);
  expect(await publicData()).toEqual(initialPublic);
  mark(
    "Unsaved exit dialog, save-and-exit and draft resume after reload; incomplete apply, wrong room and cross-origin requests rejected",
  );

  await chooseWall(page, "B");
  await select(page, "B1");
  await remove(page);
  await reserveCount(page, 2);
  await page
    .getByRole("button", {
      name: `Choisir dans la réserve : ${first.title}`,
      exact: true,
    })
    .click();
  await install(page, "B1");
  await chooseWall(page, "A");
  await page
    .getByRole("button", {
      name: `Choisir dans la réserve : ${second.title}`,
      exact: true,
    })
    .click();
  await install(page, "A1");
  await reserveCount(page, 0);
  await expect(apply(page)).toBeEnabled();
  expect(await publicData()).toEqual(initialPublic);
  await apply(page).click();
  await expect(page.getByRole("heading", { name: /Les œuvres/ })).toBeVisible();
  const appliedAdmin = await stored();
  expect(appliedAdmin.artworks).toEqual(
    originalAdmin.artworks.map((a) =>
      a.id === first.id
        ? {
            ...a,
            slotId: second.slotId,
            placementOffsetX: 0,
            placementOffsetY: 0,
            revision: a.revision + 1,
          }
        : a.id === second.id
          ? {
              ...a,
              slotId: first.slotId,
              placementOffsetX: 0,
              placementOffsetY: 0,
              revision: a.revision + 1,
            }
          : a,
    ),
  );
  expect((await session()).draft).toBeNull();
  const appliedPublic = await publicData();
  expect(appliedPublic.artworks.find((a) => a.id === first.id).slotId).toBe(
    second.slotId,
  );
  expect(appliedPublic.artworks.filter((a) => a.roomId === "room-2")).toEqual(
    initialPublic.artworks.filter((a) => a.roomId === "room-2"),
  );
  mark(
    "Two paintings swapped in a full room and applied atomically; metadata, collections, publication and room 2 unchanged; draft removed",
  );

  await open(page);
  const boardA1 = page
    .locator(".room-layout-board")
    .getByRole("button", { name: new RegExp("^A1 ·") });
  await boardA1.dragTo(page.locator(".room-layout-reserve"));
  await reserveCount(page, 1);
  await page
    .getByRole("button", {
      name: `Choisir dans la réserve : ${second.title}`,
      exact: true,
    })
    .dragTo(boardA1);
  await reserveCount(page, 0);
  await boardA1.dragTo(page.locator(".room-layout-reserve"));
  await reserveCount(page, 1);
  await page.route("**/api/admin/room-layout", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Sauvegarde temporairement indisponible — test",
        }),
      });
    else await route.continue();
  });
  await saveDraft(page).click();
  await expect(
    page.locator(".room-layout-status").getByRole("alert"),
  ).toContainText("temporairement indisponible");
  await reserveCount(page, 1);
  await page.unroute("**/api/admin/room-layout");
  await saveDraft(page).click();
  await expect(page.locator(".room-layout-status")).toContainText(
    "Brouillon enregistré",
  );
  expect(await publicData()).toEqual(appliedPublic);
  mark(
    "Real mouse drag to reserve and back; simulated server failure preserves the layout and retry saves a private draft",
  );

  const other = await context.newPage();
  other.on("pageerror", (error) => errors.push(error.message));
  await enter(other);
  await open(other);
  await reserveCount(other, 1);
  await select(page, "A2 haut");
  await remove(page);
  await saveDraft(page).click();
  await expect(page.locator(".room-layout-status")).toContainText(
    "Brouillon enregistré",
  );
  await select(other, "A3");
  await remove(other);
  await saveDraft(other).click();
  await expect(
    other.locator(".room-layout-status").getByRole("alert"),
  ).toContainText("autre onglet");
  await reserveCount(other, 2);
  other.once("dialog", (dialog) => dialog.accept());
  await other
    .getByRole("button", { name: "Recharger la salle", exact: true })
    .click();
  await reserveCount(other, 2);
  await expect(
    other.getByRole("button", {
      name:
        "Choisir dans la réserve : " +
        seed.artworks.find((a) => a.slotId === "room-1-slot-02").title,
      exact: true,
    }),
  ).toBeVisible();
  await other.close();
  mark(
    "Concurrent tab save is refused without losing its pending edits; explicit reload recovers the latest draft",
  );

  await back(page).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.locator(".admin-room-map")).toBeVisible();
  await expect(page.locator(".room-layout-map-panel")).toHaveCount(0);
  await page
    .locator(".admin-room-map")
    .screenshot({ path: path.join(out, "room-plan-mobile.png") });
  await page
    .getByRole("button", { name: "Afficher le mur B · Mur droit", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".room-layout-wall h2")).toContainText(
    "B · Mur droit",
  );
  await chooseWall(page, "A");
  await page.locator(".room-layout-heading").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(out, "room-editor-mobile.png"),
    fullPage: true,
  });
  await page.locator(".room-layout-board").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(out, "room-editor-mobile-viewport.png"),
  });
  await page
    .getByRole("button", {
      name: "Remettre comme dans la galerie",
      exact: true,
    })
    .click();
  await reserveCount(page, 0);
  await select(page, "A1");
  await page.locator(".room-layout-adjust > summary").click();
  const x = page.getByLabel("Horizontal (cm)", { exact: true });
  await x.fill("");
  await x.pressSequentially("-");
  await back(page).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Enregistrer le brouillon et quitter",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(x).toBeFocused();
  await expect(
    page.locator(".room-layout-status").getByRole("alert"),
  ).toContainText("Terminez le réglage");
  await page
    .getByRole("button", { name: "Recentrer ce tableau", exact: true })
    .click();
  await expect(x).toHaveValue("0");
  await page
    .getByRole("button", { name: "Mettre en réserve", exact: true })
    .tap();
  await reserveCount(page, 1);
  await back(page).click();
  await page
    .getByRole("dialog")
    .screenshot({ path: path.join(out, "unsaved-exit-mobile.png") });
  const dialogAxe = await new AxeBuilder({ page })
    .include(".room-layout-exit")
    .analyze();
  a11y.push({
    browser: "Chrome",
    screen: "exit dialog",
    violations: dialogAxe.violations,
  });
  expect(dialogAxe.violations).toEqual([]);
  await page
    .getByRole("button", { name: "Continuer l’édition", exact: true })
    .click();
  await install(page, "A1");
  await reserveCount(page, 0);
  await saveDraft(page).click();
  await expect(page.locator(".room-layout-status")).toContainText(
    "Brouillon enregistré",
  );
  await page.setViewportSize({ width: 300, height: 750 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".room-layout-board").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, "room-editor-narrow.png") });
  await page.setViewportSize({ width: 844, height: 390 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".room-layout-board").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, "room-editor-landscape.png") });
  mark(
    "Mobile tap placement, always-visible plan, keyboard wall controls and landscape fit; incomplete numeric input blocks saving and focuses the field; exit warning remains usable",
  );

  safari = await webkit.launch({ headless: true });
  const safariContext = await safari.newContext({
    viewport: { width: 390, height: 844 },
  });
  const safariPage = await safariContext.newPage();
  safariPage.on("pageerror", (error) => errors.push(error.message));
  await enter(safariPage);
  await open(safariPage);
  await select(safariPage, "A1");
  await remove(safariPage);
  await saveDraft(safariPage).click();
  await expect(safariPage.locator(".room-layout-status")).toContainText(
    "Brouillon enregistré",
  );
  await back(safariPage).click();
  await safariPage.reload();
  await open(safariPage);
  await reserveCount(safariPage, 1);
  await chooseWall(safariPage, "D");
  await chooseWall(safariPage, "C");
  await chooseWall(safariPage, "A");
  await safariPage
    .getByRole("button", {
      name: `Choisir dans la réserve : ${second.title}`,
      exact: true,
    })
    .click();
  await install(safariPage, "A1");
  await expect(apply(safariPage)).toBeEnabled();
  expect(
    await safariPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const axe = await new AxeBuilder({ page: safariPage })
    .include(".room-layout-editor")
    .analyze();
  a11y.push({
    browser: "WebKit",
    screen: "room editor",
    violations: axe.violations,
  });
  expect(axe.violations).toEqual([]);
  await safariPage.screenshot({
    path: path.join(out, "room-editor-webkit.png"),
    fullPage: true,
  });
  // Keep close from opening a beforeunload prompt; this is only the throwaway fixture.
  await saveDraft(safariPage).click();
  await expect(safariPage.locator(".room-layout-status")).toContainText(
    "Brouillon enregistré",
  );
  await select(safariPage, "A2 haut");
  await remove(safariPage);
  await back(safariPage).click();
  await safariPage
    .getByRole("button", {
      name: "Quitter sans garder ces changements",
      exact: true,
    })
    .click();
  await open(safariPage);
  await reserveCount(safariPage, 0);
  mark(
    "WebKit save, exit, resume, discard without altering the saved draft and four wall controls work; Chrome dialog and WebKit room editor have zero axe violations",
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
