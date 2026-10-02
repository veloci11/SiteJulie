import { expect, test, type Locator, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import type { Artwork, PublicData } from "../../lib/data/types";
import { slotForArtwork, type Vec3 } from "../../lib/museum/config";
import {
  navigationObstaclesForRooms,
  segmentIsClear,
} from "../../lib/museum/navigation";

type Pose = {
  position: Vec3;
  target: Vec3;
  yaw: number;
  fov: number;
  offset: [number, number];
  time: number;
};
const angle = (a: number, b: number) =>
  Math.atan2(Math.sin(b - a), Math.cos(b - a));
const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(...a.map((value, index) => value - b[index]));

async function readPose(canvas: Locator): Promise<Pose> {
  return canvas.evaluate((node) => {
    const position = JSON.parse(node.dataset.cameraPosition!) as Vec3;
    const target = JSON.parse(node.dataset.cameraTarget!) as Vec3;
    return {
      position,
      target,
      yaw: Math.atan2(target[0] - position[0], target[2] - position[2]),
      fov: Number(node.dataset.cameraFov),
      offset: JSON.parse(node.dataset.cameraOffset!),
      time: Number(node.dataset.cameraSampleTime),
    };
  });
}

async function recordFrames(page: Page, milliseconds: number): Promise<Pose[]> {
  return page.evaluate(
    (duration) =>
      new Promise<Pose[]>((resolve) => {
        const samples: Pose[] = [];
        const end = performance.now() + duration;
        const record = () => {
          const canvas = document.querySelector("canvas")!;
          const position = JSON.parse(canvas.dataset.cameraPosition!) as Vec3;
          const target = JSON.parse(canvas.dataset.cameraTarget!) as Vec3;
          const time = Number(canvas.dataset.cameraSampleTime);
          if (time !== samples.at(-1)?.time)
            samples.push({
              position,
              target,
              yaw: Math.atan2(target[0] - position[0], target[2] - position[2]),
              fov: Number(canvas.dataset.cameraFov),
              offset: JSON.parse(canvas.dataset.cameraOffset!),
              time,
            });
          if (performance.now() < end) requestAnimationFrame(record);
          else resolve(samples);
        };
        record();
      }),
    milliseconds,
  );
}

function assertSafeFrames(samples: Pose[], data: PublicData) {
  expect(samples.length).toBeGreaterThan(0);
  const obstacles = navigationObstaclesForRooms(data.rooms);
  for (let index = 1; index < samples.length; index++) {
    const before = samples[index - 1],
      after = samples[index];
    const seconds = Math.max(0, (after.time - before.time) / 1000);
    expect(segmentIsClear(before.position, after.position, obstacles)).toBe(
      true,
    );
    expect(distance(before.position, after.position)).toBeLessThanOrEqual(
      0.03 + seconds * 1.5,
    );
    expect(Math.abs(angle(before.yaw, after.yaw))).toBeLessThanOrEqual(
      0.035 + seconds * 2,
    );
    expect(after.fov).toBeGreaterThan(40);
    expect(after.fov).toBeLessThanOrEqual(78.1);
  }
}

async function focus(page: Page, artwork: Artwork) {
  await page.goto(`/?vue=oeuvre&slug=${encodeURIComponent(artwork.slug)}`);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
    timeout: 60000,
  });
  await expect(
    page.locator('.visit-details[data-visible="true"]'),
  ).toBeVisible();
  return canvas;
}

// Project the actual painted mesh centre, so this click cannot silently hit
// a background wall or a DOM overlay after a framing/layout adjustment.
async function paintedCentre(canvas: Locator, artwork: Artwork) {
  const pose = await readPose(canvas);
  const box = (await canvas.boundingBox())!;
  const camera = new PerspectiveCamera(
    pose.fov,
    box.width / box.height,
    0.1,
    260,
  );
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.setViewOffset(
    box.width,
    box.height,
    pose.offset[0],
    pose.offset[1],
    box.width,
    box.height,
  );
  camera.updateMatrixWorld();
  const slot = slotForArtwork(artwork)!;
  const point = new Vector3(...slot.position)
    .add(new Vector3(...slot.wallNormal).multiplyScalar(0.132))
    .project(camera);
  return {
    x: box.x + ((point.x + 1) * box.width) / 2,
    y: box.y + ((1 - point.y) * box.height) / 2,
  };
}

