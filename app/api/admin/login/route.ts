import {
  assertMutationRequest,
  enterDemo,
  isDemo,
  requireAdmin,
  supabaseSession,
} from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
import { ServiceError } from "@/lib/validation/artwork";
export async function POST(request: Request) {
  try {
    await assertMutationRequest(request);
    if (isDemo()) {
      await enterDemo();
      return success({ ok: true });
    }
    const { email, password } = await request.json();
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 1000
    )
      throw new ServiceError("Identifiants invalides.");
    const client = await supabaseSession();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new ServiceError("Email ou mot de passe incorrect.", 401);
    try {
      await requireAdmin();
    } catch (error) {
      await client.auth.signOut();
      throw error;
    }
    return success({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
