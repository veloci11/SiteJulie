import type { Vec3 } from "../../lib/museum/config";
import { test, expect } from "@playwright/test";
import {
  navigationObstaclesForRooms,
  segmentIsClear,
} from "../../lib/museum/navigation";

test("arrival stays framed and header glass follows the main navigation", async ({
  page,
  request,
}) => {
  const data = await (await request.get("/api/museum/data")).json();
  await page.goto("/?vue=salle&salle=room-1");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
    timeout: 60000,
  });
  await expect(page.locator(".visit-filmstrip")).toBeVisible();
  await expect(page.locator(".visit-pause-control")).toHaveCount(0);
  const indicator = page.locator(".visit-navigation-indicator");
  const startX = (await indicator.boundingBox())!.x;
  await page
    .locator(".visit-navigation")
    .getByRole("button", { name: "Les œuvres", exact: true })
    .click();
  await expect
    .poll(async () => (await indicator.boundingBox())!.x)
    .toBeGreaterThan(startX + 40);
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => Math.abs((await indicator.boundingBox())!.x - startX))
    .toBeLessThan(2);
  await page
    .locator(".visit-navigation")
    .getByRole("link", { name: "À propos", exact: true })
    .click();
  await expect(page.locator(".visit-editorial")).toBeVisible();
  await expect
    .poll(async () => (await indicator.boundingBox())!.x)
    .toBeGreaterThan(startX + 90);
  // The editorial window must leave both pointer and keyboard navigation live.
  const navigation = page.locator(".visit-navigation");
  await navigation.getByRole("link", { name: "Contact", exact: true }).click();
  await expect(page).toHaveURL(/vue=contact/);
  await expect(
    page.getByRole("dialog", { name: "Contacter l’artiste", exact: true }),
  ).toBeVisible();
  const about = navigation.getByRole("link", { name: "À propos", exact: true });
  await about.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/vue=apropos/);
  await expect(
    page.getByRole("dialog", { name: "À propos de l’artiste", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/experience-qa/accessible-about-1440.png",
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".visit-editorial")).toBeHidden();
  await expect(page.locator(".visit-series-indicator")).toHaveCount(0);
  expect(
    await page
      .locator(".visit-dock")
      .evaluate((node) => getComputedStyle(node).backdropFilter),
  ).toBe("none");
  await page.getByRole("tab").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab").last()).toBeFocused();
  await page.locator(".visit-film-card").first().click();
  await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
    timeout: 60000,
  });
  await expect(
    page.locator('.visit-details[data-visible="true"]'),
  ).toBeVisible();
  const pose = await canvas.getAttribute("data-camera-position");
  const shift = await canvas.getAttribute("data-camera-offset");
  await page.evaluate(
    () => new Promise((resolve) => setTimeout(resolve, 1200)),
  );
  await expect(canvas).toHaveAttribute("data-navigation-state", "arrived");
  await expect(canvas).toHaveAttribute("data-camera-position", pose!);
  await expect(canvas).toHaveAttribute("data-camera-offset", shift!);
  await page
    .getByRole("button", { name: "Fermer les informations", exact: true })
    .click();
  await expect(page.locator(".visit-details")).toBeHidden();
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 650)));
  await expect(canvas).toHaveAttribute("data-camera-position", pose!);
  await expect(canvas).toHaveAttribute("data-camera-offset", shift!);
  await page
    .getByRole("button", { name: "Informations sur cette œuvre", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/experience-qa/glass-focus-1440.png",
  });
  await page.goto("/oeuvres");
  await expect(
    page.getByText("Version de démonstration · Titres provisoires", {
      exact: true,
    }),
  ).toHaveCount(0);
  expect(data.artworks.length).toBeGreaterThan(0);
});

test("mouse drag turns the gaze, releases without a jump and continues through clear space", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const data = await (await request.get("/api/museum/data")).json();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/?vue=oeuvre&slug=${data.artworks[0].slug}`);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
    timeout: 60000,
  });
  await expect(
    page.locator('.visit-details[data-visible="true"]'),
  ).toBeVisible();
  const original = await canvas.elementHandle();
  const before = JSON.parse(
    (await canvas.getAttribute("data-camera-position"))!,
  ) as Vec3;
  const yaw = async () => {
    const position = JSON.parse(
      (await canvas.getAttribute("data-camera-position"))!,
    ) as Vec3;
    const target = JSON.parse(
      (await canvas.getAttribute("data-camera-target"))!,
    ) as Vec3;
    return Math.atan2(target[0] - position[0], target[2] - position[2]);
  };
  const beforeYaw = await yaw();
  await page.mouse.move(470, 300);
  await page.mouse.down();
  await page.mouse.move(750, 325, { steps: 16 });
  await expect(canvas).toHaveAttribute("data-look-state", "dragging");
  const draggedYaw = await yaw();
  expect(
    Math.abs(
      Math.atan2(
        Math.sin(draggedYaw - beforeYaw),
        Math.cos(draggedYaw - beforeYaw),
      ),
    ),
  ).toBeGreaterThan(0.35);
  await expect(page.locator(".visit-details")).toBeHidden();
  await page.mouse.up();
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  const releasedYaw = await yaw();
  expect(
    Math.abs(
      Math.atan2(
        Math.sin(releasedYaw - draggedYaw),
        Math.cos(releasedYaw - draggedYaw),
      ),
    ),
  ).toBeLessThan(0.1);
  const released = JSON.parse(
    (await canvas.getAttribute("data-camera-position"))!,
  ) as Vec3;
  expect(
    Math.hypot(...released.map((value, index) => value - before[index])),
  ).toBeLessThan(0.08);
  const samples = await page.evaluate(
    () =>
      new Promise<number[][]>((resolve) => {
        const samples: number[][] = [];
        const end = performance.now() + 6000;
        const record = () => {
          const canvas = document.querySelector("canvas")!;
          samples.push(JSON.parse(canvas.dataset.cameraPosition!));
          if (performance.now() < end) requestAnimationFrame(record);
          else resolve(samples);
        };
        record();
      }),
  );
  const obstacles = navigationObstaclesForRooms(data.rooms);
  for (let index = 1; index < samples.length; index++) {
    expect(
      segmentIsClear(
        samples[index - 1] as Vec3,
        samples[index] as Vec3,
        obstacles,
      ),
    ).toBe(true);
  }
  expect(
    Math.hypot(
      ...samples.at(-1)!.map((value, index) => value - samples[0][index]),
    ),
  ).toBeGreaterThan(0.1);
  expect(
    await original!.evaluate(
      (node) => node === document.querySelector("canvas"),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "artifacts/experience-qa/mouse-continued-1440.png",
  });
  // Steering during the walk must start a fresh request even in the same room.
  const requestId = await canvas.getAttribute("data-navigation-id");
  const secondPosition = JSON.parse(
    (await canvas.getAttribute("data-camera-position"))!,
  ) as Vec3;
  await page.mouse.move(550, 300);
  await page.mouse.down();
  await page.mouse.move(390, 300, { steps: 12 });
  await expect(canvas).toHaveAttribute("data-look-state", "dragging");
  await page.mouse.up();
  await expect(canvas).not.toHaveAttribute("data-navigation-id", requestId!);
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  const secondRelease = JSON.parse(
    (await canvas.getAttribute("data-camera-position"))!,
  ) as Vec3;
  expect(
    Math.hypot(
      ...secondRelease.map((value, index) => value - secondPosition[index]),
    ),
  ).toBeLessThan(0.08);
  await page
    .getByRole("button", { name: "Œuvre suivante", exact: true })
    .click();
  await expect(
    page.locator('.visit-details[data-visible="true"]'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
