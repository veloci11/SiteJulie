// Run only after the current standalone build has been prepared. All mutations
// target a disposable port3003 fixture; background captures and the two UI tabs
// use separate, bounded Chrome instances.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, writeFile, cp, rm, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { chromium, expect } from "@playwright/test";
import os from "node:os";
import path from "node:path";
const root = process.cwd(),
  port = 3003,
  origin = `http://127.0.0.1:${port}`;
const output = path.join(root, "artifacts/arrival-generation");
await mkdir(output, { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function mainHashes() {
  return Object.fromEntries(
    await Promise.all(
      ["seed.json", "data.json"].map(async (name) => [
        name,
        await readFile(path.join(root, ".local", name))
          .then(hash)
          .catch((e) => {
            if (e.code !== "ENOENT") throw e;
            return null;
          }),
      ]),
    ),
  );
}
const before = await mainHashes();
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", resolve);
});
await new Promise((resolve) => probe.close(resolve));
const fixture = await mkdtemp(path.join(os.tmpdir(), "museum-arrival-qa-"));
let browser,
  server,
  logs = "",
  passed = false;
const events = [],
  started = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function status() {
  const response = await fetch(`${origin}/api/museum/arrival/status`);
  assert.equal(response.status, 200);
  return response.json();
}
async function ready(label) {
  const start = Date.now();
  while (Date.now() - start < 210_000) {
    const value = await status();
    assert(value.supported, JSON.stringify(value));
    if (value.error) throw new Error(value.error);
    if (value.ready) {
      events.push({ label, milliseconds: Date.now() - start, ...value });
      return value;
    }
    await sleep(1000);
  }
  throw new Error(`Generation timeout: ${label}`);
}
async function image(room, view, revision) {
  const response = await fetch(
    `${origin}/api/museum/arrival?room=${room}&view=${view}&v=${revision}`,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return Buffer.from(await response.arrayBuffer());
}
try {
  await cp(
    path.join(root, ".local/seed.json"),
    path.join(fixture, "seed.json"),
  );
  await cp(path.join(root, ".local/media"), path.join(fixture, "media"), {
    recursive: true,
  });
  const standalone = path.join(root, ".next/standalone");
  server = spawn(process.execPath, [path.join(standalone, "server.js")], {
    cwd: standalone,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      MUSEUM_DATA_MODE: "demo",
      MUSEUM_LOCAL_PREVIEW: "1",
      MUSEUM_ARRIVAL_GENERATION: "1",
      MUSEUM_LOCAL_DATA_DIR: fixture,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  server.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  for (let i = 0; i < 80; i++) {
    if (
      await fetch(`${origin}/admin`)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    assert(server.exitCode === null, logs);
    await sleep(250);
  }
  const firstPending = await status();
  assert.equal(firstPending.ready, false);
  const initial = await ready("initial complete batch");
  const initialImage = await image("room-1", "wide", initial.fingerprint);
  await writeFile(path.join(output, "room-1-before.webp"), initialImage);
  const login = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { Origin: origin },
  });
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const admin = await fetch(`${origin}/api/admin/artworks`, {
    headers: { Cookie: cookie },
  }).then((r) => r.json());
  const original = admin.artworks.find((a) => a.id === "oeuvre-03");
  assert(original);
  const save = async (artwork) => {
    const response = await fetch(`${origin}/api/admin/artworks`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(artwork),
    });
    const value = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    return value;
  };
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
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const gallery = await context.newPage();
  await gallery.goto(`${origin}/?vue=salle&salle=room-1`);
  await gallery
    .locator('canvas[data-navigation-state="arrived"]')
    .waitFor({ timeout: 60000 });
  await gallery.locator("canvas").evaluate((canvas) => {
    canvas.dataset.qaIdentity = "same-canvas";
  });
  await gallery
    .getByRole("button", { name: "Les salles", exact: true })
    .click();
  await expect(gallery.locator(".visit-room-card")).toHaveCount(2);
  const adminPage = await context.newPage();
  await adminPage.goto(`${origin}/admin`);
  await adminPage
    .getByRole("button", {
      name: "Ouvrir l’atelier de démonstration",
      exact: true,
    })
    .click();
  await adminPage
    .locator(".admin-artwork-card")
    .filter({ hasText: original.title })
    .click();
  await adminPage
    .getByLabel(/^Disponibilité/)
    .selectOption("sold");
  await adminPage
    .getByLabel(/^Collection/)
    .selectOption("Récits & paysages");
  const savedResponse = adminPage.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/artworks") &&
      response.request().method() === "POST",
  );
  const mutationStart = Date.now();
  await adminPage
    .getByRole("button", { name: "Enregistrer les modifications", exact: true })
    .click();
  const response = await savedResponse;
  const sold = await response.json();
  assert.equal(response.status(), 200, JSON.stringify(sold));
  events.push({
    label: "real Save UI completed without awaiting capture",
    milliseconds: Date.now() - mutationStart,
  });
  await adminPage.screenshot({
    path: path.join(output, "admin-save.png"),
    fullPage: false,
  });
  await gallery.bringToFront();
  await expect(gallery.locator(".visit-room-card").nth(0)).toContainText(
    "3 œuvres",
    { timeout: 15000 },
  );
  await expect(gallery.locator(".visit-room-card").nth(1)).toContainText(
    "5 œuvres",
  );
  expect(await gallery.locator("canvas").getAttribute("data-qa-identity")).toBe(
    "same-canvas",
  );
  const changed = await status();
  assert.notEqual(changed.fingerprint, initial.fingerprint);
  assert.equal(changed.ready, false);
  const fallback = await image("room-1", "wide", initial.fingerprint);
  assert.notEqual(hash(fallback), hash(initialImage));
  await writeFile(path.join(output, "room-1-pending.webp"), fallback);
  const updated = await ready("sold and moved complete batch");
  const updatedImage = await image("room-1", "wide", updated.fingerprint);
  assert.notEqual(hash(updatedImage), hash(initialImage));
  await writeFile(path.join(output, "room-1-sold-moved.webp"), updatedImage);
  for (const room of admin.rooms)
    for (const view of ["wide", "portrait"])
      await writeFile(
        path.join(output, `${room}-${view}.webp`),
        await image(room, view, updated.fingerprint),
      );
  await expect
    .poll(
      () =>
        gallery.locator(".visit-room-preview").first().getAttribute("style"),
      { timeout: 15000 },
    )
    .toContain(`${updated.fingerprint}-ready`);
  expect(await gallery.locator("canvas").getAttribute("data-qa-identity")).toBe(
    "same-canvas",
  );
  await gallery.screenshot({
    path: path.join(output, "gallery-live-previews.png"),
    fullPage: false,
  });
  const publicResponse = await fetch(`${origin}/api/museum/data`);
  assert.equal(
    publicResponse.headers.get("cache-control"),
    "private, no-store",
  );
  const publicData = await publicResponse.json();
  for (const artwork of publicData.artworks) {
    const privateArtwork = admin.artworks.find((a) => a.id === artwork.id);
    if (privateArtwork?.priceVisibility !== "public")
      assert.equal(artwork.priceMinor, null);
  }
  const publicSold = publicData.artworks.find((a) => a.id === sold.id);
  assert.equal(publicSold.availability, "sold");
  assert.equal(publicSold.roomId, "room-2");
  for (const artwork of publicData.artworks)
    for (const key of [
      "mediaId",
      "notes",
      "revision",
      "publication",
      "priceVisibility",
    ])
      assert(!(key in artwork), `Private field ${key}`);
  await browser.close();
  browser = undefined;
  // Exactly two completed capture batches. Closing the fixture immediately after
  // this revocation proof also stops the now-obsolete next capture if started.
  await save({ ...sold, publication: "archived" });
  const noStale = await image("room-1", "wide", updated.fingerprint);
  assert.equal(hash(noStale), hash(fallback));
  events.push({
    label: "archived work: old URL immediately returns empty fallback",
    passed: true,
  });
  const mainAfter = await mainHashes();
  assert.deepEqual(mainAfter, before);
  passed = true;
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  if (server && server.exitCode === null)
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      sleep(5000),
    ]);
  await writeFile(path.join(output, "server.log"), logs);
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(
      {
        passed,
        startedAt: new Date(started).toISOString(),
        milliseconds: Date.now() - started,
        checks: events,
        mainBefore: before,
        mainAfter: await mainHashes(),
      },
      null,
      2,
    ),
  );
  await rm(fixture, { recursive: true, force: true });
}
console.log(
  JSON.stringify(
    { passed, events, report: path.join(output, "report.json") },
    null,
    2,
  ),
);
