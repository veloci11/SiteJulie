import { after } from "next/server";
import { refreshArrivalAfterSave } from "@/lib/museum/arrivalService";
import { saveSettings } from "@/lib/data/repository";
import { assertMutationRequest } from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
export const maxDuration = 240;
export async function POST(request: Request) {
  try {
    await assertMutationRequest(request);
    const saved = await saveSettings(await request.json());
    refreshArrivalAfterSave(after);
    return success(saved);
  } catch (e) {
    return failure(e);
  }
}