async function dragAndHold(
  page: Page,
  canvas: Locator,
  dx: number,
  dy = 0,
  origin = { x: 750, y: 300 },
) {
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(origin.x + dx, origin.y + dy, { steps: 18 });
  await expect(canvas).toHaveAttribute("data-look-state", "dragging");
  const held = await readPose(canvas);
  const frames = await recordFrames(page, 350);
  for (const frame of frames) {
    expect(distance(held.position, frame.position)).toBeLessThan(0.001);
    expect(Math.abs(angle(held.yaw, frame.yaw))).toBeLessThan(0.001);
  }
  return held;
}

async function assertReleaseContinuity(
  page: Page,
  canvas: Locator,
  held: Pose,
) {
  await page.mouse.up();
  // Read immediately: waiting for the eventual idle state would consume the
  // release pause and hide a first-frame snap.
  await expect(canvas).not.toHaveAttribute("data-look-state", "dragging");
  const release = await readPose(canvas);
  expect(distance(held.position, release.position)).toBeLessThan(0.025);
  expect(Math.abs(angle(held.yaw, release.yaw))).toBeLessThan(0.025);
  // A deliberate short pause gives time to perceive the chosen direction.
  const immediate = await recordFrames(page, 350);
  for (const frame of immediate) {
    expect(distance(held.position, frame.position)).toBeLessThan(0.025);
    expect(Math.abs(angle(held.yaw, frame.yaw))).toBeLessThan(0.025);
  }
  return release;
}

test("held gaze shows the visible painting and walking resumes promptly on release", async ({
  page,
}) => {
  const response = await page.goto("/api/museum/data");
  const data: PublicData = await response!.json();
  const artwork = data.artworks[0];
  const slot = slotForArtwork(artwork)!;
  const neighbour = data.artworks.find((candidate) => {
    const next = slotForArtwork(candidate);
    return (
      next &&
      candidate.roomId === artwork.roomId &&
      candidate.id !== artwork.id &&
      next.rotationY === slot.rotationY &&
      distance(next.position, slot.position) > 2
    );
  })!;
  expect(neighbour).toBeTruthy();
  const canvas = await focus(page, artwork);
  const original = await readPose(canvas);
  const preview = page.locator(".visit-auto-preview");
  await page.mouse.move(700, 300);
  await page.mouse.down();
  await page.mouse.move(712, 300, { steps: 3 });
  await expect(canvas).toHaveAttribute("data-look-state", "dragging");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("data-artwork-id", artwork.id);
  await expect(preview.locator("strong")).toHaveText(artwork.title);
  await expect(page.locator(".visit-details")).toBeHidden();

  // Aim the same free-screen point at a different, real painting on this wall.
  const nextSlot = slotForArtwork(neighbour)!;
  const bearing = (position: Vec3) =>
    Math.atan2(
      position[0] - original.position[0],
      position[2] - original.position[2],
    );
  const sensitivity = Math.max(0.002, Math.min(0.0033, (Math.PI * 1.3) / 1440));
  const dx =
    angle(bearing(slot.position), bearing(nextSlot.position)) / sensitivity;
  await page.mouse.move(700 + dx, 300, { steps: 18 });
  await expect(preview).toHaveAttribute("data-artwork-id", neighbour.id);
  await expect(preview.locator("strong")).toHaveText(neighbour.title);
  const held = await readPose(canvas);
  for (const sample of await recordFrames(page, 400)) {
    expect(distance(held.position, sample.position)).toBeLessThan(0.001);
    expect(sample.offset).toEqual(held.offset);
  }
  await page.screenshot({
    path: "artifacts/experience-qa/held-gaze-information.png",
  });

  await page.mouse.up();
  const release = await readPose(canvas);
  expect(distance(held.position, release.position)).toBeLessThan(0.025);
  expect(Math.abs(angle(held.yaw, release.yaw))).toBeLessThan(0.025);
  const frames = await recordFrames(page, 1300);
  assertSafeFrames(frames, data);
  const moving = frames.find(
    (frame) => distance(held.position, frame.position) > 0.004,
  );
  expect(moving).toBeTruthy();
  expect(moving!.time - release.time).toBeLessThan(900);
  console.log(
    `First movement after release: ${Math.round(moving!.time - release.time)} ms`,
  );
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
});

