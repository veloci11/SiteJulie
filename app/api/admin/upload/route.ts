import { assertMutationRequest } from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
import { createUpload, putLocalUpload } from "@/lib/media/service";
export async function POST(request: Request) {
  try {
    await assertMutationRequest(request);
    return success(await createUpload((await request.json()).artworkId));
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request) {
  try {
    await assertMutationRequest(request);
    return success(
      await putLocalUpload(
        new URL(request.url).searchParams.get("id") || "",
        request,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
