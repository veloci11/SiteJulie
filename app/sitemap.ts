import type { MetadataRoute } from "next";
import { getPublicData } from "@/lib/data/repository";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (
    process.env.MUSEUM_PUBLIC_INDEXING !== "1" ||
    !process.env.NEXT_PUBLIC_SITE_URL
  )
    return [];
  const data = await getPublicData();
  if (data.mode === "demo") return [];
  const origin = process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return [
    "",
    "/oeuvres",
    "/a-propos",
    "/contact",
    ...data.artworks.map((a) => `/oeuvres/${encodeURIComponent(a.slug)}`),
  ].map((path) => ({ url: origin + path }));
}
