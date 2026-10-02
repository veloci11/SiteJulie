import type { MetadataRoute } from "next";
import { publicIndexingEnabled, siteOrigin } from "@/lib/seo";
export default function robots(): MetadataRoute.Robots {
  const enabled = publicIndexingEnabled();
  return {
    rules: {
      userAgent: "*",
      allow: enabled ? ["/", "/api/media/"] : undefined,
      disallow: enabled ? ["/admin", "/api/", "/visite/apercu"] : "/",
    },
    ...(enabled && siteOrigin()
      ? { sitemap: `${siteOrigin()}/sitemap.xml` }
      : {}),
  };
}
