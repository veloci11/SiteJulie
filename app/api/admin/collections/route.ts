import { after } from "next/server";
import { refreshArrivalAfterSave } from "@/lib/museum/arrivalService";
import { createCollection } from "@/lib/data/repository";
import { assertMutationRequest } from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
export const maxDuration = 240;
export async function POST(request: Request) {
  try {
    await assertMutationRequest(request);
    const saved = await createCollection(await request.json());
    refreshArrivalAfterSave(after);
    return success(saved);
  } catch (error) {
    return failure(error);
  }
}
