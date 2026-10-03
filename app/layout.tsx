import type { Metadata } from "next";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "./globals.css";
import "./museum.css";
import { publicIndexingEnabled, siteOrigin } from "@/lib/seo";
import { PublicAnalytics } from "@/components/public/PublicAnalytics";
export const metadata: Metadata = {
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION },
  metadataBase: siteOrigin() ? new URL(siteOrigin()!) : undefined,
  title: {
    default: "Julie Thiam — Artiste peintre",
    template: "%s | Julie Thiam",
  },
  description:
    "Une visite parmi les couleurs. Découvrez les œuvres et entrez dans une galerie en trois dimensions.",
  robots: {
    index: publicIndexingEnabled(),
    follow: publicIndexingEnabled(),
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        {children}
        <PublicAnalytics />
      </body>
    </html>
  );
}
