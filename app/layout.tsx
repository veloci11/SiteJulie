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
    default: "La galerie | Artiste peintre",
    template: "%s | La galerie",
  },
  description:
    "Une visite parmi les couleurs. Découvrez les œuvres et entrez dans une galerie en trois dimensions.",
  robots: {
    index:
      process.env.MUSEUM_PUBLIC_INDEXING === "1" &&
      process.env.MUSEUM_DATA_MODE === "supabase",
    follow:
      process.env.MUSEUM_PUBLIC_INDEXING === "1" &&
      process.env.MUSEUM_DATA_MODE === "supabase",
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
