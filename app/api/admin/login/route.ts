import {
  assertMutationRequest,
  enterBlobAdmin,
  enterDemo,
  isBlob,
  isDemo,
  requireAdmin,
  supabaseSession,
} from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
import { ServiceError } from "@/lib/validation/artwork";

type Attempt = { failures: number; startedAt: number; blockedUntil: number };
const loginState = globalThis as typeof globalThis & {
  museumLoginAttempts?: Map<string, Attempt>;
};
const attempts = (loginState.museumLoginAttempts ??= new Map());

function attemptKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function assertLoginAllowed(key: string) {
  const attempt = attempts.get(key);
  if (attempt && attempt.blockedUntil > Date.now())
    throw new ServiceError("Trop de tentatives. Réessayez plus tard.", 429);
}

function recordFailure(key: string) {
  const now = Date.now();
  const previous = attempts.get(key);
  const current =
    previous && now - previous.startedAt < 15 * 60_000
      ? previous
      : { failures: 0, startedAt: now, blockedUntil: 0 };
  current.failures++;
  if (current.failures >= 6) current.blockedUntil = now + 15 * 60_000;
  attempts.set(key, current);
}
export async function POST(request: Request) {
  try {
    await assertMutationRequest(request);
    if (isDemo()) {
      await enterDemo();
      return success({ ok: true });
    }
    const { email, username, password } = await request.json();
    if (typeof password !== "string" || password.length > 1000)
      throw new ServiceError("Identifiants invalides.");
    if (isBlob()) {
      if (typeof username !== "string" || username.length > 100)
        throw new ServiceError("Identifiants invalides.");
      const key = attemptKey(request);
      assertLoginAllowed(key);
      try {
        await enterBlobAdmin(username, password);
        attempts.delete(key);
      } catch (error) {
        if (error instanceof ServiceError && error.status === 401)
          recordFailure(key);
        throw error;
      }
      return success({ ok: true });
    }
    if (typeof email !== "string" || email.length > 254)
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
