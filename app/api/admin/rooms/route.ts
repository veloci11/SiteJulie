import { addRoom } from "@/lib/data/repository";
import { assertMutationRequest } from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
export async function POST(request: Request) {
  try {
    await assertMutationRequest(request);
    return success({ id: await addRoom() });
  } catch (e) {
    return failure(e);
  }
}
