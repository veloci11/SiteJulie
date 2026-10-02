import { test, expect } from "@playwright/test";

test.use({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "no-preference",
});

test("hiding and showing the automatic artwork card does not pan the walking lens", async ({
  page,
}) => {
  await page.goto("/?vue=salle&salle=room-1");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-tour-state", "walking", {
    timeout: 60000,
  });
  const preview = page.locator(".visit-auto-preview");
  await expect(preview).toBeVisible({ timeout: 60000 });
  const expectedOffset = await page.locator(".visit-shell").evaluate((node) => {
    const style = getComputedStyle(node);
    return (
      (Number.parseFloat(style.getPropertyValue("--tour-preview-width")) +
        Number.parseFloat(style.getPropertyValue("--tour-preview-edge"))) /
      2
    );
  });
  const offsetX = async () =>
    JSON.parse((await canvas.getAttribute("data-camera-offset"))!)[0] as number;
  // Let the initial poster framing settle before testing an actual UI change.
  await expect
    .poll(async () => Math.abs((await offsetX()) - expectedOffset), {
      timeout: 10000,
    })
    .toBeLessThan(0.1);
  const before = await offsetX();
  const hidden = await page.addStyleTag({
    content: ".visit-auto-preview { display:none!important; }",
  });
  await expect(preview).toBeHidden();
  await page.waitForTimeout(500);
  expect(Math.abs((await offsetX()) - before)).toBeLessThan(0.2);
  await hidden.evaluate((node) => (node as HTMLStyleElement).remove());
  await expect(preview).toBeVisible();
  await page.waitForTimeout(500);
  expect(Math.abs((await offsetX()) - before)).toBeLessThan(0.2);
});
