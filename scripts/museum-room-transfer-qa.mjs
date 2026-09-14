import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const output = "artifacts/finishing-v7/transfers";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3000/?vue=oeuvre&slug=oeuvre-05");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true", {
    timeout: 60000,
  });
  await expect(page.locator(".visit-details")).toBeVisible();
  const original = await canvas.elementHandle();
  const renderer = await canvas.evaluate((node) => {
    const gl = node.getContext("webgl2");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  });
  for (const room of ["room-1", "room-2"]) {
    await page.evaluate(() => {
      window.transferLog = [];
      window.transferRecording = true;
      const record = (time) => {
        const canvas = document.querySelector("canvas");
        const veil = document.querySelector(".visit-room-transition");
        window.transferLog.push({
          time,
          opacity: veil ? Number(getComputedStyle(veil).opacity) : 0,
          canvasOpacity: Number(getComputedStyle(canvas).opacity),
          sampleTime: Number(canvas.dataset.cameraSampleTime),
          target: JSON.parse(canvas.dataset.cameraTarget),
          id: canvas.dataset.navigationId,
          nominalDuration: Number(canvas.dataset.transitionDuration),
          length: Number(canvas.dataset.transitionLength),
          detour: Number(canvas.dataset.transitionDetour),
          position: JSON.parse(canvas.dataset.cameraPosition),
          navigation: canvas.dataset.navigationState,
          tour: canvas.dataset.tourState,
          cameraRoom: canvas.dataset.cameraRoom,
        });
        if (window.transferRecording) requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    });
    await page.locator(".visit-next-room").click();
    await expect(canvas).toHaveAttribute("data-camera-room", room, {
      timeout: 20000,
    });
    await expect(canvas).toHaveAttribute("data-navigation-state", "arrived", {
      timeout: 20000,
    });
    await expect(canvas).toHaveAttribute("data-tour-state", "walking");
    await expect(page.locator(".visit-room-transition")).toHaveCount(0);
    const first = JSON.parse(await canvas.getAttribute("data-camera-position"));
    await page.waitForTimeout(1700);
    const last = JSON.parse(await canvas.getAttribute("data-camera-position"));
    expect(Math.hypot(...last.map((x, i) => x - first[i]))).toBeGreaterThan(
      0.08,
    );
    const frames = await page.evaluate(() => {
      window.transferRecording = false;
      return window.transferLog;
    });
    const travelling = frames.filter((f) => f.navigation === "traveling");
    const id = travelling[0].id;
    const arrived = frames.find(
      (f) => f.id === id && f.navigation === "arrived",
    );
    const duration = arrived.sampleTime - travelling[0].sampleTime;
    const samples = frames.filter(
      (f, i) => i === 0 || f.sampleTime !== frames[i - 1].sampleTime,
    );
    let maxSpeed = 0,
      maxAngularSpeed = 0,
      minimumForward = 1,
      minimumFastForward = 1,
      pathLength = 0;
    const crossings = [],
      violations = [],
      handoffSpeeds = [];
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1],
        b = samples[i],
        dt = (b.sampleTime - a.sampleTime) / 1000;
      if (dt <= 0) continue;
      const displacement = b.position.map((v, axis) => v - a.position[axis]);
      const step = Math.hypot(...displacement),
        speed = step / dt;
      const lookA = a.target.map((v, axis) => v - a.position[axis]);
      const lookB = b.target.map((v, axis) => v - b.position[axis]);
      const dot =
        lookA.reduce((sum, v, axis) => sum + v * lookB[axis], 0) /
        (Math.hypot(...lookA) * Math.hypot(...lookB));
      const angularSpeed =
        (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI / dt;
      if (b.id === id) {
        if (
          b.sampleTime >= arrived.sampleTime &&
          b.sampleTime <= arrived.sampleTime + 300
        )
          handoffSpeeds.push(speed);
        maxSpeed = Math.max(maxSpeed, speed);
        maxAngularSpeed = Math.max(maxAngularSpeed, angularSpeed);
        if (b.navigation === "traveling") {
          pathLength += step;
          if (speed > 0.08)
            minimumForward = Math.min(
              minimumForward,
              displacement.reduce((sum, v, axis) => sum + v * lookB[axis], 0) /
                (step * Math.hypot(...lookB)),
            );
        }
      }
      if (b.id === id && b.navigation === "traveling" && speed > 1)
        minimumFastForward = Math.min(
          minimumFastForward,
          displacement.reduce((sum, v, axis) => sum + v * lookB[axis], 0) /
            (step * Math.hypot(...lookB)),
        );
      if (step > 3.25 * dt + 0.003)
        violations.push({ kind: "position-jump", step, dt });
      if ((a.position[2] - 9) * (b.position[2] - 9) < 0) {
        const t = (9 - a.position[2]) / (b.position[2] - a.position[2]);
        crossings.push({
          position: a.position.map((v, axis) => v + t * (b.position[axis] - v)),
          time: a.sampleTime + t * (b.sampleTime - a.sampleTime),
          corridorDot:
            ((room === "room-2" ? 1 : -1) * lookB[2]) / Math.hypot(...lookB),
        });
      }
    }
    const intervals = travelling
      .slice(1)
      .map((f, i) => f.time - travelling[i].time)
      .sort((a, b) => a - b);
    const record = {
      room,
      durationMs: duration,
      nominalDurationMs: arrived.nominalDuration * 1000,
      start: travelling[0].position,
      end: arrived.position,
      pathLength,
      plannedLength: arrived.length,
      detour: arrived.detour,
      maxSpeed,
      maxAngularSpeed,
      minimumForward,
      minimumFastForward,
      minimumHandoffSpeed: Math.min(...handoffSpeeds),
      crossings,
      violations,
      medianFrameMs: intervals[Math.floor(intervals.length / 2)],
      p95FrameMs: intervals[Math.floor(intervals.length * 0.95)],
      walkingDisplacement: Math.hypot(...last.map((x, i) => x - first[i])),
      frames,
    };
    results.push(record);
    // Keep complete temporal evidence even when an assertion below rejects it.
    await writeFile(
      `${output}/report.json`,
      JSON.stringify({ renderer, errors, results }, null, 2),
    );
    expect(duration).toBeLessThan(15000);
    expect(violations).toEqual([]);
    expect(crossings).toHaveLength(1);
    expect(Math.abs(crossings[0].position[0])).toBeLessThan(1.28);
    expect(maxSpeed).toBeLessThan(3.25);
    expect(maxAngularSpeed).toBeLessThan(40.5);
    expect(minimumForward).toBeGreaterThan(0);
    expect(minimumFastForward).toBeGreaterThan(Math.SQRT1_2);
    expect(crossings[0].corridorDot).toBeGreaterThan(Math.SQRT1_2);
    expect(handoffSpeeds.length).toBeGreaterThan(2);
    expect(Math.min(...handoffSpeeds)).toBeGreaterThan(0.1);
    expect(frames.every((f) => f.opacity === 0 && f.canvasOpacity === 1)).toBe(
      true,
    );
    expect(frames.some((f) => f.tour === "joining")).toBe(false);
    await page.screenshot({ path: `${output}/${room}-walking.png` });
  }
  await page.locator(".visit-collection-button").click();
  const collection = page.getByRole("dialog", {
    name: "Les œuvres",
    exact: true,
  });
  await collection
    .getByRole("button", { name: "Choisir Œuvre 05", exact: true })
    .click();
  await expect(page.locator(".visit-details")).toBeVisible({ timeout: 30000 });
  await expect(canvas).toHaveAttribute("data-tour-state", "off");
  await canvas.click({ position: { x: 12, y: 120 } });
  await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
    timeout: 30000,
  });
  const elapsed = Number(await canvas.getAttribute("data-tour-elapsed"));
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-tour-elapsed")))
    .toBeGreaterThan(elapsed + 0.8);
  await expect(page).not.toHaveURL(/vue=oeuvre/);
  await expect(page.locator(".visit-details")).toHaveCount(0);
  expect(
    await original.evaluate(
      (node) => node === document.querySelector("canvas"),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        renderer,
        errors,
        results,
        blankClickResumesFromCurrentView: true,
        singleCanvas: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { renderer, errors, results: results.map(({ frames, ...r }) => r) },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
