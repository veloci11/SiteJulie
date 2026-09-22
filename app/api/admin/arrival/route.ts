import sharp from "sharp";
import { assertMutationRequest, requireAdmin } from "@/lib/auth/server";
import { getPublicData } from "@/lib/data/repository";
import { failure, success } from "@/lib/auth/api";
import { ServiceError } from "@/lib/validation/artwork";
import { arrivalFingerprint } from "@/lib/museum/arrival";
import {
  commitBrowserArrival,
  storeBrowserArrival,
} from "@/lib/museum/arrivalStorage";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    await assertMutationRequest(request);
    await requireAdmin();
    const query = new URL(request.url).searchParams;
    const fingerprint = query.get("fingerprint");
    const data = await getPublicData();
    if (fingerprint !== arrivalFingerprint(data))
      throw new ServiceError(
        "La galerie a changé. La capture sera recommencée.",
        409,
      );
    if (!["demo", "blob"].includes(data.mode))
      throw new ServiceError("Stockage des aperçus non configuré.", 503);
    if (query.get("commit") === "1") {
      await commitBrowserArrival(data);
    } else {
      const room = query.get("room") || "";
      const view = query.get("view") || "";
      if (!data.rooms.includes(room) || !["wide", "portrait"].includes(view))
        throw new ServiceError("Vue inconnue.");
      const reader = request.body?.getReader();
      if (!reader) throw new ServiceError("Image manquante.");
      let length = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 2_000_000) {
          await reader.cancel();
          throw new ServiceError("Image trop volumineuse.", 413);
        }
        chunks.push(value);
      }
      const input = Buffer.concat(chunks);
      const image = sharp(input, { limitInputPixels: 8_000_000 });
      const metadata = await image.metadata();
      if (
        metadata.format !== "webp" ||
        !metadata.width ||
        !metadata.height ||
        metadata.width < 320 ||
        metadata.height < 320 ||
        (view === "wide"
          ? metadata.width <= metadata.height
          : metadata.width >= metadata.height)
      )
        throw new ServiceError("Format d’aperçu incorrect.");
      const bytes = await image
        .resize({
          width: view === "wide" ? 1920 : 720,
          withoutEnlargement: true,
        })
        .webp({ quality: 88 })
        .toBuffer();
      // A second read rejects edits made while decoding the image.
      if (fingerprint !== arrivalFingerprint(await getPublicData()))
        throw new ServiceError("La galerie a changé.", 409);
      await storeBrowserArrival(data, room, view, bytes);
    }
    return success({ saved: true, fingerprint });
  } catch (error) {
    return failure(error);
  }
}
