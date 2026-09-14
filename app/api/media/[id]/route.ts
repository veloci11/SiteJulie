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
    const result = await getMedia(id, variant as Variant);
    if (result.url)
      return NextResponse.redirect(result.url, {
        status: 307,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    return new NextResponse(new Uint8Array(result.buffer!), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