test("painting click remains a click, while a real drag stops and resumes the same camera", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const data: PublicData = await (await request.get("/api/museum/data")).json();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const artwork = data.artworks[0];
  const canvas = await focus(page, artwork);
  const original = await canvas.elementHandle();
  const centre = await paintedCentre(canvas, artwork);
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      centre,
    ),
  ).toBe("CANVAS");
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 3, centre.y + 1);
  await page.mouse.up();
  await expect(page).toHaveURL(
    new RegExp(`slug=${encodeURIComponent(artwork.slug)}`),
  );
  await expect(page.locator(".visit-details h2")).toHaveText(artwork.title);
  await expect(canvas).not.toHaveAttribute("data-look-state", "dragging");
  const before = await readPose(canvas);
  const held = await dragAndHold(page, canvas, 300, 30, centre);
  expect(Math.abs(angle(before.yaw, held.yaw))).toBeGreaterThan(0.45);
  await assertReleaseContinuity(page, canvas, held);
  await expect(page).not.toHaveURL(/vue=oeuvre/);
  await expect(page.locator(".visit-details")).toBeHidden();
  const frames = await recordFrames(page, 5000);
  expect(frames.length).toBeGreaterThan(5);
  assertSafeFrames(frames, data);
  expect(distance(frames[0].position, frames.at(-1)!.position)).toBeGreaterThan(
    0.1,
  );
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  const overviewUrl = page.url();
  await canvas.click({ position: { x: 12, y: 120 } });
  await expect(page).toHaveURL(overviewUrl);
  expect(
    await original!.evaluate(
      (node) => node === document.querySelector("canvas"),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "artifacts/experience-qa/manual-look-release.png",
  });
});

test("opposite drags near walls keep clear departures and preserve later selection/history", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const data: PublicData = await (await request.get("/api/museum/data")).json();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const wallArtwork = data.artworks.find((artwork) => {
    const slot = slotForArtwork(artwork);
    return (
      artwork.roomId === data.rooms[0] &&
      slot &&
      Math.abs(slot.wallNormal[2]) > 0.9
    );
  })!;
  const canvas = await focus(page, wallArtwork);
  const original = await canvas.elementHandle();
  const obstacles = navigationObstaclesForRooms(data.rooms);
  for (const dx of [400, -400, 620, -620]) {
    const held = await dragAndHold(page, canvas, dx);
    const release = await assertReleaseContinuity(page, canvas, held);
    const frames = await recordFrames(page, 5500);
    assertSafeFrames([release, ...frames], data);
    const state = await canvas.getAttribute("data-tour-state");
    if (state === "blocked") {
      // No safe complete route is preferable to an invented jump through a wall.
      for (const frame of frames)
        expect(distance(held.position, frame.position)).toBeLessThan(0.001);
    } else expect(frames.length).toBeGreaterThan(5);
    const forward: Vec3 = [Math.sin(held.yaw), 0, Math.cos(held.yaw)];
    const ahead = held.position.map(
      (value, index) => value + forward[index],
    ) as Vec3;
    if (
      state !== "blocked" &&
      segmentIsClear(held.position, ahead, obstacles)
    ) {
      const displacement = frames
        .at(-1)!
        .position.map((value, index) => value - held.position[index]);
      // A clear chosen heading cannot send the visitor into the opposite aisle.
      const projected = displacement.reduce(
        (sum, value, index) => sum + value * forward[index],
        0,
      );
      expect(projected).toBeGreaterThan(0.03);
    }
    await expect(page).not.toHaveURL(/vue=oeuvre/);
  }
  // DOM actions during/after steering must win over old route plans.
  await page.locator(".visit-film-card").first().click();
  const firstSlug = new URL(page.url()).searchParams.get("slug")!;
  await expect(page.locator('.visit-details[data-visible="true"]')).toBeVisible(
    { timeout: 60000 },
  );
  await page
    .getByRole("button", { name: "Œuvre suivante", exact: true })
    .evaluate((node) => {
      (node as HTMLButtonElement).click();
      (node as HTMLButtonElement).click();
      (node as HTMLButtonElement).click();
    });
  const finalSlug = new URL(page.url()).searchParams.get("slug")!;
  const final = data.artworks.find((artwork) => artwork.slug === finalSlug)!;
  await expect(page.locator(".visit-details h2")).toHaveText(final.title, {
    timeout: 60000,
  });
  expect(finalSlug).not.toBe(firstSlug);
  await page
    .getByRole("button", { name: "Œuvre précédente", exact: true })
    .click();
  const previousSlug = new URL(page.url()).searchParams.get("slug")!;
  expect(previousSlug).not.toBe(finalSlug);
  await expect(page.locator(".visit-details h2")).toHaveText(
    data.artworks.find((artwork) => artwork.slug === previousSlug)!.title,
    { timeout: 60000 },
  );
  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`slug=${encodeURIComponent(finalSlug)}`),
  );
  await expect(page.locator(".visit-details h2")).toHaveText(final.title, {
    timeout: 60000,
  });
  expect(
    await original!.evaluate(
      (node) => node === document.querySelector("canvas"),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "artifacts/experience-qa/manual-reversal-selection.png",
  });
});
