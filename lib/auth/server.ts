import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { ServiceError } from "@/lib/validation/artwork";
const globalAuth = globalThis as typeof globalThis & { museumDemoKey?: string };
const demoKey = () =>
  (globalAuth.museumDemoKey ??= randomBytes(32).toString("hex"));
export function isDemo() {
  return (
    process.env.MUSEUM_DATA_MODE === "demo" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.MUSEUM_LOCAL_PREVIEW === "1")
  );
}
export function isBlob() {
  return process.env.MUSEUM_DATA_MODE === "blob";
}
export function assertLocalHost(host: string | null) {
  const hostname = (host || "").split(":")[0];
  if (!["localhost", "127.0.0.1"].includes(hostname))
    throw new ServiceError(
      "Le mode de démonstration est limité à cet ordinateur.",
      403,
    );
}
export async function assertMutationRequest(request: Request) {
  const rawOrigin = request.headers.get("origin");
  let origin: URL;
  try {
    origin = new URL(rawOrigin || "");
  } catch {
    throw new ServiceError("Origine de requête refusée.", 403);
  }
  // Next may normalize request.url to localhost; the HTTP Host retains the visitor's actual origin.
  if (
    origin.host !== request.headers.get("host") ||
    !["http:", "https:"].includes(origin.protocol)
  )
    throw new ServiceError("Origine de requête refusée.", 403);
  if (isDemo()) assertLocalHost(request.headers.get("host"));
}
export async function supabaseSession() {
  const jar = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new ServiceError("Supabase n’est pas configuré.", 503);
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(items) {
        try {
          items.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          /* Read-only Server Components cannot refresh cookies; route handlers can. */
        }
      },
    },
  });
}
export async function requireAdmin() {
  if (isDemo()) {
    assertLocalHost((await headers()).get("host"));
    const value = (await cookies()).get("museum_demo")?.value || "";
    const [expires, signature] = value.split(".");
    const expected = createHmac("sha256", demoKey())
      .update(expires || "")
      .digest("hex");
    if (
      !signature ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ||
      Number(expires) < Date.now()
    )
      throw new ServiceError("Connectez-vous à l’administration.", 401);
    return { id: "local-demo-admin", demo: true as const };
  }
  if (isBlob()) {
    const secret = process.env.MUSEUM_SESSION_SECRET || "";
    const value = (await cookies()).get("museum_admin")?.value || "";
    const [expires, signature] = value.split(".");
    const expected = createHmac("sha256", secret)
      .update(expires || "")
      .digest("hex");
    if (
      secret.length < 32 ||
      !signature ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ||
      Number(expires) < Date.now()
    )
      throw new ServiceError("Connectez-vous à l’administration.", 401);
    return { id: "vercel-blob-admin", demo: false as const };
  }
  const client = await supabaseSession();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    throw new ServiceError("Connectez-vous à l’administration.", 401);
  const { data: membership } = await client
    .from("admin_memberships")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership)
    throw new ServiceError(
      "Ce compte ne dispose pas de droits d’administration.",
      403,
    );
  return { id: user.id, demo: false as const };
}
function verifyAdminPassword(password: string, encoded: string) {
  const [scheme, saltText, expectedText] = encoded.split("$");
  if (scheme !== "scrypt" || !saltText || !expectedText) return false;
  try {
    const expected = Buffer.from(expectedText, "base64url");
    const actual = scryptSync(
      password,
      Buffer.from(saltText, "base64url"),
      32,
      {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      },
    );
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}
export async function enterBlobAdmin(username: string, password: string) {
  if (!isBlob()) throw new ServiceError("Connexion indisponible.", 503);
  const configuredUsername = process.env.MUSEUM_ADMIN_USERNAME || "";
  const passwordHash = process.env.MUSEUM_ADMIN_PASSWORD_HASH || "";
  const secret = process.env.MUSEUM_SESSION_SECRET || "";
  if (!configuredUsername || !passwordHash || secret.length < 32)
    throw new ServiceError("Administration non configurée.", 503);
  if (
    username.trim() !== configuredUsername ||
    !verifyAdminPassword(password, passwordHash)
  )
    throw new ServiceError("Identifiant ou mot de passe incorrect.", 401);
  const expires = String(Date.now() + 8 * 3600000);
  const signature = createHmac("sha256", secret).update(expires).digest("hex");
  (await cookies()).set("museum_admin", `${expires}.${signature}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 3600,
  });
}
export async function enterDemo() {
  if (!isDemo()) throw new ServiceError("Démonstration désactivée.", 403);
  assertLocalHost((await headers()).get("host"));
  const expires = String(Date.now() + 8 * 3600000);
  const token = `${expires}.${createHmac("sha256", demoKey()).update(expires).digest("hex")}`;
  (await cookies()).set("museum_demo", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    maxAge: 8 * 3600,
  });
}
