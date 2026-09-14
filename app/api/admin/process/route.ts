import { assertMutationRequest } from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
import { completeUpload } from "@/lib/media/service";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    await assertMutationRequest(request);
    return success(await completeUpload((await request.json()).id));
  } catch (e) {
    return failure(e);
  }
}
