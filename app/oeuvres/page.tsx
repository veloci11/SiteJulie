import { getPublicData } from "@/lib/data/repository";
import { pageMetadata } from "@/lib/seo";
import CatalogueContent from "@/components/public/CatalogueContent";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const data = await getPublicData();
  return pageMetadata(
    data.settings,
    "Les œuvres",
    `Découvrez les peintures de ${data.settings.artistName}, leurs collections et leur disponibilité. Contactez l’artiste pour en savoir plus sur une œuvre.`,
    "/oeuvres",
    data.artworks[0],
  );
}
export default async function Catalogue() {
  const data = await getPublicData();
  return <CatalogueContent data={data} />;
}
