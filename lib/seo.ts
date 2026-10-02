import type { Metadata } from "next";
import type { Artwork, SiteSettings } from "./data/types";

export function siteOrigin() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || "");
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function publicIndexingEnabled() {
  const origin = siteOrigin();
  return Boolean(
    origin?.startsWith("https://") &&
    process.env.MUSEUM_PUBLIC_INDEXING === "1" &&
    ["supabase", "blob"].includes(process.env.MUSEUM_DATA_MODE || "") &&
    process.env.VERCEL_ENV !== "preview",
  );
}

export function plainDescription(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 165 ? clean.slice(0, 162).trimEnd() + "…" : clean;
}

export function pageMetadata(
  settings: SiteSettings,
  title: string,
  description: string,
  path: string,
  artwork?: Artwork,
): Metadata {
  const origin = siteOrigin();
  const summary = plainDescription(description);
  const url = origin ? origin + path : undefined;
  const image = artwork?.detailImage;
  return {
    title: { absolute: `${title} | ${settings.artistName}` },
    description: summary,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "fr_CH",
      siteName: settings.artistName,
      title: `${title} | ${settings.artistName}`,
      description: summary,
      url,
      ...(image && origin
        ? {
            images: [
              {
                url: new URL(image, origin).href,
                alt: artwork.alt,
                width: artwork.imageWidth,
                height: artwork.imageHeight,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description: summary,
      ...(image && origin ? { images: [new URL(image, origin).href] } : {}),
    },
  };
}

export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
