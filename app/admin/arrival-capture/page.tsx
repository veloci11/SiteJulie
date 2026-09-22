import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/server";
import { getPublicData } from "@/lib/data/repository";
import { arrivalFingerprint } from "@/lib/museum/arrival";
import ArrivalCaptureClient from "@/components/admin/ArrivalCaptureClient";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function ArrivalCapturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await requireAdmin();
  } catch {
    redirect("/admin");
  }
  const data = await getPublicData();
  const query = await searchParams;
  if (
    typeof query.room !== "string" ||
    !data.rooms.includes(query.room) ||
    !["wide", "portrait"].includes(String(query.view))
  )
    notFound();
  return (
    <ArrivalCaptureClient
      data={data}
      room={query.room}
      view={String(query.view)}
      fingerprint={arrivalFingerprint(data)}
    />
  );
}
