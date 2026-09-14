import { describe, expect, it } from "vitest";
import { museumRenderBudget, usesWebKit } from "../lib/museum/render-quality";
const safari =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const chrome =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
describe("Stable WebKit drawing budget", () => {
  it("distinguishes desktop Chromium from WebKit including iOS browser shells", () => {
    expect(usesWebKit(safari)).toBe(true);
    expect(
      usesWebKit(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5) AppleWebKit/605.1.15 CriOS/136.0.0.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(true);
    expect(usesWebKit(chrome)).toBe(false);
    expect(usesWebKit(chrome + " Edg/136.0.0.0")).toBe(false);
    expect(usesWebKit("Mozilla/5.0 Gecko/20100101 Firefox/138.0")).toBe(false);
  });
  it("caps Retina desktop and portrait buffers without increasing native DPR", () => {
    for (const [width, height] of [
      [1440, 900],
      [1920, 1080],
      [2560, 1440],
      [390, 844],
      [667, 375],
    ]) {
      const budget = museumRenderBudget(width, height, 2, safari);
      expect(width * height * budget.ratio ** 2).toBeLessThanOrEqual(
        budget.pixels + 1e-6,
      );
      expect(budget.ratio).toBeLessThanOrEqual(1.25);
      expect(
        museumRenderBudget(width, height, 1, safari).ratio,
      ).toBeLessThanOrEqual(1);
    }
  });
  it("preserves the existing non-WebKit quality and gives a repeatable viewport budget", () => {
    expect(museumRenderBudget(1440, 900, 2, chrome).ratio).toBe(1.5);
    expect(museumRenderBudget(390, 844, 3, chrome).ratio).toBe(1.5);
    const fixed = museumRenderBudget(1440, 900, 2, safari);
    expect(museumRenderBudget(1440, 900, 2, safari)).toEqual(fixed);
    expect(fixed.ratio ** 2 / 1.5 ** 2).toBeCloseTo(1_800_000 / 2_916_000);
  });
});
