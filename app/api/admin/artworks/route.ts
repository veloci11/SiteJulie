import { getAdminData, saveArtwork } from "@/lib/data/repository";
import { assertMutationRequest } from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
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
    return success(await saveArtwork(await request.json()));
  } catch (e) {
    return failure(e);
  }
}
