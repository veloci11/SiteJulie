// Do not run until root confirms final assets/GPU freeze. This is a visual fixture, never a benchmark.
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
import { PerspectiveCamera, Vector3 } from "three";
import sharp from "sharp";

const project = process.cwd();
const port = 3003;
const origin = `http://127.0.0.1:${port}`;
const out = path.join(project, "artifacts/admin-sold-webgl");
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
const fixture = await mkdtemp(path.join(os.tmpdir(), "museum-sold-webgl-"));
if (path.resolve(fixture) === path.resolve(project, ".local"))
  throw new Error("Fixture must be isolated");
let child,
  browser,
  page,
  serverLog = "",
  passed = false;
const checks = [];
const placements = [];
const captures = [];
let comparison = null;
const errors = [];
const started = Date.now();
const hardLimit = setTimeout(() => {
  browser?.close().catch(() => {});
  child?.kill("SIGTERM");
}, 240000);
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
  Object.assign(original, {
    slotId: "room-1-slot-05",
    placementOffsetX: 0.2,
    placementOffsetY: 0.15,
    displayScale: 0.6,
    availability: "sold",
    publication: "published",
  });
  await writeFile(
    path.join(fixture, "seed.json"),
    JSON.stringify(seed, null, 2),
  );
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
  // Rendering comparison only, not a native-GPU performance measurement.
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
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    window.__museumLabelTexts = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      if (text === "VENDUE")
        window.__museumLabelTexts.push({
          text,
          width: this.canvas.width,
          height: this.canvas.height,
        });
      return original.call(this, text, ...args);
    };
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  const admin = await browser.newContext();
  expect(
    (
      await admin.request.post(`${origin}/api/admin/login`, {
        headers: { origin },
        data: {},
      })
    ).status(),
  ).toBe(200);
  async function capture(state) {
    await page.goto(`${origin}/?vue=oeuvre&slug=oeuvre-03`, {
      waitUntil: "domcontentloaded",
    });
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toHaveAttribute("data-renderer-ready", "true", {
      timeout: 60000,
    });
    await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
      timeout: 60000,
    });
    await expect(canvas).toHaveAttribute("data-detail-state", "ready", {
      timeout: 30000,
    });
    await expect(page.locator("picture.visit-arrival")).toHaveClass(/is-ready/);
    await expect(page.locator("picture.visit-arrival")).toHaveCSS(
      "opacity",
      "0",
    );
    await expect(
      page.getByRole("complementary", {
        name: "Fiche de Œuvre 03",
        exact: true,
      }),
    ).toBeVisible();
    if (state === "sold")
      await expect(page.locator(".visit-price-status")).toHaveText("Vendue");
    else await expect(page.locator(".visit-price-status")).toHaveCount(0);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
    });
    const data = await canvas.evaluate((node) => ({ ...node.dataset }));
    const paintedLabels = await page.evaluate(() => window.__museumLabelTexts);
    const soldLabelCount = paintedLabels.filter(
      (item) => item.text === "VENDUE",
    ).length;
    if (state === "sold") expect(soldLabelCount).toBeGreaterThan(0);
    else expect(soldLabelCount).toBe(0);
    const gpu = await canvas.evaluate((node) => {
      const gl = node.getContext("webgl2") || node.getContext("webgl");
      if (!gl) return null;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        renderer: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
      };
    });
    expect(gpu).not.toBeNull();
    const camera = new PerspectiveCamera(
      Number(data.cameraFov),
      1440 / 900,
      0.1,
      260,
    );
    camera.position.fromArray(JSON.parse(data.cameraPosition));
    camera.lookAt(new Vector3(...JSON.parse(data.cameraTarget)));
    const offset = JSON.parse(data.cameraOffset);
    camera.setViewOffset(1440, 900, ...offset, 1440, 900);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // Fixture slot05 is the right wall: exact shared contract, including 35mm air gap.
    const position = new Vector3(5.86 - 0.035, 2.65 + 0.15, 6 + 0.2);
    const height = 3 * 0.6,
      width = (height * original.imageWidth) / original.imageHeight;
    const point = (x, y, z) =>
      new Vector3(x, y, z)
        .applyAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2)
        .add(position)
        .project(camera);
    function projectRect(w, h, y, z) {
      const pts = [
        point(-w / 2, y - h / 2, z),
        point(w / 2, y - h / 2, z),
        point(w / 2, y + h / 2, z),
        point(-w / 2, y + h / 2, z),
      ].map((p) => ({ x: (p.x + 1) * 720, y: (1 - p.y) * 450 }));
      const x = Math.floor(Math.min(...pts.map((p) => p.x))),
        top = Math.floor(Math.min(...pts.map((p) => p.y)));
      return {
        x,
        y: top,
        width: Math.ceil(Math.max(...pts.map((p) => p.x))) - x,
        height: Math.ceil(Math.max(...pts.map((p) => p.y))) - top,
      };
    }
    const face = projectRect(width, height, 0, 0.132),
      label = projectRect(0.62, 0.19, -height / 2 - 0.25, -0.015);
    for (const rect of [face, label]) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(1440);
      expect(rect.y + rect.height).toBeLessThanOrEqual(900);
    }
    const overlays = await page
      .locator(".visit-details,.visit-dock,.visit-header")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const r = node.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      );
    const occluded = overlays.some(
      (r) =>
        label.x < r.x + r.width &&
        label.x + label.width > r.x &&
        label.y < r.y + r.height &&
        label.y + label.height > r.y,
    );
    await page.screenshot({ path: path.join(out, `${state}-scene.png`) });
    await page.screenshot({
      path: path.join(out, `${state}-label.png`),
      clip: label,
    });
    const facePng = await page.screenshot({
      path: path.join(out, `${state}-painting.png`),
      clip: face,
    });
    const stats = await sharp(facePng)
      .extract({
        left: Math.floor(face.width * 0.25),
        top: Math.floor(face.height * 0.25),
        width: Math.floor(face.width * 0.5),
        height: Math.floor(face.height * 0.5),
      })
      .stats();
    const mean =
      stats.channels.slice(0, 3).reduce((sum, c) => sum + c.mean, 0) / 3;
    const entry = {
      state,
      data,
      face,
      label,
      paintedLabels,
      gpu,
      meanImageBrightness: mean,
      labelUnoccluded: !occluded,
    };
    captures.push(entry);
    return entry;
  }
  const sold = await capture("sold");
  const privateData = await (
    await admin.request.get(`${origin}/api/admin/artworks`)
  ).json();
  const saved = privateData.artworks.find((a) => a.id === "oeuvre-03");
  expect(saved).toMatchObject({
    slotId: "room-1-slot-05",
    placementOffsetX: 0.2,
    placementOffsetY: 0.15,
    displayScale: 0.6,
    availability: "sold",
    publication: "published",
  });
  expect(
    (
      await admin.request.post(`${origin}/api/admin/artworks`, {
        headers: { origin },
        data: { ...saved, availability: "available" },
      })
    ).status(),
  ).toBe(200);
  const available = await capture("available");
  for (const key of [
    "cameraPosition",
    "cameraTarget",
    "cameraFov",
    "cameraOffset",
  ])
    expect(available.data[key]).toBe(sold.data[key]);
  expect(available.face).toEqual(sold.face);
  expect(available.label).toEqual(sold.label);
  expect(
    sold.labelUnoccluded && available.labelUnoccluded,
    "The physical status label must not be hidden by the UI",
  ).toBe(true);
  comparison = {
    soldBrightness: sold.meanImageBrightness,
    availableBrightness: available.meanImageBrightness,
    ratio: sold.meanImageBrightness / available.meanImageBrightness,
  };
  expect(comparison.ratio).toBeLessThan(0.9);
  expect(comparison.ratio).toBeGreaterThan(0.35);
  const media = await context.request.get(
    `${origin}/api/media/oeuvre-03?variant=room`,
  );
  expect(media.status()).toBe(200);
  expect(digest(await media.body())).toBe(before["oeuvre-03-room.webp"]);
  for (const variant of ["thumb", "room", "detail"])
    expect(
      digest(
        await readFile(
          path.join(fixture, "media", `oeuvre-03-${variant}.webp`),
        ),
      ),
    ).toBe(before[`oeuvre-03-${variant}.webp`]);
  placements.push(saved);
  checks.push(
    "Real WebGL moved/scaled sold work remains published, physical VENDUE label painted and projected clear of overlays; available comparison has identical camera and geometry, brighter actual image pixels; original and served media unchanged",
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
    webGL: true,
    performanceBenchmark: false,
    captures,
    comparison,
    visualReviewRequired: true,
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
