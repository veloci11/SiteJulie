import type { MetadataRoute } from "next";
import { getPublicData } from "@/lib/data/repository";
import { publicIndexingEnabled, siteOrigin } from "@/lib/seo";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!publicIndexingEnabled()) return [];
  const data = await getPublicData();
  if (data.mode === "demo") return [];
  const origin = siteOrigin()!;
  return [
    "",
    "/oeuvres",
    "/a-propos",
    "/contact",
    "/mentions-legales",
    "/confidentialite",
    ...data.artworks.map((a) => `/oeuvres/${encodeURIComponent(a.slug)}`),
  ].map((path) => ({ url: origin + path }));
}
