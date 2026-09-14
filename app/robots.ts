import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  const enabled =
    process.env.MUSEUM_PUBLIC_INDEXING === "1" &&
    process.env.MUSEUM_DATA_MODE === "supabase";
  return {
    rules: {
      userAgent: "*",
      allow: enabled ? "/" : undefined,
      disallow: enabled ? ["/admin", "/api/"] : "/",
    },
    ...(enabled && process.env.NEXT_PUBLIC_SITE_URL
      ? { sitemap: `${process.env.NEXT_PUBLIC_SITE_URL}/sitemap.xml` }
      : {}),
  };
}
