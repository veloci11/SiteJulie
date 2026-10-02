import { openArtworkDrawer } from "./navigation-helpers";
import { test, expect, type Page, type Locator } from "@playwright/test";

type Pose = {
  position: number[];
  target: number[];
  fov: number;
  offset: number[];
};
const separation = (a: number[], b: number[]) =>
  Math.hypot(...a.map((value, axis) => value - b[axis]));

async function pose(canvas: Locator): Promise<Pose> {
  return canvas.evaluate((node) => ({
    position: JSON.parse(node.dataset.cameraPosition!),
    target: JSON.parse(node.dataset.cameraTarget!),
    fov: Number(node.dataset.cameraFov),
    offset: JSON.parse(node.dataset.cameraOffset!),
  }));
}

async function openOverview(page: Page) {
  await page.goto("/");
  await expect(page.locator(".visit-hero")).toBeVisible({ timeout: 60000 });
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveCount(1, { timeout: 60000 });
  await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
    timeout: 60000,
  });
  return canvas;
}

async function captureNextPositions(canvas: Locator) {
  await canvas.evaluate((node) => {
    const state = window as unknown as {
      tourPositions: number[][];
      tourPositionObserver?: MutationObserver;
    };
    state.tourPositionObserver?.disconnect();
    state.tourPositions = [];
    state.tourPositionObserver = new MutationObserver(() => {
      if (state.tourPositions.length < 30)
        state.tourPositions.push(JSON.parse(node.dataset.cameraPosition!));
    });
    state.tourPositionObserver.observe(node, {
      attributes: true,
      attributeFilter: ["data-camera-position"],
    });
  });
}

async function firstNewPosition(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { tourPositions: number[][] }).tourPositions
            .length,
      ),
    )
    .toBeGreaterThan(0);
  return page.evaluate(
    () => (window as unknown as { tourPositions: number[][] }).tourPositions[0],
  );
}

