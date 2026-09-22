import { test, expect } from "@playwright/test";
import { openArtworkDrawer } from "./navigation-helpers";
import type { PublicData } from "../../lib/data/types";

for (const entryRoom of ["room-1", "room-2"]) {
  test(`entry in ${entryRoom} stays usable while the other room is blocked`, async ({
    page,
    request,
  }) => {
    const data: PublicData = await (
      await request.get("/api/museum/data")
    ).json();
    const otherRoom = data.rooms.find((room) => room !== entryRoom)!;
    const blocked = new Set(
      data.artworks
        .filter((a) => a.roomId === otherRoom)
        .map((a) => new URL(a.image, "http://local").pathname),
    );
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/media/**", async (route) => {
      const url = new URL(route.request().url());
      if (
        blocked.has(url.pathname) &&
        url.searchParams.get("variant") === "room"
      )
        await barrier;
      await route.continue();
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    try {
      await page.goto(`/?vue=salle&salle=${entryRoom}`, {
        waitUntil: "domcontentloaded",
      });
      const canvas = page.locator("canvas");
      await expect(canvas).toHaveAttribute("data-renderer-ready", "true", {
        timeout: 60000,
      });
      await expect(canvas).toHaveAttribute("data-loaded-rooms", entryRoom);
      const original = await canvas.elementHandle();
      await page.locator(".visit-film-card").first().click();
      await expect(page.locator(".visit-details")).toBeVisible();
      const first = data.artworks.find((a) => a.roomId === otherRoom)!;
      const last = data.artworks.filter((a) => a.roomId === otherRoom).at(-1)!;
      await openArtworkDrawer(page);
      await page
        .getByRole("button", { name: `Choisir ${first.title}`, exact: true })
        .click();
      await expect(canvas).toHaveAttribute("data-pending-room", otherRoom);
      const pose = await canvas.getAttribute("data-camera-position");
      await page.waitForTimeout(350);
      expect(await canvas.getAttribute("data-camera-position")).toBe(pose);
      await openArtworkDrawer(page);
      await page
        .getByRole("button", { name: `Choisir ${last.title}`, exact: true })
        .click();
      await page.screenshot({
        path: `artifacts/loading-qa/${entryRoom}-waiting.png`,
      });
      release();
      await expect(canvas).toHaveAttribute("data-all-rooms-ready", "true", {
        timeout: 60000,
      });
      await expect(page.locator(".visit-details h2")).toHaveText(last.title);
      await expect(canvas).toHaveAttribute("data-camera-room", otherRoom);
      expect(
        await original!.evaluate((n) => n === document.querySelector("canvas")),
      ).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({
        path: `artifacts/loading-qa/${entryRoom}-arrived.png`,
      });
    } finally {
      release();
    }
  });
}

test("a failed background room does not remove the usable first room", async ({
  page,
  request,
}) => {
  const data: PublicData = await (await request.get("/api/museum/data")).json();
  const image = data.artworks.find((a) => a.roomId === data.rooms[1])!.image;
  await page.route(`**${image}`, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-renderer-ready",
    "true",
    { timeout: 60000 },
  );
  await page.waitForTimeout(1500);
  await page.locator(".visit-film-card").first().click();
  await expect(page.locator(".visit-details")).toBeVisible();
  await expect(page.locator(".visit-fallback")).toHaveCount(0);
});
