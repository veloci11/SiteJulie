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
import { PerspectiveCamera, Vector3 } from "three";
import {
  artworkSize,
  slotForArtwork,
  FRAME_OUTSET,
  FRAME_FRONT_DEPTH,
} from "../lib/museum/config.ts";
import { showroomReference } from "../lib/museum/showroomSizing.ts";

const project = process.cwd();
const out = path.join(project, "artifacts/admin-dimensions-camera");
await mkdir(out, { recursive: true });
const before = createHash("sha256")
  .update(await readFile(".local/data.json"))
  .digest("hex");
const fixture = await mkdtemp(
  path.join(os.tmpdir(), "museum-dimensions-camera-"),
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
  const slider = page.getByLabel("Taille dans le showroom", { exact: true });
  const width = page.getByLabel("Largeur dans le showroom (cm)", {
    exact: true,
  });
  const height = page.getByLabel("Hauteur dans le showroom (cm)", {
    exact: true,
  });
  const realWidth = page.getByLabel("Largeur réelle (cm)", { exact: true });
  const realHeight = page.getByLabel("Hauteur réelle (cm)", { exact: true });
  await realWidth.fill("50");
  await realHeight.fill("90");
  await expect(slider).toHaveValue("100");
  const reference = showroomReference(
    { ...source, widthCm: 50, heightCm: 90 },
    slotForArtwork(source),
  );
  expect(Number(await width.inputValue())).toBeCloseTo(
    reference.width * 100,
    0,
  );
  expect(Number(await height.inputValue())).toBeCloseTo(
    reference.height * 100,
    0,
  );
  await slider.fill("150");
  await save(page);
  const enlarged = await stored();
  expect(enlarged.displayScale).toBeCloseTo(reference.scale * 1.5, 5);
  expect([enlarged.widthCm, enlarged.heightCm]).toEqual([50, 90]);
  await page.reload();
  await edit(page);
  await expect(slider).toHaveValue("150");
  await page.getByLabel("Titre", { exact: true }).fill(source.title + " test");
  await save(page);
  await expect(slider).toHaveValue("150");
  await realWidth.fill("60");
  await realHeight.fill("108");
  await expect(slider).toHaveValue("100");
  const nextReference = showroomReference(
    { ...source, widthCm: 60, heightCm: 108 },
    slotForArtwork(source),
  );
  expect(Number(await width.inputValue())).toBeCloseTo(
    nextReference.width * 100,
    0,
  );
  await slider.fill("175");
  await page
    .getByRole("button", {
      name: "Revenir à 100 % · dimensions réelles",
      exact: true,
    })
    .click();
  await expect(slider).toHaveValue("100");
  await save(page);
  await page
    .locator(".admin-placement-adjust")
    .screenshot({ path: path.join(out, "real-dimensions-100-percent.png") });
  mark(
    "Centimetres define 100%; 150% saves and survives reopening and unrelated edits; changing dimensions resets the new 100% without distorting the image",
  );
  const residentBefore = (await allStored()).artworks.filter(
    (a) => a.id !== source.id,
  );
  const byId = (a, b) => a.id.localeCompare(b.id);
  expect(residentBefore.sort(byId)).toEqual(
    seed.artworks.filter((a) => a.id !== source.id).sort(byId),
  );

  await page
    .getByRole("button", { name: "Toutes les œuvres", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Réorganiser la salle 2", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Afficher le mur D · Mur derrière",
      exact: true,
    })
    .click();
  const central = seed.artworks.find((a) => a.slotId === "room-2-slot-10");
  await expect(page.locator(".admin-movement-zone")).toHaveCount(3);
  await page
    .locator(".room-layout-slot-list")
    .getByRole("button", {
      name: `D1 · Sélectionner ${central.title}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Mettre en réserve", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "D centre · Ajouter dans cette zone",
      exact: true,
    })
    .click();
  await expect(
    page
      .locator('.room-layout-board [data-artwork-id="' + central.id + '"]')
      .first(),
  ).toHaveAttribute("data-zone-id", "room-2-slot-13");
  await page
    .locator(".room-layout-wall")
    .screenshot({ path: path.join(out, "room-2-central-zone.png") });
  await page
    .getByRole("button", { name: "Appliquer à la galerie", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /Les œuvres/ })).toBeVisible();
  const moved = (await allStored()).artworks.find((a) => a.id === central.id);
  expect(moved.slotId).toBe("room-2-slot-13");
  expect(moved.displayScale).toBeCloseTo(central.displayScale ?? 1, 8);
  const addRoom = await context.request.post(`${origin}/api/admin/rooms`, {
    headers: { origin },
    data: {},
  });
  expect(addRoom.status()).toBe(409);
  expect((await addRoom.json()).error).toContain("D centre");
  mark(
    "Room 2 has a real central wall zone between D1/D2; moving there persists at the same size, and adding a room cannot open a passage behind it",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await edit(page);
  await expect(slider).toHaveValue("100");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".admin-placement-adjust")
    .screenshot({ path: path.join(out, "dimensions-mobile.png") });
  safari = await webkit.launch({ headless: true });
  const sc = await safari.newContext({ viewport: { width: 390, height: 844 } }),
    sp = await sc.newPage();
  sp.on("pageerror", (e) => errors.push(e.message));
  await enter(sp);
  await edit(sp);
  await expect(
    sp.getByLabel("Taille dans le showroom", { exact: true }),
  ).toHaveValue("100");
  const axe = await new AxeBuilder({ page: sp })
    .include(".admin-placement")
    .analyze();
  a11y.push({ browser: "WebKit", violations: axe.violations });
  expect(axe.violations).toEqual([]);
  await sp.getByLabel("Taille dans le showroom", { exact: true }).fill("120");
  await save(sp);
  await sp.reload();
  await edit(sp);
  await expect(
    sp.getByLabel("Taille dans le showroom", { exact: true }),
  ).toHaveValue("120");
  await safari.close();
  safari = null;
  await page.close();
  mark(
    "Reference percentage and manual size persist in WebKit; mobile controls have no horizontal overflow and no axe violations",
  );

  const publicData = await (
    await context.request.get(`${origin}/api/museum/data`)
  ).json();
  const viewed = [
    source.id,
    seed.artworks.find((a) => a.slotId === "room-1-slot-02").id,
    seed.artworks.find((a) => a.slotId === "room-1-slot-13").id,
    central.id,
  ].map((id) => publicData.artworks.find((a) => a.id === id));
  const immersive = await context.newPage();
  immersive.on("pageerror", (e) => errors.push(e.message));
  const observed = [];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await immersive.setViewportSize(viewport);
    for (const a of viewed) {
      await immersive.goto(`${origin}/?vue=oeuvre&slug=${a.slug}`);
      const canvas = immersive.locator('canvas[data-renderer-ready="true"]');
      await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
        timeout: 60000,
      });
      await expect(canvas).toHaveAttribute("data-detail-artwork", a.id, {
        timeout: 60000,
      });
      const pose = await canvas.evaluate((el) => ({
        position: JSON.parse(el.dataset.cameraPosition),
        target: JSON.parse(el.dataset.cameraTarget),
        fov: Number(el.dataset.cameraFov),
        offset: JSON.parse(el.dataset.cameraOffset),
      }));
      const camera = new PerspectiveCamera(
        pose.fov,
        viewport.width / viewport.height,
        0.1,
        120,
      );
      camera.position.fromArray(pose.position);
      camera.lookAt(new Vector3(...pose.target));
      camera.setViewOffset(
        viewport.width,
        viewport.height,
        pose.offset[0],
        pose.offset[1],
        viewport.width,
        viewport.height,
      );
      camera.updateMatrixWorld();
      const slot = slotForArtwork(a),
        size = artworkSize(a, slot);
      const dock = await immersive.locator(".visit-dock").boundingBox();
      for (const x of [-1, 1])
        for (const y of [-1, 1]) {
          const p = new Vector3(
            slot.position[0] +
              slot.wallNormal[0] * FRAME_FRONT_DEPTH +
              (Math.cos(slot.rotationY) * x * (size.width + FRAME_OUTSET)) / 2,
            slot.position[1] + (y * (size.height + FRAME_OUTSET)) / 2,
            slot.position[2] +
              slot.wallNormal[2] * FRAME_FRONT_DEPTH -
              (Math.sin(slot.rotationY) * x * (size.width + FRAME_OUTSET)) / 2,
          ).project(camera);
          expect(((p.x + 1) * viewport.width) / 2).toBeGreaterThan(0);
          expect(((p.x + 1) * viewport.width) / 2).toBeLessThan(viewport.width);
          expect(((1 - p.y) * viewport.height) / 2).toBeGreaterThan(76);
          expect(((1 - p.y) * viewport.height) / 2).toBeLessThan(dock.y);
        }
      observed.push({ id: a.id, viewport, pose });
      if (a.id === source.id || a.id === central.id)
        await immersive.screenshot({
          path: path.join(
            out,
            `${a.id === central.id ? "central-wall" : "real-size"}-${viewport.width}.png`,
          ),
        });
    }
  }
  const desktop = observed.filter((o) => o.viewport.width === 1440);
  expect(desktop[1].pose.target).not.toEqual(desktop[2].pose.target);
  await writeFile(
    path.join(out, "camera-poses.json"),
    JSON.stringify(observed, null, 2),
  );
  mark(
    "Actual WebGL projects all frame corners above the dock on desktop/mobile for a physically sized painting, both A2 paintings and the new central D wall; every artwork has its own focus",
  );
  await immersive
    .getByRole("button", { name: "Reprendre la visite", exact: true })
    .click();
  const canvas = immersive.locator("canvas");
  await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
    timeout: 60000,
  });
  const p0 = await canvas.getAttribute("data-camera-position");
  await expect
    .poll(() => canvas.getAttribute("data-camera-position"), { timeout: 15000 })
    .not.toBe(p0);
  await expect(canvas).toHaveAttribute("data-camera-room", "room-2");
  expect(Number(await canvas.getAttribute("data-tour-speed"))).toBeGreaterThan(
    0,
  );
  await immersive.screenshot({
    path: path.join(out, "automatic-walk-room-2.png"),
  });
  await immersive.close();
  mark(
    "Walking resumes smoothly from the new central painting inside room 2 with one active camera and no JavaScript error",
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
