import { notFound } from "next/navigation";
import { getPublicData } from "@/lib/data/repository";
import { arrivalFingerprint } from "@/lib/museum/arrival";
import ArrivalCaptureClient from "@/components/admin/ArrivalCaptureClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Aperçu de salle",
  robots: { index: false, follow: false },
};
export default async function RoomPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; fingerprint?: string }>;
}) {
  const data = await getPublicData();
  const query = await searchParams;
  const fingerprint = arrivalFingerprint(data);
  if (
    !query.room ||
    !data.rooms.includes(query.room) ||
    query.fingerprint !== fingerprint
  )
    notFound();
  return (
    <ArrivalCaptureClient
      data={data}
      room={query.room}
      view="wide"
      fingerprint={fingerprint}
    />
  );
}
