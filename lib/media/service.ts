import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  get as getBlobObject,
  issueSignedToken,
  presignUrl,
  put as putBlobObject,
} from "@vercel/blob";
import {
  isBlob,
  isDemo,
  requireAdmin,
  supabaseSession,
} from "@/lib/auth/server";
import { localRoot, mutateLocal, readLocal } from "@/lib/data/local";
import { mutateBlob, readBlob } from "@/lib/data/blob";
import { ServiceError } from "@/lib/validation/artwork";
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const variants = { thumb: 320, room: 1536, detail: 2560 } as const;
export type Variant = keyof typeof variants;
const uploadContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "application/octet-stream",
];

async function createPrivateUrl(pathname: string, operation: "get" | "put") {
  const validUntil = Date.now() + (operation === "get" ? 60_000 : 15 * 60_000);
  const constraints =
    operation === "put"
      ? {
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          allowedContentTypes: uploadContentTypes,
          addRandomSuffix: false,
          allowOverwrite: false,
        }
      : {};
  const signed = await issueSignedToken({
    pathname,
    operations: [operation],
    validUntil,
    ...constraints,
  });
  const { presignedUrl } = await presignUrl(signed, {
    access: "private",
    operation,
    pathname,
    validUntil,
    ...constraints,
  });
  return presignedUrl;
}
export async function processImage(buffer: Buffer) {
  if (buffer.length > MAX_UPLOAD_BYTES)
    throw new ServiceError("Image trop lourde (20 Mio maximum).");
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: 25_000_000 }).metadata();
  } catch {
    throw new ServiceError(
      "Ce fichier n’est pas une image valide ou dépasse 25 mégapixels.",
    );
  }
  if (!["jpeg", "png", "webp", "heif", "avif"].includes(meta.format || ""))
    throw new ServiceError("Formats acceptés : JPEG, PNG, WebP et AVIF.");
  const outputs = await Promise.all(
    Object.entries(variants).map(async ([variant, width]) => ({
      variant: variant as Variant,
      buffer: await sharp(buffer, { limitInputPixels: 25_000_000 })
        .rotate()
        .toColourspace("srgb")
        .resize({ width, withoutEnlargement: true })
        .webp(
          variant === "detail"
            ? { lossless: true }
            : { quality: variant === "room" ? 94 : 90, smartSubsample: true },
        )
        .toBuffer(),
    })),
  );
  const info = await sharp(outputs[outputs.length - 1].buffer).metadata();
  return { outputs, width: info.width!, height: info.height! };
}
export async function createUpload(artworkId: string) {
  const admin = await requireAdmin();
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(artworkId))
    throw new ServiceError("Œuvre invalide.");
  const id = randomUUID();
  if (isDemo()) {
    await mutateLocal((data) => {
      if (!data.artworks.some((a) => a.id === artworkId))
        throw new ServiceError("Enregistrez le brouillon avant son image.");
      (data.uploads ??= []).push({
        id,
        artworkId,
        ownerId: admin.id,
        status: "pending",
        path: `sources/${id}`,
        createdAt: Date.now(),
      });
    });
    return { id, url: `/api/admin/upload?id=${id}`, method: "PUT", demo: true };
  }
  if (isBlob()) {
    const objectPath = `museum/sources/${artworkId}/${id}/source`;
    await mutateBlob((data) => {
      if (!data.artworks.some((a) => a.id === artworkId))
        throw new ServiceError("Enregistrez le brouillon avant son image.");
      (data.uploads ??= []).push({
        id,
        artworkId,
        ownerId: admin.id,
        status: "pending",
        path: objectPath,
        createdAt: Date.now(),
      });
    });
    return {
      id,
      url: await createPrivateUrl(objectPath, "put"),
      method: "PUT",
      demo: false,
    };
  }
  const client = await supabaseSession();
  const objectPath = `${admin.id}/${artworkId}/${id}/source`;
  const { error } = await client.from("media_uploads").insert({
    id,
    artwork_id: artworkId,
    owner_id: admin.id,
    path: objectPath,
    status: "pending",
  });
  if (error) throw new ServiceError("Création du téléversement impossible.");
  const { data, error: signError } = await client.storage
    .from("museum-private")
    .createSignedUploadUrl(objectPath);
  if (signError || !data)
    throw new ServiceError("Signature du téléversement impossible.");
  return {
    id,
    url: data.signedUrl,
    token: data.token,
    path: data.path,
    method: "PUT",
    demo: false,
  };
}
export async function putLocalUpload(id: string, request: Request) {
  const admin = await requireAdmin();
  if (!isDemo())
    throw new ServiceError("Téléversez directement dans le stockage privé.");
  const data = await readLocal();
  const upload = data.uploads?.find(
    (u) =>
      u.id === id &&
      u.ownerId === admin.id &&
      u.status === "pending" &&
      Date.now() - u.createdAt < 3600000,
  );
  if (!upload) throw new ServiceError("Téléversement inconnu ou expiré.", 404);
  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > MAX_UPLOAD_BYTES)
    throw new ServiceError("Image trop lourde.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError("Fichier vide.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      throw new ServiceError("Image trop lourde.", 413);
    }
    chunks.push(value);
  }
  await mkdir(path.join(localRoot(), "sources"), { recursive: true });
  await writeFile(path.join(localRoot(), upload.path), Buffer.concat(chunks), {
    mode: 0o600,
    flag: "wx",
  });
  return { ok: true };
}
export async function completeUpload(id: string) {
  const admin = await requireAdmin();
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new ServiceError("Téléversement invalide.");
  if (isDemo()) {
    const data = await readLocal();
    const upload = data.uploads?.find(
      (u) => u.id === id && u.ownerId === admin.id && u.status === "pending",
    );
    if (!upload) throw new ServiceError("Téléversement introuvable.", 404);
    try {
      const original = await readFile(
        /* turbopackIgnore: true */ path.join(localRoot(), upload.path),
      );
      const decoded = await processImage(original);
      await mkdir(path.join(localRoot(), "media"), { recursive: true });
      await Promise.all(
        decoded.outputs.map((o) =>
          writeFile(
            path.join(localRoot(), "media", `${id}-${o.variant}.webp`),
            o.buffer,
          ),
        ),
      );
      return await mutateLocal((store) => {
        const record = store.uploads!.find((u) => u.id === id)!;
        const artwork = store.artworks.find((a) => a.id === record.artworkId)!;
        record.status = "ready";
        artwork.mediaId = id;
        artwork.imageWidth = decoded.width;
        artwork.imageHeight = decoded.height;
        artwork.image = `/api/media/${artwork.id}?variant=room&v=${id}`;
        artwork.thumbnail = `/api/media/${artwork.id}?variant=thumb&v=${id}`;
        artwork.detailImage = `/api/media/${artwork.id}?variant=detail&v=${id}`;
        artwork.revision++;
        return artwork;
      });
    } catch (error) {
      await mutateLocal((store) => {
        const record = store.uploads!.find((u) => u.id === id)!;
        record.status = "failed";
        record.error = "Traitement impossible. Réessayez avec une autre image.";
      });
      throw error;
    }
  }
  if (isBlob()) {
    const data = await readBlob();
    const upload = data.uploads?.find(
      (u) => u.id === id && u.ownerId === admin.id && u.status === "pending",
    );
    if (!upload) throw new ServiceError("Téléversement introuvable.", 404);
    try {
      const source = await getBlobObject(upload.path, {
        access: "private",
        useCache: false,
      });
      if (!source || source.statusCode !== 200 || !source.stream)
        throw new ServiceError("Le fichier téléversé est introuvable.");
      if (source.blob.size > MAX_UPLOAD_BYTES)
        throw new ServiceError("Image trop lourde.");
      const original = Buffer.from(
        await new Response(source.stream).arrayBuffer(),
      );
      const decoded = await processImage(original);
      const base = `museum/media/${upload.artworkId}/${upload.id}`;
      await Promise.all(
        decoded.outputs.map((output) =>
          putBlobObject(`${base}/${output.variant}.webp`, output.buffer, {
            access: "private",
            contentType: "image/webp",
            addRandomSuffix: false,
            allowOverwrite: true,
            cacheControlMaxAge: 31536000,
          }),
        ),
      );
      return await mutateBlob((store) => {
        const record = store.uploads?.find(
          (candidate) =>
            candidate.id === id &&
            candidate.ownerId === admin.id &&
            candidate.status === "pending",
        );
        const artwork = store.artworks.find(
          (candidate) => candidate.id === upload.artworkId,
        );
        if (!record || !artwork)
          throw new ServiceError("Téléversement devenu obsolète.", 409);
        record.status = "ready";
        artwork.mediaId = id;
        artwork.imageWidth = decoded.width;
        artwork.imageHeight = decoded.height;
        artwork.image = `/api/media/${artwork.id}?variant=room&v=${id}`;
        artwork.thumbnail = `/api/media/${artwork.id}?variant=thumb&v=${id}`;
        artwork.detailImage = `/api/media/${artwork.id}?variant=detail&v=${id}`;
        artwork.revision++;
        return artwork;
      });
    } catch (error) {
      await mutateBlob((store) => {
        const record = store.uploads?.find((candidate) => candidate.id === id);
        if (record?.status === "pending") {
          record.status = "failed";
          record.error =
            "Traitement impossible. Réessayez avec une autre image.";
        }
      });
      throw error;
    }
  }
  const client = await supabaseSession();
  const { data: upload, error } = await client
    .from("media_uploads")
    .select("*")
    .eq("id", id)
    .eq("owner_id", admin.id)
    .eq("status", "pending")
    .single();
  if (error || !upload)
    throw new ServiceError("Téléversement introuvable.", 404);
  try {
    const { data: blob, error: downloadError } = await client.storage
      .from("museum-private")
      .download(upload.path);
    if (downloadError || !blob)
      throw new ServiceError("Le fichier téléversé est introuvable.");
    if (blob.size > MAX_UPLOAD_BYTES)
      throw new ServiceError("Image trop lourde.");
    const decoded = await processImage(Buffer.from(await blob.arrayBuffer()));
    const base = upload.path.replace(/\/source$/, "");
    for (const output of decoded.outputs) {
      const { error: writeError } = await client.storage
        .from("museum-private")
        .upload(`${base}/${output.variant}.webp`, output.buffer, {
          contentType: "image/webp",
          upsert: true,
        });
      if (writeError)
        throw new ServiceError("Création des variantes impossible.");
    }
    const { finalizeProcessedUpload } = await import("./signer");
    return await finalizeProcessedUpload(
      id,
      decoded.width,
      decoded.height,
      admin.id,
    );
  } catch (error) {
    await client
      .from("media_uploads")
      .update({ status: "failed" })
      .eq("id", id)
      .eq("owner_id", admin.id);
    throw error;
  }
}
export async function getMedia(id: string, variant: Variant) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id))
    throw new ServiceError("Image introuvable.", 404);
  if (isDemo()) {
    const store = await readLocal();
    const artwork = store.artworks.find((a) => a.id === id);
    if (!artwork) throw new ServiceError("Image introuvable.", 404);
    if (artwork.publication !== "published") await requireAdmin();
    try {
      return {
        buffer: await readFile(
          /* turbopackIgnore: true */ path.join(
            localRoot(),
            "media",
            `${artwork.mediaId || artwork.id}-${variant}.webp`,
          ),
        ),
      };
    } catch {
      throw new ServiceError("Image introuvable.", 404);
    }
  }
  if (isBlob()) {
    const store = await readBlob();
    const artwork = store.artworks.find((candidate) => candidate.id === id);
    if (!artwork) throw new ServiceError("Image introuvable.", 404);
    if (artwork.publication !== "published") await requireAdmin();
    const upload = store.uploads?.find(
      (candidate) =>
        candidate.id === artwork.mediaId && candidate.status === "ready",
    );
    if (!upload) throw new ServiceError("Image introuvable.", 404);
    const pathname = `museum/media/${artwork.id}/${upload.id}/${variant}.webp`;
    return { url: await createPrivateUrl(pathname, "get") };
  }
  const client = await supabaseSession();
  let { data, error } = await client.rpc("get_public_media_path", {
    artwork_key: id,
    image_variant: variant,
  });
  if (error || !data) {
    await requireAdmin();
    const result = await client
      .from("artworks")
      .select("payload")
      .eq("id", id)
      .single();
    const media = result.data?.payload.mediaId;
    if (!media) throw new ServiceError("Image introuvable.", 404);
    const upload = await client
      .from("media_uploads")
      .select("path")
      .eq("id", media)
      .eq("status", "ready")
      .single();
    if (!upload.data) throw new ServiceError("Image introuvable.", 404);
    data = upload.data.path.replace(/\/source$/, `/${variant}.webp`);
  }
  // Signed URLs are minted only by the privileged server module after publication/role checks.
  const { signApprovedPath } = await import("./signer");
  return { url: await signApprovedPath(data) };
}
