import type { Metadata } from "next";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "./globals.css";
import "./museum.css";
export const metadata: Metadata = {
  title: {
    default: "Julie Thiam — Artiste peintre",
    template: "%s | Julie Thiam",
  },
  description:
    "Une visite parmi les couleurs. Découvrez les œuvres et entrez dans une galerie en trois dimensions.",
  robots: {
    index:
      process.env.MUSEUM_PUBLIC_INDEXING === "1" &&
      ["supabase", "blob"].includes(process.env.MUSEUM_DATA_MODE || ""),
    follow:
      process.env.MUSEUM_PUBLIC_INDEXING === "1" &&
      ["supabase", "blob"].includes(process.env.MUSEUM_DATA_MODE || ""),
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
