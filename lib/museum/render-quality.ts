/** A conservative engine hint, not device/GPU or Safari performance detection. */
export function usesWebKit(userAgent: string) {
  return (
    /AppleWebKit\//i.test(userAgent) &&
    !/(?:Chrome|Chromium|Edg|OPR|SamsungBrowser)\/|Android/i.test(userAgent)
  );
}

/** Fixed for a viewport: selection and animation never change the drawing buffer. */
export function museumRenderBudget(
  width: number,
  height: number,
  dpr: number,
  userAgent: string,
) {
  const compact = width <= 700 || height <= 520;
  const webkit = usesWebKit(userAgent);
  const pixels = webkit
    ? compact
      ? 1_000_000
      : 1_800_000
    : compact
      ? 1_400_000
      : 3_200_000;
  const ratio = Math.min(
    dpr || 1,
    webkit ? 1.25 : 1.5,
    Math.sqrt(pixels / Math.max(1, width * height)),
  );
  return { ratio, pixels, compact, webkit };
}
