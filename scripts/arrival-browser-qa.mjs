// Disposable local gallery. No live gallery or Blob writes.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, cp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
const root = process.cwd(),
  output = path.join(root, "artifacts/experience-qa/arrival");
const fixture = await mkdtemp(path.join(os.tmpdir(), "arrival-browser-"));
const origin = "http://127.0.0.1:3027";
const digest = (b) => createHash("sha256").update(b).digest("hex");
const original = await readFile(".local/data.json").catch(() =>
  readFile(".local/seed.json"),
);
let server,
  browser,
  logs = "",
  passed = false;
const events = [];
try {
  await mkdir(output, { recursive: true });
  const seed = JSON.parse(original);
  seed.artworks.find((a) => a.publication === "published").title +=
    " — fixture arrivée";
  await writeFile(path.join(fixture, "seed.json"), JSON.stringify(seed));
  await cp(".local/media", path.join(fixture, "media"), { recursive: true });
  await cp("public", ".next/standalone/public", { recursive: true });
  await cp(".next/static", ".next/standalone/.next/static", {
    recursive: true,
  });
  server = spawn(process.execPath, [".next/standalone/server.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: "3027",
      MUSEUM_DATA_MODE: "demo",
      MUSEUM_LOCAL_PREVIEW: "1",
      MUSEUM_ARRIVAL_GENERATION: "0",
      MUSEUM_LOCAL_DATA_DIR: fixture,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (c) => (logs += c));
  server.stderr.on("data", (c) => (logs += c));
  for (let i = 0; i < 80; i++) {
    if (
      await fetch(origin)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const anonymous = await context.request.post(
    `${origin}/api/admin/arrival?commit=1`,
    { headers: { Origin: origin } },
  );
  expect(anonymous.status()).toBe(401);
  const login = await context.request.post(`${origin}/api/admin/login`, {
    headers: { Origin: origin },
  });
  expect(login.status()).toBe(200);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/api/admin/arrival"))
      console.log("capture upload", r.status());
  });
  await page.goto(`${origin}/admin`);
  const status = page.locator(".admin-arrival-status");
  await expect(status).toHaveText("Image d’accueil à jour", {
    timeout: 120000,
  });
  let first = await (
    await context.request.get(`${origin}/api/museum/arrival/status`)
  ).json();
  expect(first.ready).toBe(true);
  events.push({ stage: "initial", fingerprint: first.fingerprint });
  await page.locator(".admin-artwork-card").first().click();
  await page
    .getByLabel("Titre", { exact: true })
    .fill("Capture actualisée automatiquement");
  await page
    .getByRole("button", { name: /Enregistrer/ })
    .first()
    .click();
  await expect(status).toContainText("Actualisation", { timeout: 15000 });
  await expect(status).toHaveText("Image d’accueil à jour", {
    timeout: 120000,
  });
  const last = await (
    await context.request.get(`${origin}/api/museum/arrival/status`)
  ).json();
  expect(last.ready).toBe(true);
  expect(last.fingerprint).not.toBe(first.fingerprint);
  events.push({ stage: "after-save", fingerprint: last.fingerprint });
  for (const room of seed.rooms)
    for (const view of ["wide", "portrait"]) {
      const response = await context.request.get(
        `${origin}/api/museum/arrival?room=${room}&view=${view}&v=${first.fingerprint}`,
      );
      expect(response.status()).toBe(200);
      const bytes = await response.body();
      const stats = await sharp(bytes).stats();
      expect(stats.channels[0].stdev).toBeGreaterThan(10);
      await writeFile(path.join(output, `${room}-${view}.webp`), bytes);
    }
  await page.screenshot({ path: path.join(output, "admin-updated.png") });
  const visitor = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await visitor.route("**/*.js", (r) => r.abort());
  await visitor.goto(origin);
  await expect(visitor.locator(".visit-arrival img")).toBeVisible();
  await visitor.screenshot({
    path: path.join(output, "arrival-before-javascript.png"),
  });
  expect(errors).toEqual([]);
  const after = await readFile(".local/data.json").catch(() =>
    readFile(".local/seed.json"),
  );
  expect(digest(after)).toBe(digest(original));
  passed = true;
  console.log(
    "PASS: automatic capture, admin save, four refreshed views, anonymous rejection, original data preserved.",
  );
} finally {
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify({ passed, events, logs }, null, 2),
  );
  await browser?.close();
  server?.kill();
  await rm(fixture, { recursive: true, force: true });
}