test("continuous home promenade crosses its loop seam without stops, URL changes or panels", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const canvas = await openOverview(page);
  const original = await canvas.elementHandle();
  const navigationId = await canvas.getAttribute("data-navigation-id");
  const initialUrl = page.url();
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  // Observe actual rendered poses for an entire cycle. The metadata artwork is
  // incidental: no fixed-work target, artificial hold or timer mocking remains.
  await canvas.evaluate((node) => {
    const state = window as unknown as {
      walkLog: {
        samples: {
          elapsed: number;
          position: number[];
          speed: number;
          yawRate: number;
          cycle: number;
        }[];
        violations: string[];
      };
    };
    state.walkLog = { samples: [], violations: [] };
    const url = location.href,
      id = node.dataset.navigationId;
    const record = () => {
      const log = state.walkLog;
      const elapsed = Number(node.dataset.tourElapsed);
      if (elapsed === log.samples.at(-1)?.elapsed) return;
      log.samples.push({
        elapsed,
        position: JSON.parse(node.dataset.cameraPosition!),
        speed: Number(node.dataset.tourSpeed),
        yawRate: Number(node.dataset.tourYawSpeed),
        cycle: Number(node.dataset.tourCycle),
      });
      if (location.href !== url) log.violations.push("URL changed");
      if (node.dataset.navigationId !== id)
        log.violations.push("Manual request changed");
      if (node.dataset.cameraRoom !== "room-1")
        log.violations.push("Left current room");
      if (node.dataset.tourState !== "walking")
        log.violations.push("Unexpected stop");
      if (document.querySelector(".visit-details, .visit-editorial[open]"))
        log.violations.push("Unsolicited panel");
    };
    new MutationObserver(record).observe(node, {
      attributes: true,
      attributeFilter: ["data-tour-elapsed"],
    });
    record();
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-tour-cycle")), {
      timeout: 130000,
    })
    .toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(500);
  const log = await page.evaluate(
    () =>
      (
        window as unknown as {
          walkLog: {
            samples: {
              elapsed: number;
              position: number[];
              speed: number;
              yawRate: number;
              cycle: number;
            }[];
            violations: string[];
          };
        }
      ).walkLog,
  );
  const cruising = log.samples.filter((sample) => sample.elapsed > 5);
  expect(cruising.length).toBeGreaterThan(50);
  // A visitor slows in bends, but never halts at an artwork or swaps targets.
  expect(Math.min(...cruising.map((s) => s.speed))).toBeGreaterThan(0.07);
  expect(Math.max(...cruising.map((s) => s.speed))).toBeLessThanOrEqual(
    0.35001,
  );
  expect(
    Math.max(...cruising.map((s) => Math.abs(s.yawRate))),
  ).toBeLessThanOrEqual(20.01);
  expect(cruising.every((s) => s.position[1] === 2.05)).toBe(true);
  const seamIndex = cruising.findIndex(
    (s, i) => i > 0 && s.cycle > cruising[i - 1].cycle,
  );
  expect(seamIndex).toBeGreaterThan(0);
  const before = cruising[seamIndex - 1],
    after = cruising[seamIndex];
  const measuredSpeed =
    separation(before.position, after.position) /
    (after.elapsed - before.elapsed);
  expect(measuredSpeed).toBeGreaterThan(0.07);
  expect(measuredSpeed).toBeLessThan(0.4);
  expect(log.violations).toEqual([]);
  await expect(page).toHaveURL(initialUrl);
  await expect(canvas).toHaveAttribute("data-navigation-id", navigationId!);
  await expect(
    page.locator(".visit-details, .visit-editorial[open]"),
  ).toHaveCount(0);
  expect(
    await original!.evaluate(
      (node) => node === document.querySelector("canvas"),
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/captures/tour-home-desktop.png" });
  expect(errors).toEqual([]);
});

test("mobile home promenade pauses in its drawer, survives resize and yields to manual selection", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const canvas = await openOverview(page);
  const original = await canvas.elementHandle();
  const home = await pose(canvas);
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  await expect
    .poll(async () => separation((await pose(canvas)).position, home.position))
    .toBeGreaterThan(0.3);

  await openArtworkDrawer(page);
  const drawer = page.getByRole("dialog", { name: "Les œuvres", exact: true });
  await expect(drawer).toBeVisible();
  await expect(canvas).toHaveAttribute("data-tour-state", "paused");
  let paused = await pose(canvas);
  expect(separation(paused.position, home.position)).toBeGreaterThan(0.2);
  // A real observation interval is needed to prove that a paused camera stays
  // still; instantaneous consecutive reads would also pass while it is moving.
  await page.waitForTimeout(700);
  expect(await pose(canvas)).toEqual(paused);
  await expect(page).toHaveURL("/");

  // Rotation is an explicit resize, not a request to restart the tour. The
  // lens must adopt the landscape view without changing the walking phase.
  const pausedArtwork = await canvas.getAttribute("data-tour-artwork");
  await page.setViewportSize({ width: 667, height: 375 });
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBe(667);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-camera-fov")))
    .toBeCloseTo(
      (2 * Math.atan((Math.tan(Math.PI / 6) * 1.6) / (667 / 375)) * 180) /
        Math.PI,
      3,
    );
  expect((await pose(canvas)).position).toEqual(paused.position);

  await expect(canvas).toHaveAttribute("data-tour-state", "paused");
  await expect(canvas).toHaveAttribute("data-tour-artwork", pausedArtwork!);
  paused = await pose(canvas);
  await page.waitForTimeout(700);
  expect(await pose(canvas)).toEqual(paused);
  await expect(page).toHaveURL("/");
  await expect(
    page.locator(".visit-details, .visit-editorial[open]"),
  ).toHaveCount(0);

  await captureNextPositions(canvas);
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  expect(
    separation(await firstNewPosition(page), paused.position),
  ).toBeLessThan(0.12);
  await expect
    .poll(async () =>
      separation((await pose(canvas)).position, paused.position),
    )
    .toBeGreaterThan(0.03);

  await openArtworkDrawer(page);
  await expect(drawer).toBeVisible();
  await expect(canvas).toHaveAttribute("data-tour-state", "paused");
  const inDrawer = await pose(canvas);
  await page.waitForTimeout(500);
  expect(await pose(canvas)).toEqual(inDrawer);
  await captureNextPositions(canvas);
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  expect(
    separation(await firstNewPosition(page), inDrawer.position),
  ).toBeLessThan(0.12);

  await openArtworkDrawer(page);
  await expect(drawer).toBeVisible();
  await expect(canvas).toHaveAttribute("data-tour-state", "paused");
  const beforeManual = await pose(canvas);
  await captureNextPositions(canvas);
  await drawer
    .getByRole("button", { name: "Toutes les œuvres", exact: true })
    .click();
  await drawer
    .getByRole("button", { name: "Choisir Œuvre 01", exact: true })
    .click();
  await expect(drawer).not.toBeVisible();
  await expect(page).toHaveURL(/vue=oeuvre&slug=oeuvre-01/);
  await expect(canvas).toHaveAttribute("data-tour-state", "off");
  expect(
    separation(await firstNewPosition(page), beforeManual.position),
  ).toBeLessThan(0.12);
  await expect(
    page.getByRole("complementary", { name: "Fiche de Œuvre 01" }),
  ).toBeVisible({ timeout: 45000 });
  await expect(canvas).toHaveAttribute("data-tour-artwork", "");
  await expect(canvas).toHaveAttribute("data-camera-room", "room-2");
  const focused = await pose(canvas);
  const focusedNavigation = await canvas.getAttribute("data-navigation-id");
  // A real pointer click beside the image must not close it or restart a tour.
  await canvas.click({ position: { x: 12, y: 120 } });
  await expect(
    page.getByRole("complementary", { name: "Fiche de Œuvre 01" }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute(
    "data-navigation-id",
    focusedNavigation!,
  );
  await expect(page).toHaveURL(/slug=oeuvre-01/);
  // Longer than the start delay: an abandoned walk cannot wake behind a fiche.
  await page.waitForTimeout(4200);
  expect(await pose(canvas)).toEqual(focused);
  await expect(canvas).toHaveAttribute("data-tour-state", "off");
  await expect(page).toHaveURL(/slug=oeuvre-01/);
  await expect(canvas).toHaveCount(1);
  expect(
    await original!.evaluate(
      (node) => node === document.querySelector("canvas"),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("reduced motion keeps the home view still beyond the autoplay delay", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const canvas = await openOverview(page);
  const initial = await pose(canvas);
  await expect(canvas).toHaveAttribute("data-tour-state", "off");
  await expect(page.locator(".visit-tour-toggle")).toHaveCount(0);
  await page.waitForTimeout(4200);
  expect(await pose(canvas)).toEqual(initial);
  await expect(canvas).toHaveAttribute("data-tour-state", "off");
  expect(await canvas.getAttribute("data-tour-artwork")).toBeFalsy();
  await expect(
    page.locator(".visit-details, .visit-editorial[open]"),
  ).toHaveCount(0);
  await expect(page.locator(".visit-hero")).toBeVisible();
  await expect(page).toHaveURL("/");
  await openEditorial(page, "À propos");
  const modal = page.getByRole("dialog", {
    name: "À propos de l’artiste",
    exact: true,
  });
  await expect(modal).toBeVisible();
  await page.waitForTimeout(4200);
  expect(await pose(canvas)).toEqual(initial);
  await expect(canvas).toHaveAttribute("data-tour-state", "off");
  await modal.getByRole("button", { name: "Revenir à la galerie" }).click();
  await expect(modal).not.toBeVisible();
  await expect(canvas).toHaveAttribute("data-tour-state", "off");
});

test("room selection walks through the doorway and merges continuously with its promenade", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const canvas = await openOverview(page),
    original = await canvas.elementHandle();
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  for (const [roomId, name] of [
    ["room-2", "Récits & paysages"],
    ["room-1", "Visages"],
  ] as const) {
    await page.locator(".visit-room-switch").click();
    const drawer = page.getByRole("dialog", { name: "Les collections" });
    await expect(drawer).toBeVisible();
    await canvas.evaluate((node) => {
      const log: { position: number[]; time: number; state: string }[] = [];
      (window as unknown as { roomTransferLog: typeof log }).roomTransferLog =
        log;
      new MutationObserver(() => {
        log.push({
          position: JSON.parse(node.getAttribute("data-camera-position")!),
          time: Number(node.getAttribute("data-camera-sample-time")),
          state: node.getAttribute("data-tour-state")!,
        });
      }).observe(node, {
        attributes: true,
        attributeFilter: ["data-camera-position", "data-tour-state"],
      });
      log.push({
        position: JSON.parse(node.getAttribute("data-camera-position")!),
        time: Number(node.getAttribute("data-camera-sample-time")),
        state: "paused",
      });
    });
    const started = Date.now();
    await drawer.getByRole("button", { name: new RegExp(name) }).click();
    await expect(drawer).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`vue=salle&salle=${roomId}`));
    await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
      timeout: 18000,
    });
    expect(Date.now() - started).toBeLessThan(17000);
    await expect(canvas).toHaveAttribute("data-transition-kind", "continuous");
    await expect(canvas).toHaveAttribute("data-camera-room", roomId);
    await expect(page.locator(".visit-room-transition")).toHaveCount(0);
    await expect(canvas).toHaveCSS("opacity", "1");
    await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
      timeout: 8000,
    });
    const walking = await pose(canvas);
    await expect
      .poll(async () =>
        separation((await pose(canvas)).position, walking.position),
      )
      .toBeGreaterThan(0.1);
    const log = await page.evaluate(
      () =>
        (
          window as unknown as {
            roomTransferLog: {
              position: number[];
              time: number;
              state: string;
            }[];
          }
        ).roomTransferLog,
    );
    let crossings = 0;
    for (let i = 1; i < log.length; i++) {
      const previous = log[i - 1],
        current = log[i];
      const dt = Math.max(0, (current.time - previous.time) / 1000);
      expect(
        separation(previous.position, current.position),
      ).toBeLessThanOrEqual(3.25 * dt + 0.003);
      if ((previous.position[2] - 9) * (current.position[2] - 9) < 0) {
        crossings++;
        const t =
          (9 - previous.position[2]) /
          (current.position[2] - previous.position[2]);
        const x =
          previous.position[0] +
          t * (current.position[0] - previous.position[0]);
        expect(Math.abs(x)).toBeLessThan(1.28);
      }
    }
    expect(crossings).toBe(1);
    expect(log.some((sample) => sample.state === "joining")).toBe(false);
    await expect(page.locator(".visit-shell")).toHaveAttribute(
      "data-scene-destination",
      "room",
    );
    await expect(canvas).toHaveAttribute("data-camera-room", roomId);
  }
  expect(
    await original!.evaluate(
      (node) => node === document.querySelector("canvas"),
    ),
  ).toBe(true);
});

