import { getPublicData } from "@/lib/data/repository";
import MuseumEntry from "@/components/museum/MuseumEntry";
import { classicUrl, parseDestination } from "@/lib/public";
import CatalogueContent from "@/components/public/CatalogueContent";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const data = await getPublicData();
  return pageMetadata(
    data.settings,
    "Artiste peintre",
    `${data.settings.tagline}. Découvrez ses peintures, ses collections et sa galerie 3D. ${data.settings.contactText}`,
    "/",
    data.artworks[0],
  );
}
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getPublicData();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    if (typeof value === "string") query.set(key, value);
  const initialDestination = parseDestination(
    query.toString(),
    data.artworks,
    data.rooms,
  );
  const agent = (await headers()).get("user-agent") || "";
  if (/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(agent)) {
    if (initialDestination.kind === "home")
      return <CatalogueContent data={data} active="home" />;
    redirect(classicUrl(initialDestination, data.artworks));
  }
  return (
    <MuseumEntry data={data} initialDestination={initialDestination}>
      <CatalogueContent data={data} />
    </MuseumEntry>
  );
}
