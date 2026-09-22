import "server-only";
import { BlobPreconditionFailedError, get, head, put } from "@vercel/blob";
import type { LocalStore, UploadRecord } from "./local";
import { roomLayoutDraftsSchema } from "@/lib/admin/room-layout";
import {
  artworkSchema,
  blankSettings,
  settingsSchema,
  ServiceError,
} from "@/lib/validation/artwork";

const CATALOG_PATH = "museum/catalog.json";

function emptyStore(): LocalStore {
  return { artworks: [], settings: blankSettings, rooms: ["room-1"] };
}

function parseUploads(value: unknown): UploadRecord[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("uploads");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("upload");
    const upload = item as Record<string, unknown>;
    if (
      typeof upload.id !== "string" ||
      typeof upload.artworkId !== "string" ||
      typeof upload.ownerId !== "string" ||
      !["pending", "ready", "failed"].includes(String(upload.status)) ||
      typeof upload.path !== "string" ||
      typeof upload.createdAt !== "number"
    )
      throw new Error("upload");
    return upload as unknown as UploadRecord;
  });
}

function parseStore(value: unknown): LocalStore {
  if (!value || typeof value !== "object") throw new Error("store");
  const store = value as Record<string, unknown>;
  if (
    !Array.isArray(store.artworks) ||
    !Array.isArray(store.rooms) ||
    !store.rooms.every(
      (room) => typeof room === "string" && /^room-[1-4]$/.test(room),
    ) ||
    new Set(store.rooms).size !== store.rooms.length
  )
    throw new Error("rooms");
  return {
    artworks: store.artworks.map((artwork) => artworkSchema.parse(artwork)),
    settings: settingsSchema.parse(store.settings),
    rooms: store.rooms,
    uploads: parseUploads(store.uploads),
    roomLayoutDrafts:
      store.roomLayoutDrafts === undefined
        ? undefined
        : roomLayoutDraftsSchema.parse(store.roomLayoutDrafts),
  };
}

async function readWithEtag(forWrite = false) {
  try {
    const result = await get(CATALOG_PATH, {
      access: "private",
      useCache: false,
    });
    if (!result) return { store: emptyStore(), etag: null as string | null };
    if (result.statusCode !== 200 || !result.stream)
      throw new Error("Réponse de stockage incomplète");
    const raw = await new Response(result.stream).json();
    let etag = result.blob.etag;
    if (forWrite && etag.startsWith("W/")) {
      // The CDN compresses larger JSON responses and returns a weak GET ETag.
      // Conditional writes need the origin's strong validator. Check that it
      // still describes this exact read before accepting it for the write.
      const metadata = await head(CATALOG_PATH);
      if (etag.slice(2) !== metadata.etag)
        throw new ServiceError(
          "Le catalogue a changé pendant la lecture. Réessayez.",
          409,
        );
      etag = metadata.etag;
    }
    return { store: parseStore(raw), etag };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "BlobNotFoundError"
    )
      return { store: emptyStore(), etag: null as string | null };
    if (error instanceof ServiceError) throw error;
    throw new ServiceError("Le catalogue est momentanément indisponible.", 503);
  }
}

export async function readBlob(): Promise<LocalStore> {
  return (await readWithEtag()).store;
}

const queueState = globalThis as typeof globalThis & {
  museumBlobWriteQueue?: Promise<unknown>;
};

export function mutateBlob<T>(
  fn: (store: LocalStore) => T | Promise<T>,
): Promise<T> {
  const operation = (queueState.museumBlobWriteQueue || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const { store, etag } = await readWithEtag(true);
        const candidate = structuredClone(store);
        const result = await fn(candidate);
        try {
          await put(CATALOG_PATH, JSON.stringify(candidate), {
            access: "private",
            contentType: "application/json",
            cacheControlMaxAge: 60,
            ...(etag
              ? { allowOverwrite: true, ifMatch: etag }
              : { allowOverwrite: false }),
          });
          return result;
        } catch (error) {
          if (error instanceof BlobPreconditionFailedError || !etag) continue;
          throw error;
        }
      }
      throw new ServiceError(
        "Le catalogue a été modifié simultanément. Réessayez.",
        409,
      );
    });
  queueState.museumBlobWriteQueue = operation;
  return operation;
}
