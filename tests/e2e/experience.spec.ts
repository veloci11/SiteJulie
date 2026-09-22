import { test, expect } from "@playwright/test";
import { openArtworkDrawer } from "./navigation-helpers";
import type { PublicData } from "../../lib/data/types";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 667, height: 375 },
]) {
  test(`visitor controls and artwork selection at ${viewport.width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const data: PublicData = await (
      await request.get("/api/museum/data")
    ).json();
    await page.goto("/");
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    await expect(page.locator(".visit-dock")).toBeVisible({ timeout: 60000 });
    await expect(page.locator(".visit-shell")).toHaveAttribute(
      "data-arrival-state",
      "live",
    );
    const canvas = await page.locator("canvas").elementHandle();
    await expect(page.locator(".visit-auto-preview")).toHaveCount(0);
    await page.screenshot({
      path: `artifacts/experience-qa/home-${viewport.width}.png`,
    });
    if (viewport.height > 520) {
      const strip = page.locator(".visit-filmstrip");
      await expect(strip).toBeVisible();
      await page
        .getByRole("button", { name: "Défiler les miniatures vers la droite" })
        .click();
      await expect
        .poll(() => strip.evaluate((n) => n.scrollLeft))
        .toBeGreaterThan(0);
      await page.getByRole("tab").last().click();
      await expect
        .poll(() => strip.evaluate((n) => n.scrollLeft))
        .toBeLessThanOrEqual(4);
      await page
        .getByRole("button", { name: "Réduire les miniatures" })
        .click();
      await expect(strip).toBeHidden();
      await page
        .getByRole("button", { name: "Afficher les miniatures" })
        .click();
      await expect(strip).toBeVisible();
      await page.locator(".visit-film-card").first().click();
    } else {
      await openArtworkDrawer(page);
      await page.locator(".visit-art-card").first().click();
    }
    await expect(page.locator(".visit-details")).toBeVisible();
    await expect(page.locator(".visit-filmstrip")).toBeVisible();
    const selected = data.artworks.find(
      (a) => new URL(page.url()).searchParams.get("slug") === a.slug,
    )!;
    const collection = data.artworks
      .filter((a) => a.collection === selected.collection)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const start = collection.findIndex((a) => a.id === selected.id);
    // Several real button activations in one frame must all advance the request.
    await page
      .getByRole("button", { name: "Œuvre suivante", exact: true })
      .evaluate((n) => {
        if (!(n instanceof HTMLButtonElement))
          throw new Error("Bouton suivant introuvable");
        n.click();
        n.click();
        n.click();
      });
    const final = collection[(start + 3) % collection.length];
    await expect(page).toHaveURL(
      new RegExp(`slug=${encodeURIComponent(final.slug)}`),
    );
    await expect(page.locator(".visit-details h2")).toHaveText(final.title);
    await page
      .getByRole("button", { name: "Œuvre précédente", exact: true })
      .click();
    const previous = collection[(start + 2) % collection.length];
    await expect(page.locator(".visit-details h2")).toHaveText(previous.title);
    await page.goBack();
    await expect(page.locator(".visit-details h2")).toHaveText(final.title);
    await page.reload();
    await expect(page.locator(".visit-details h2")).toHaveText(final.title);
    const bounds = await page.locator(".visit-dock").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    // Each compact-dock control must be unobscured and usable, including 320px.
    expect(
      await page
        .locator(".visit-dock-heading button:visible")
        .evaluateAll((nodes) =>
          nodes.every((node) => {
            const r = node.getBoundingClientRect();
            const hit = document.elementFromPoint(
              r.x + r.width / 2,
              r.y + r.height / 2,
            );
            return hit && node.contains(hit);
          }),
        ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/experience-qa/artwork-${viewport.width}.png`,
    });
    await page
      .getByRole("button", { name: "S’informer sur cette œuvre", exact: true })
      .click();
    await expect(page.locator(".visit-editorial")).toBeVisible();
    await expect(page.locator(".visit-editorial")).toContainText(final.title);
    await page.keyboard.press("Escape");
    await expect(page.locator(".visit-editorial")).toBeHidden();
    await expect(page.locator(".visit-hero h1")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Changer de salle", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Les salles", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Changer de salle", exact: true }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    // The reload deliberately creates one new Canvas; subsequent editorial routes keep it.
    expect(await page.locator("canvas").count()).toBe(1);
    await canvas?.dispose();
  });
}

test("automatic promenade, interruptions and cross-room selection stay controllable", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const data: PublicData = await (await request.get("/api/museum/data")).json();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
    timeout: 60000,
  });
  const original = await canvas.elementHandle();
  await expect(page.locator(".visit-tour-toggle")).toHaveCount(0);
  const pose = await canvas.getAttribute("data-camera-position");
  await expect
    .poll(() => canvas.getAttribute("data-camera-position"))
    .not.toBe(pose);
  const preview = page.locator(".visit-auto-preview");
  await expect(preview).toBeVisible();
  const shownId = await preview.getAttribute("data-artwork-id");
  expect(shownId).toBe(await canvas.getAttribute("data-tour-artwork"));
  const bounds = await preview.boundingBox();
  const dock = await page.locator(".visit-dock").boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThan(dock!.y);
  await preview.hover();
  await page.waitForTimeout(350);
  expect(await preview.getAttribute("data-artwork-id")).toBe(shownId);
  await page.screenshot({
    path: "artifacts/experience-qa/automatic-artwork-preview.png",
  });
  await preview.click();
  await expect(page).toHaveURL(
    new RegExp(
      `slug=${encodeURIComponent(data.artworks.find((a) => a.id === shownId)!.slug)}`,
    ),
  );
  await expect(preview).toBeHidden();
  await expect(page.locator(".visit-travel")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Arriver directement" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Œuvre suivante", exact: true })
    .click();
  const expectedSlug = new URL(page.url()).searchParams.get("slug");
  await expect(page.locator(".visit-details h2")).toHaveText(
    data.artworks.find((a) => a.slug === expectedSlug)!.title,
  );
  await openArtworkDrawer(page);
  const other = data.artworks.find(
    (a) => a.roomId === data.rooms[1] && a.imageWidth > a.imageHeight,
  )!;
  await page
    .getByRole("button", { name: `Choisir ${other.title}`, exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/experience-qa/transit-desktop.png",
  });
  await expect(page.locator(".visit-details h2")).toHaveText(other.title, {
    timeout: 45000,
  });
  await page.screenshot({
    path: "artifacts/experience-qa/landscape-work-desktop.png",
  });
  await page
    .getByRole("button", { name: "Revenir à la salle", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  expect(
    await original!.evaluate((n) => n === document.querySelector("canvas")),
  ).toBe(true);
  expect(errors).toEqual([]);
});
