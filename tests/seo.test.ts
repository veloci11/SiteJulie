import { afterEach, describe, expect, it, vi } from "vitest";
import {
  jsonLd,
  pageMetadata,
  publicIndexingEnabled,
  siteOrigin,
} from "@/lib/seo";
import { blankSettings } from "@/lib/validation/artwork";
afterEach(() => vi.unstubAllEnvs());
describe("Public SEO without draft or preview indexing", () => {
  it("indexes only the configured public release", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.example.test");
    vi.stubEnv("MUSEUM_DATA_MODE", "blob");
    vi.stubEnv("MUSEUM_PUBLIC_INDEXING", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(publicIndexingEnabled()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(publicIndexingEnabled()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("MUSEUM_DATA_MODE", "demo");
    expect(publicIndexingEnabled()).toBe(false);
  });
  it("gives contact query variants one canonical URL and a specific description", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.example.test/");
    const metadata = pageMetadata(
      blankSettings,
      "Contact",
      "Échanger au sujet d’une œuvre.\nUne demande personnelle.",
      "/contact",
    );
    expect(metadata.alternates?.canonical).toBe(
      "https://www.example.test/contact",
    );
    expect(metadata.description).toBe(
      "Échanger au sujet d’une œuvre. Une demande personnelle.",
    );
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://user:secret@example.test");
    expect(siteOrigin()).toBeUndefined();
  });
  it("cannot break out of structured data with artwork text", () => {
    expect(jsonLd({ name: "</script><script>bad</script>" })).not.toContain(
      "<",
    );
  });
});