async function openEditorial(page: Page, label: "À propos" | "Contact") {
  if (page.viewportSize()!.width <= 700) {
    await page
      .getByRole("button", { name: "Ouvrir le menu", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Bienvenue", exact: true })
      .getByRole("button", { name: label, exact: true })
      .click();
  } else {
    await page.getByRole("link", { name: label, exact: true }).click();
  }
}

async function startContinuityCheck(canvas: Locator) {
  await canvas.evaluate((node) => {
    const state = window as unknown as {
      continuity: { position: number[]; time: number }[];
      continuityObserver?: MutationObserver;
    };
    state.continuityObserver?.disconnect();
    const record = () =>
      state.continuity.push({
        position: JSON.parse(node.dataset.cameraPosition!),
        time: Number(node.dataset.cameraSampleTime) / 1000,
      });
    state.continuity = [];
    record();
    state.continuityObserver = new MutationObserver(record);
    state.continuityObserver.observe(node, {
      attributes: true,
      attributeFilter: ["data-camera-position"],
    });
  });
}
async function expectContinuousWalk(page: Page) {
  const frames = await page.evaluate(
    () =>
      (
        window as unknown as {
          continuity: { position: number[]; time: number }[];
        }
      ).continuity,
  );
  expect(frames.length).toBeGreaterThan(1);
  for (let i = 1; i < frames.length; i++)
    expect(
      separation(frames[i].position, frames[i - 1].position),
    ).toBeLessThanOrEqual(
      0.36 * Math.max(0, frames[i].time - frames[i - 1].time) + 0.002,
    );
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`editorial windows ${viewport.width}px keep the promenade continuous after every close`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?vue=salle&salle=room-2");
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
      timeout: 60000,
    });
    await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
      timeout: 15000,
    });
    // The room poster first turns toward the path before walking accelerates.
    // Exercise editorial continuity after translation has actually started.
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-tour-speed")), {
        timeout: 15000,
      })
      .toBeGreaterThan(0.08);
    const original = await canvas.elementHandle();
    for (const [label, name, url] of [
      ["À propos", "À propos de l’artiste", /vue=apropos/],
      ["Contact", "Contacter l’artiste", /vue=contact/],
    ] as const) {
      await startContinuityCheck(canvas);
      await openEditorial(page, label);
      const modal = page.getByRole("dialog", { name, exact: true });
      await expect(modal).toBeVisible();
      expect(
        await modal.evaluate(
          (node) => (node as HTMLDialogElement).open && !node.matches(":modal"),
        ),
      ).toBe(true);
      await expect(page).toHaveURL(url);
      await expect(page.locator(".visit-shell")).toHaveAttribute(
        "data-scene-destination",
        "room",
      );
      await expectContinuousWalk(page);
      const bounds = await modal.boundingBox();
      expect(bounds).not.toBeNull();
      expect(
        Math.abs(bounds!.x + bounds!.width / 2 - viewport.width / 2),
      ).toBeLessThan(8);
      const header = (await page.locator(".visit-header").boundingBox())!;
      expect(bounds!.y).toBeGreaterThan(header.y + header.height);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
        viewport.height + 1,
      );
      if (label === "À propos") {
        // Closing and reopening must retain the running timeline, including
        // when the room was reached from a direct URL.
        await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
          timeout: 15000,
        });
        await modal
          .getByRole("button", { name: "Revenir à la galerie", exact: true })
          .click();
        await expect(modal).not.toBeVisible();
        await expect(canvas).toHaveAttribute("data-tour-state", "walking");
        const continuing = await pose(canvas);
        await expect
          .poll(
            async () =>
              separation((await pose(canvas)).position, continuing.position),
            { timeout: 5000 },
          )
          .toBeGreaterThan(0.25);
        await openEditorial(page, label);
        await expect(modal).toBeVisible();
      }
      await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
        timeout: 60000,
      });
      const walking = await pose(canvas);
      await expect
        .poll(async () =>
          separation((await pose(canvas)).position, walking.position),
        )
        .toBeGreaterThan(0.1);
      await expect(canvas).toHaveAttribute("data-camera-room", "room-2");
      await expect(modal).toBeVisible();
      const request = await canvas.getAttribute("data-navigation-id");
      const phase = Number(await canvas.getAttribute("data-tour-elapsed"));
      if (label === "À propos") await page.keyboard.press("Escape");
      else await page.mouse.click(3, 3);
      await expect(modal).not.toBeVisible();
      await expect(page).toHaveURL(/vue=salle&salle=room-2/);
      await expect(canvas).toHaveAttribute("data-tour-state", "walking");
      await expect(canvas).toHaveAttribute("data-navigation-id", request!);
      await expectContinuousWalk(page);
      const continued = await pose(canvas);
      await expect
        .poll(
          async () =>
            separation((await pose(canvas)).position, continued.position),
          { timeout: 5000 },
        )
        .toBeGreaterThan(0.25);
      expect(
        Number(await canvas.getAttribute("data-tour-elapsed")),
      ).toBeGreaterThan(phase);
      await expect(canvas).toHaveAttribute("data-camera-room", "room-2");
    }
    expect(
      await original!.evaluate(
        (node) => node === document.querySelector("canvas"),
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("closing About from home continues the live promenade without a new camera request", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const canvas = await openOverview(page);
  const original = await canvas.elementHandle();
  const initial = await pose(canvas);
  const navigationId = await canvas.getAttribute("data-navigation-id");
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  await expect
    .poll(async () =>
      separation((await pose(canvas)).position, initial.position),
    )
    .toBeGreaterThan(0.15);

  await openEditorial(page, "À propos");
  const modal = page.getByRole("dialog", {
    name: "À propos de l’artiste",
    exact: true,
  });
  await expect(modal).toBeVisible();
  await expect(page).toHaveURL(/vue=apropos/);
  await expect(page.locator(".visit-shell")).toHaveAttribute(
    "data-scene-destination",
    "home",
  );
  await expect(canvas).toHaveAttribute("data-navigation-id", navigationId!);
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  const behindModal = await pose(canvas);
  await expect
    .poll(async () =>
      separation((await pose(canvas)).position, behindModal.position),
    )
    .toBeGreaterThan(0.1);

  await modal
    .getByRole("button", { name: "Revenir à la galerie", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  await expect(page).toHaveURL(/vue=salle&salle=room-1/);
  await expect(page.locator(".visit-shell")).toHaveAttribute(
    "data-scene-destination",
    "home",
  );
  await expect(canvas).toHaveAttribute("data-navigation-id", navigationId!);
  await expect(canvas).toHaveAttribute("data-navigation-state", "arrived");
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  const continued = await pose(canvas);
  await expect
    .poll(
      async () => separation((await pose(canvas)).position, continued.position),
      { timeout: 5000 },
    )
    .toBeGreaterThan(0.25);
  await expect(canvas).toHaveAttribute("data-navigation-id", navigationId!);
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  expect(
    await original!.evaluate(
      (node) => node === document.querySelector("canvas"),
    ),
  ).toBe(true);
});

test("closing an editorial window during its departure from a work does not cancel the promenade", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?vue=oeuvre&slug=oeuvre-08");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
    timeout: 60000,
  });
  await expect(page.locator(".visit-details")).toBeVisible();
  await openEditorial(page, "À propos");
  const modal = page.getByRole("dialog", {
    name: "À propos de l’artiste",
    exact: true,
  });
  await expect(modal).toBeVisible();
  const request = await canvas.getAttribute("data-navigation-id");
  // Close immediately, while the camera may still be joining the walk.
  await modal
    .getByRole("button", { name: "Revenir à la galerie", exact: true })
    .click();
  await expect(modal).not.toBeVisible();
  await expect(canvas).toHaveAttribute("data-navigation-id", request!);
  await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
    timeout: 20000,
  });
  const moving = await pose(canvas);
  await expect
    .poll(
      async () => separation((await pose(canvas)).position, moving.position),
      { timeout: 12000 },
    )
    .toBeGreaterThan(0.25);

  await openEditorial(page, "Contact");
  await expect(
    page.getByRole("dialog", { name: "Contacter l’artiste", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.locator(".visit-editorial[open]")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  await expect(canvas).toHaveAttribute("data-navigation-id", request!);
  const afterBack = await pose(canvas);
  await expect
    .poll(
      async () => separation((await pose(canvas)).position, afterBack.position),
      { timeout: 5000 },
    )
    .toBeGreaterThan(0.25);
  // A subsequent explicit work selection must still take over the camera.
  await page.locator(".visit-film-card").first().click();
  await expect(page).toHaveURL(/vue=oeuvre/);
  await expect(canvas).toHaveAttribute("data-tour-state", "off");
});
