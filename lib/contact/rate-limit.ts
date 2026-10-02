import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { readPrivateJson, updatePrivateJson } from "@/lib/storage/private-json";
import { ServiceError } from "@/lib/validation/artwork";

export const CONTACT_LIMITS_PATH = "museum-system/contact-limits.json";
const schema = z.object({
  version: z.literal(1),
  entries: z.record(
    z.string(),
    z.object({
      count: z.number().int().nonnegative(),
      expires: z.number().int().positive(),
    }),
  ),
});
type State = z.infer<typeof schema>;
export async function cleanupContactLimits() {
  if (!(await readPrivateJson<State>(CONTACT_LIMITS_PATH))) return;
  await updatePrivateJson<State, void>(
    CONTACT_LIMITS_PATH,
    () => ({ version: 1, entries: {} }),
    (raw) => {
      const parsed = schema.parse(raw);
      raw.entries = Object.fromEntries(
        Object.entries(parsed.entries).filter(
          ([, entry]) => entry.expires > Date.now(),
        ),
      );
    },
  );
}
export async function limitContact(request: Request, email: string) {
  const secret =
    process.env.CONTACT_RATE_LIMIT_SECRET || process.env.MUSEUM_SESSION_SECRET;
  if (
    process.env.MUSEUM_DATA_MODE !== "blob" ||
    !process.env.BLOB_READ_WRITE_TOKEN ||
    !secret ||
    secret.length < 32
  )
    throw new ServiceError(
      "Le formulaire est momentanément indisponible. Vous pouvez écrire directement par email.",
      503,
    );
  // Vercel overwrites this header with the actual connecting address. Never
  // trust a visitor-supplied x-forwarded-for to bypass the production limiter.
  const ip =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const digest = (value: string) =>
    createHmac("sha256", secret)
      .update("museum-contact:" + value)
      .digest("hex");
  const rules = [
    { key: digest("ip:" + ip), maximum: 5, duration: 15 * 60000 },
    {
      key: digest("email:" + email.trim().toLowerCase()),
      maximum: 5,
      duration: 15 * 60000,
    },
    // Two emails per submission; preserve headroom in Resend's free daily quota.
    { key: "daily", maximum: 40, duration: 24 * 3600000 },
  ];
  await updatePrivateJson<State, void>(
    CONTACT_LIMITS_PATH,
    () => ({ version: 1, entries: {} }),
    (raw) => {
      const parsed = schema.safeParse(raw);
      if (!parsed.success)
        throw new ServiceError(
          "Le formulaire est momentanément indisponible.",
          503,
        );
      const now = Date.now();
      raw.entries = parsed.data.entries;
      for (const [key, entry] of Object.entries(raw.entries))
        if (entry.expires <= now) delete raw.entries[key];
      if (
        Object.keys(raw.entries).length > 10000 ||
        rules.some(
          (rule) => (raw.entries[rule.key]?.count || 0) >= rule.maximum,
        )
      )
        throw new ServiceError(
          "Trop de messages rapprochés. Réessayez plus tard ou écrivez directement par email.",
          429,
        );
      for (const rule of rules) {
        const entry = raw.entries[rule.key] ?? {
          count: 0,
          expires: now + rule.duration,
        };
        entry.count++;
        raw.entries[rule.key] = entry;
      }
    },
  );
}
