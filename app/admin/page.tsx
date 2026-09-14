import AdminApp from "@/components/admin/AdminApp";
import { getAdminData } from "@/lib/data/repository";
import { isBlob, isDemo } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Administration · Galerie",
  robots: { index: false, follow: false },
};
export default async function AdminPage() {
  let data = null;
  try {
    data = await getAdminData();
  } catch {
    /* Login is intentionally the same screen for unavailable/expired sessions. */
  }
  return <AdminApp initialData={data} demo={isDemo()} singleAdmin={isBlob()} />;
}
