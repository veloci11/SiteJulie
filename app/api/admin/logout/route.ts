import { cookies } from "next/headers";
import {
  assertMutationRequest,
  isDemo,
  supabaseSession,
} from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
export async function POST(request: Request) {
  try {
    await assertMutationRequest(request);
    if (isDemo()) (await cookies()).delete("museum_demo");
    else await (await supabaseSession()).auth.signOut();
    return success({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
