import { getPublicData } from "@/lib/data/repository";
import MuseumShell from "@/components/museum/MuseumShell";
import { parseDestination } from "@/lib/public";
export const dynamic = "force-dynamic";
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
  return <MuseumShell data={data} initialDestination={initialDestination} />;
}
