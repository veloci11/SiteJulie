import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, mkdtemp, rm, cp } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { arrivalFingerprint } from "../lib/museum/arrival";
import { publicArtwork } from "../lib/validation/artwork";
import type { AdminArtwork, PublicData } from "../lib/data/types";

async function main() {
  const root = process.cwd();
  const storePath = await readFile(".local/data.json", "utf8")
    .then(() => ".local/data.json")
    .catch(() => ".local/seed.json");
  const store = JSON.parse(await readFile(storePath, "utf8"));
  const data: PublicData = {
    ...store,
    mode: "demo",
    artworks: store.artworks
      .filter((a: AdminArtwork) => a.publication === "published")
      .map(publicArtwork),
  };
  await mkdir(".local/arrival", { recursive: true });
  await mkdir("artifacts/contemporary", { recursive: true });
  const fixture = await mkdtemp(path.join(os.tmpdir(), "museum-empty-poster-"));
  await writeFile(
    path.join(fixture, "seed.json"),
    JSON.stringify({ ...store, artworks: [] }),
  );
  const emptyServer = spawn(process.execPath, [".next/standalone/server.js"], {
    env: {
      ...process.env,
      MUSEUM_DATA_MODE: "demo",
      MUSEUM_LOCAL_PREVIEW: "1",
      MUSEUM_ARRIVAL_GENERATION: "0",
      MUSEUM_LOCAL_DATA_DIR: fixture,
      HOSTNAME: "127.0.0.1",
      PORT: "3002",
    },
    stdio: "ignore",
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (let i = 0; i < 100; i++) {
      if (
        await fetch("http://127.0.0.1:3002")
          .then((r) => r.ok)
          .catch(() => false)
      )
        break;
      await new Promise((r) => setTimeout(r, 100));
    }
    for (const empty of [true, false]) {
      for (const room of data.rooms) {
        for (const [view, viewport] of [
          ["wide", { width: 1600, height: 1000 }],
          ["portrait", { width: 430, height: 932 }],
        ] as const) {
          const page = await browser.newPage({
            viewport,
            deviceScaleFactor: 1.5,
            reducedMotion: "reduce",
          });
          const origin = empty
            ? "http://127.0.0.1:3002"
            : process.env.MUSEUM_QA_URL || "http://127.0.0.1:3000";
          await page.goto(`${origin}/?vue=salle&salle=${room}`);
          await page
            .locator(
              'canvas[data-navigation-state="arrived"][data-all-rooms-ready="true"]',
            )
            .waitFor({ timeout: 60000 });
          await page
            .locator(".visit-arrival.is-ready")
            .waitFor({ state: "attached", timeout: 60000 });
          await page.waitForTimeout(1300);
          if (!empty)
            await page.screenshot({
              path: `artifacts/contemporary/${room}-${view}.png`,
            });
          await page.addStyleTag({
            content:
              // Descendant SVGs can override inherited visibility. Remove each
              // HTML overlay from painting entirely, keeping the full-size Canvas.
              ".visit-header,.visit-dock,.visit-scene>:not(.canvas-wrap){display:none!important}",
          });
          const image = await page.locator("canvas").screenshot();
          const file = empty
            ? `public/museum/arrival-empty-${room}-${view}.webp`
            : `.local/arrival/${room}-${view}.webp`;
          await sharp(image)
            .resize({
              width: view === "wide" ? 1920 : 720,
              withoutEnlargement: true,
            })
            .webp({ quality: 88, smartSubsample: true })
            .toFile(file);
          // The fixture server uses the same standalone public folder.
          if (empty) {
            await cp(file, path.join(".next/standalone", file));
            if (room === "room-1") {
              await cp(file, `public/museum/arrival-empty-${view}.webp`);
              await cp(
                file,
                `.next/standalone/public/museum/arrival-empty-${view}.webp`,
              );
            }
          }
          console.log(file, (await readFile(file)).length, "bytes");
          await page.close();
        }
      }
    }
    const after = JSON.parse(await readFile(storePath, "utf8"));
    if (
      arrivalFingerprint({
        rooms: after.rooms,
        artworks: after.artworks
          .filter((a: AdminArtwork) => a.publication === "published")
          .map(publicArtwork),
      }) !== arrivalFingerprint(data)
    )
      throw new Error(
        "Catalogue changed during capture; keep the architecture-only fallback and recapture.",
      );
    await writeFile(
      ".local/arrival/manifest.json",
      JSON.stringify(
        {
          fingerprint: arrivalFingerprint(data),
          capturedAt: new Date().toISOString(),
          notice:
            "Actual browser scene captures. Private, served only for matching public artwork placements.",
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    emptyServer.kill("SIGTERM");
    await rm(fixture, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
