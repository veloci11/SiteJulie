import { after } from "next/server";
import { refreshArrivalAfterSave } from "@/lib/museum/arrivalService";
import { assertMutationRequest } from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
import { completeUpload } from "@/lib/media/service";
export const maxDuration = 240;
export async function POST(request: Request) {
  try {
    await assertMutationRequest(request);
    const saved = await completeUpload((await request.json()).id);
    refreshArrivalAfterSave(after);
    return success(saved);
  } catch (e) {
    return failure(e);
  }
}
