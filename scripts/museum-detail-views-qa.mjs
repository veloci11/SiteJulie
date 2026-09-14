/** Real browser promenade views; run after all GPU asset generation has ended. */
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const output =
  process.env.MUSEUM_PROMENADE_OUTPUT || "artifacts/finishing-v6/promenades";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
});
const results = [];
try {
  // Concurrent views only for composition, never used as performance measures.
  await Promise.all(
    [1440, 390].flatMap((width) =>
      ["room-1", "room-2"].map(async (roomId) => {
        const viewport = { width, height: width === 1440 ? 900 : 844 };
        const page = await browser.newPage({
          viewport,
          deviceScaleFactor: 1.5,
          reducedMotion: "no-preference",
        });
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        try {
          await page.goto(`http://127.0.0.1:3000/?vue=salle&salle=${roomId}`);
          const canvas = page.locator("canvas");
          await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
            timeout: 60000,
          });
          const shots = [];
          for (const phase of [0.08, 0.3, 0.55, 0.8]) {
            await page.waitForFunction(
              (phase) =>
                Number(
                  document.querySelector("canvas")?.dataset.tourProgress,
                ) >= phase,
              phase,
              { timeout: 45000 },
            );
            await expect(canvas).toHaveAttribute("data-camera-room", roomId);
            await expect(canvas).toHaveAttribute("data-tour-state", "walking");
            const state = await canvas.evaluate((n) => ({ ...n.dataset }));
            expect(JSON.parse(state.cameraPosition)[1]).toBe(1.75);
            expect(Math.abs(Number(state.tourYawSpeed))).toBeLessThan(12.1);
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
            const path = `${output}/${roomId}-${width}-${phase}.png`;
            await page.screenshot({ path });
            shots.push({ path, state });
          }
          expect(errors).toEqual([]);
          results.push({ viewport, roomId, shots, errors });
        } finally {
          await page.close();
        }
      }),
    ),
  );
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        browser: browser.version(),
        note: "Real-time screenshots; four concurrent pages, no FPS claim.",
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    `${results.length * 4} real promenade views, both rooms desktop/mobile; no JavaScript error, overflow, roll or camera-height change.`,
  );
} finally {
  await browser.close();
}
