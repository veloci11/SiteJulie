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
const out = path.join(project, "artifacts/admin-save-baseline");
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
    path.join(project, ".local/data.json"),
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
  await expect(page.locator('.admin-artwork-card')).toHaveCount(8);
  for(const artwork of seed.artworks) {
    await page.locator('.admin-artwork-card').filter({hasText:artwork.title}).click();
    const response=page.waitForResponse(r=>r.url()===`${origin}/api/admin/artworks`&&r.request().method()==='POST',{timeout:3000}).catch(()=>null);
    await page.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();
    const r=await response;
    const invalid=await page.locator('input:invalid').evaluateAll(xs=>xs.map(x=>({value:x.value,message:x.validationMessage,label:x.labels?.[0]?.textContent})));
    checks.push({id:artwork.id,status:r?.status()||null,body:r?await r.json():null,invalid});
    await page.getByRole('button',{name:'Toutes les œuvres',exact:true}).click();
  }
  await page.locator('.admin-artwork-card').filter({hasText:original.title}).click();
  await page.getByLabel('Collection / série',{exact:true}).fill('Visage');
  const rejected=page.waitForResponse(r=>r.url()===`${origin}/api/admin/artworks`&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();
  const r=await rejected;
  checks.push({scenario:'Collection typo',status:r.status(),body:await r.json(),errorBox:await page.locator('.admin-error').boundingBox(),viewport:page.viewportSize()});
  await page.screenshot({path:path.join(out,'save-error-viewport.png')});
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
