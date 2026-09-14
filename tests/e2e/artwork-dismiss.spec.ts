import { openArtworkDrawer } from "./navigation-helpers";
import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`closing or interrupting an artwork resumes the walk from the current camera at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?vue=oeuvre&slug=oeuvre-03");
    const canvas = page.locator("canvas");
    await expect(page.locator(".visit-details")).toBeVisible({
      timeout: 60000,
    });
    const original = await canvas.elementHandle();
    for (const action of ["outside", "interrupt", "cross"]) {
      if (action !== "outside") {
        await openArtworkDrawer(page);
        await page
          .getByRole("dialog", { name: "Les œuvres", exact: true })
          .getByRole("button", {
            name:
              action === "interrupt" ? "Choisir Œuvre 08" : "Choisir Œuvre 03",
            exact: true,
          })
          .click();
        if (action === "interrupt") {
          await expect(canvas).toHaveAttribute(
            "data-navigation-state",
            "traveling",
          );
          await expect
            .poll(async () =>
              Number(await canvas.getAttribute("data-motion-elapsed")),
            )
            .toBeGreaterThan(0.5);
        } else
          await expect(page.locator(".visit-details")).toBeVisible({
            timeout: 30000,
          });
      }
      await canvas.evaluate((node) => {
        const state = window as any;
        state.resumeObserver?.disconnect();
        state.resumeSamples = [];
        const read = () => ({
          position: JSON.parse(node.dataset.cameraPosition!),
          time: Number(node.dataset.cameraSampleTime),
          id: node.dataset.navigationId,
        });
        state.resumeClick = read();
        document.addEventListener(
          "click",
          () => {
            state.resumeClick = read();
          },
          { capture: true, once: true },
        );
        state.resumeObserver = new MutationObserver(() =>
          state.resumeSamples.push(read()),
        );
        state.resumeObserver.observe(node, {
          attributes: true,
          attributeFilter: ["data-camera-position"],
        });
      });
      if (action === "cross")
        await page
          .locator(".visit-details")
          .getByRole("button", { name: "Revenir à la salle", exact: true })
          .click();
      else await canvas.click({ position: { x: 12, y: 120 } });
      await expect(page.locator(".visit-details")).toHaveCount(0);
      await expect(page).not.toHaveURL(/vue=oeuvre/);
      await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
        timeout: 30000,
      });
      const elapsed = Number(await canvas.getAttribute("data-tour-elapsed"));
      await expect
        .poll(async () =>
          Number(await canvas.getAttribute("data-tour-elapsed")),
        )
        .toBeGreaterThan(elapsed + 0.8);
      const evidence = await page.evaluate(() => ({
        atClick: (window as any).resumeClick,
        samples: (window as any).resumeSamples,
      }));
      const resumedId = await canvas.getAttribute("data-navigation-id");
      const samples = evidence.samples.filter(
        (sample: any) => sample.id === resumedId,
      );
      expect(samples.length).toBeGreaterThan(3);
      const distance = (a: number[], b: number[]) =>
        Math.hypot(...a.map((n, i) => n - b[i]));
      expect(
        distance(samples[0].position, evidence.atClick.position),
      ).toBeLessThan(0.08);
      for (let i = 1; i < samples.length; i++) {
        const dt = Math.max(0, (samples[i].time - samples[i - 1].time) / 1000);
        expect(
          distance(samples[i].position, samples[i - 1].position),
        ).toBeLessThanOrEqual(3.4 * dt + 0.03);
      }
      await page.screenshot({
        path: `artifacts/finishing-v8/resume-${action}-${width}.png`,
      });
    }
    expect(
      await original!.evaluate(
        (node) => node === document.querySelector("canvas"),
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test.describe("retina render budget", () => {
  test.use({ deviceScaleFactor: 2 });
  test("keeps the real drawing buffer within budget after UI updates", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1728, height: 1028 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?vue=oeuvre&slug=oeuvre-03");
    await expect(page.locator(".visit-details")).toBeVisible({
      timeout: 60000,
    });
    const check = async () => {
      await expect
        .poll(() =>
          page.locator("canvas").evaluate((element) => {
            const node = element as HTMLCanvasElement;
            const ratio = Number(node.dataset.requestedPixelRatio);
            const box = node.getBoundingClientRect();
            return (
              Math.abs(node.width - box.width * ratio) < 2 &&
              Math.abs(node.height - box.height * ratio) < 2 &&
              node.width * node.height <= Number(node.dataset.pixelBudget)
            );
          }),
        )
        .toBe(true);
    };
    await check();
    await openArtworkDrawer(page);
    await page
      .getByRole("dialog", { name: "Les œuvres", exact: true })
      .getByRole("button", { name: "Choisir Œuvre 08", exact: true })
      .click();
    await expect(page.locator(".visit-details")).toBeVisible();
    await check();
    await page.setViewportSize({ width: 390, height: 844 });
    await check();
  });
});

for (const width of [1440, 390]) {
  test(`cancel another room's artwork at the opening without retracing ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?vue=oeuvre&slug=oeuvre-03");
    const canvas = page.locator("canvas");
    await expect(page.locator(".visit-details")).toBeVisible({
      timeout: 60000,
    });
    await openArtworkDrawer(page);
    await page
      .getByRole("button", { name: "Choisir Œuvre 01", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          JSON.parse(
            (await canvas.getAttribute("data-camera-position")) || "[0,0,0]",
          )[2],
        { intervals: [50], timeout: 30000 },
      )
      .toBeGreaterThan(8.15);
    await canvas.evaluate((node) => {
      (window as any).portalPositions = [];
      new MutationObserver(() =>
        (window as any).portalPositions.push({
          p: JSON.parse(node.dataset.cameraPosition!),
          time: Number(node.dataset.cameraSampleTime),
          kind: node.dataset.transitionKind,
        }),
      ).observe(node, {
        attributes: true,
        attributeFilter: ["data-camera-position"],
      });
    });
    await canvas.click({ position: { x: 12, y: 120 } });
    await expect(canvas).toHaveAttribute("data-transition-kind", "resume");
    await expect(canvas).toHaveAttribute("data-tour-state", "walking");
    await expect(page).toHaveURL(/vue=salle&salle=room-2/);
    await expect(page.locator(".visit-details")).toHaveCount(0);
    await expect
      .poll(
        async () => Number(await canvas.getAttribute("data-tour-elapsed")),
        { timeout: 18000 },
      )
      .toBeGreaterThan(12);
    const samples = await page.evaluate(
      () =>
        (window as any).portalPositions as {
          p: number[];
          time: number;
          kind: string;
        }[],
    );
    let crossed = false;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1],
        b = samples[i];
      expect(Math.hypot(...a.p.map((v, k) => v - b.p[k]))).toBeLessThanOrEqual(
        (3.4 * Math.max(0, b.time - a.time)) / 1000 + 0.03,
      );
      if (b.p[2] > 9.01) crossed = true;
      if (crossed) expect(b.p[2]).toBeGreaterThan(8.99);
    }
    expect(crossed).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `artifacts/finishing-v8/portal-cancel-${width}.png`,
    });
  });
}

test("the resume button also cancels a collection transfer already inside its destination room", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
    timeout: 60000,
  });
  await page.locator(".visit-room-switch").click();
  await page
    .getByRole("dialog", { name: "Les collections" })
    .getByRole("button", { name: /Récits & paysages/ })
    .click();
  await expect
    .poll(
      async () =>
        JSON.parse(
          (await canvas.getAttribute("data-camera-position")) || "[0,0,0]",
        )[2],
      { intervals: [50], timeout: 30000 },
    )
    .toBeGreaterThan(9.3);
  const id = await canvas.getAttribute("data-navigation-id");
  await page
    .getByRole("button", { name: "Reprendre la visite", exact: true })
    .click();
  await expect(canvas).not.toHaveAttribute("data-navigation-id", id!);
  await expect(canvas).toHaveAttribute("data-transition-kind", "resume");
  await expect(canvas).toHaveAttribute("data-tour-state", "walking");
  await expect(page).toHaveURL(/salle=room-2/);
  await expect(page.locator(".visit-travel")).toHaveCount(0);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-tour-elapsed")))
    .toBeGreaterThan(1);
});
