import { expect, it } from "vitest";
import { publicAnalyticsEvent } from "@/lib/analytics";
it("redacts visitor link parameters and never records administrative paths", () => {
  expect(
    publicAnalyticsEvent({
      type: "pageview",
      url: "https://www.juliethiam.art/contact?email=private@example.test#secret",
    }),
  ).toEqual({ type: "pageview", url: "https://www.juliethiam.art/contact" });
  for (const pathname of ["/admin", "/admin/arrival-capture", "/api/contact"])
    expect(
      publicAnalyticsEvent({
        type: "pageview",
        url: "https://www.juliethiam.art" + pathname,
      }),
    ).toBeNull();
});
