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
const out = path.join(project, "artifacts/admin-collection");
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
  return result;
}
const before = await sourceState();
const fixture = await mkdtemp(path.join(os.tmpdir(), "museum-collection-qa-"));
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
  const collection = page.getByLabel("Collection / série", { exact: true });
  const placement = page.getByLabel(/^Emplacement/);
  const save = page.getByRole("button", {
    name: "Enregistrer les modifications",
    exact: true,
  });
  async function stored() {
    const response = await context.request.get(`${origin}/api/admin/artworks`);
    expect(response.status()).toBe(200);
    const data = await response.json();
    return { data, artwork: data.artworks.find((a) => a.id === original.id) };
  }
  async function submit(status) {
    const response = page.waitForResponse(
      (r) =>
        r.url() === `${origin}/api/admin/artworks` &&
        r.request().method() === "POST",
    );
    await save.click();
    expect((await response).status()).toBe(status);
    await expect(save).toBeEnabled();
  }
  await collection.fill("Récits & paysages");
  await expect(placement).toHaveValue(""); // The real editor clears its old room slot.
  await submit(200);
  const joined = await stored();
  placements.push({
    step: "join-existing-collection",
    id: joined.artwork.id,
    collection: joined.artwork.collection,
    roomId: joined.artwork.roomId,
    slotId: joined.artwork.slotId,
    publication: joined.artwork.publication,
  });
  expect(joined.artwork.collection).toBe("Récits & paysages");
  expect(joined.artwork.roomId).toBe("room-2");
  expect(joined.artwork.slotId).toMatch(/^room-2-slot-/);
  expect(joined.data.rooms).toHaveLength(2);
  await expect(placement).toHaveValue(joined.artwork.slotId);
  checks.push(
    "Changing collection resets placement and automatically joins room-2",
  );

  const priorFailure = await readFile(path.join(fixture, "data.json"), "utf8");
  await collection.fill("Collection QA temporaire");
  await expect(placement).toHaveValue("");
  await submit(409);
  await expect(page.locator(".admin-error[role=alert]")).toContainText(
    "Aucun emplacement disponible pour cette collection",
  );
  expect(await readFile(path.join(fixture, "data.json"), "utf8")).toBe(
    priorFailure,
  );
  await expect(collection).toHaveValue("Collection QA temporaire");
  checks.push(
    "A new collection is refused when both rooms belong to other collections, with no partial write",
  );
  await page.screenshot({
    path: path.join(out, "no-empty-room.png"),
    fullPage: true,
  });

  await page
    .getByRole("button", {
      name: "Activer une salle supplémentaire",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Salle 3 activée. Ses 12 emplacements sont disponibles.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(collection).toHaveValue("Collection QA temporaire");
  await page
    .getByLabel("Publication", { exact: false })
    .selectOption("published");
  await submit(200);
  const final = await stored();
  placements.push({
    step: "publish-new-collection",
    id: final.artwork.id,
    collection: final.artwork.collection,
    roomId: final.artwork.roomId,
    slotId: final.artwork.slotId,
    publication: final.artwork.publication,
  });
  expect(final.data.rooms).toEqual(["room-1", "room-2", "room-3"]);
  expect(final.artwork.collection).toBe("Collection QA temporaire");
  expect(final.artwork.publication).toBe("published");
  expect(final.artwork.roomId).toBe("room-3");
  expect(final.artwork.slotId).toMatch(/^room-3-slot-/);
  await expect(placement).toHaveValue(final.artwork.slotId);
  // Assert persistence in the temporary filesystem, independently of the editor state.
  const disk = JSON.parse(
    await readFile(path.join(fixture, "data.json"), "utf8"),
  );
  expect(disk.artworks.find((a) => a.id === original.id)).toEqual(
    final.artwork,
  );
  const publicResponse = await fetch(`${origin}/oeuvres/${original.slug}`);
  expect(publicResponse.status).toBe(200);
  expect(await publicResponse.text()).toContain(original.title);
  checks.push(
    "Activating room-3 enables publication of the new collection there, persisted on fixture and public detail available",
  );
  await page.screenshot({
    path: path.join(out, "collection-room-3-published.png"),
    fullPage: true,
  });
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
    elapsedMs: Date.now() - started,
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
