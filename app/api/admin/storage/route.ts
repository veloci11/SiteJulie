import { requireAdmin, isBlob } from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
import { storageUsage } from "@/lib/storage/usage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireAdmin();
    if (!isBlob()) return success({ available: false });
    return success(await storageUsage());
  } catch (error) {
    return failure(error);
  }
}
