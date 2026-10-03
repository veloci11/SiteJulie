import { NextResponse } from "next/server";
import { failure } from "@/lib/auth/api";
import { assertLocalHost, isDemo } from "@/lib/auth/server";
import { getMedia, variants, type Variant } from "@/lib/media/service";
import { ServiceError } from "@/lib/validation/artwork";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (isDemo()) assertLocalHost(request.headers.get("host"));
    const { id } = await params;
    const variant = new URL(request.url).searchParams.get("variant") || "room";
    if (!Object.prototype.hasOwnProperty.call(variants, variant))
      throw new ServiceError("Variante invalide.", 400);
    const result = await getMedia(
      id,
      variant as Variant,
      true,
      request.headers.get("if-none-match") ?? undefined,
    );
    if (result.url)
      return NextResponse.redirect(result.url, {
        status: 307,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    const maxAge =
      result.publicationValidUntil === undefined
        ? 60
        : Math.max(
            0,
            Math.min(
              60,
              Math.floor((result.publicationValidUntil - Date.now()) / 1000),
            ),
          );
    const headers = {
      "Content-Type": "image/webp",
      // Include the server snapshot's age in the existing 60-second revocation window.
      // Draft/admin images are never retained by the browser.
      "Cache-Control": result.published
        ? `private, max-age=${maxAge}, must-revalidate`
        : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(result.etag ? { ETag: result.etag } : {}),
    };
    const matches = request.headers
      .get("if-none-match")
      ?.split(",")
      .some(
        (value) =>
          value.trim().replace(/^W\//, "") === result.etag?.replace(/^W\//, ""),
      );
    if (result.published && (result.notModified || (result.etag && matches))) {
      await result.stream?.cancel();
      return new NextResponse(null, { status: 304, headers });
    }
    return new NextResponse(result.stream ?? new Uint8Array(result.buffer!), {
      headers,
    });
  } catch (e) {
    return failure(e);
  }
}
