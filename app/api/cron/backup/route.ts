import { timingSafeEqual } from "node:crypto";
import { createMuseumBackup } from "@/lib/storage/backups";
import { failure, success } from "@/lib/auth/api";
import { ServiceError } from "@/lib/validation/artwork";
import { cleanupContactLimits } from "@/lib/contact/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return failure(new ServiceError("Accès refusé.", 401));
  try {
    const { manifest, reused } = await createMuseumBackup();
    await cleanupContactLimits();
    return success({
      ok: true,
      createdAt: manifest.createdAt,
      assets: manifest.assets.length,
      reused,
    });
  } catch {
    console.error(
      "Museum backup failed; no new complete snapshot was committed.",
    );
    return failure(
      new ServiceError("La sauvegarde n’a pas pu être terminée.", 503),
    );
  }
}
