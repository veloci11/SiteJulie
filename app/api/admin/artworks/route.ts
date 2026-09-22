import { after } from "next/server";
import { refreshArrivalAfterSave } from "@/lib/museum/arrivalService";
import { getAdminData, saveArtwork } from "@/lib/data/repository";
import { assertMutationRequest } from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
export const maxDuration = 240;
export async function GET() {
  try {
    return success(await getAdminData());
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    await assertMutationRequest(request);
    const saved = await saveArtwork(await request.json());
    refreshArrivalAfterSave(after);
    return success(saved);
  } catch (e) {
    return failure(e);
  }
}
