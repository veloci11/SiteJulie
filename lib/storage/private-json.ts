import "server-only";
import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  get,
  head,
  put,
} from "@vercel/blob";
import { ServiceError } from "@/lib/validation/artwork";

// Use the validator belonging to the exact body read, including compressed JSON.
export async function readPrivateJson<T>(
  pathname: string,
): Promise<{ value: T; etag: string } | null> {
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream)
      throw new Error("Incomplete storage response");
    const value = (await new Response(result.stream).json()) as T;
    let etag = result.blob.etag;
    if (etag.startsWith("W/")) {
      const metadata = await head(pathname);
      if (etag.slice(2) !== metadata.etag)
        throw new BlobPreconditionFailedError();
      etag = metadata.etag;
    }
    return { value, etag };
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

// Conditional writes arbitrate between independent Vercel instances.
export async function updatePrivateJson<T, R>(
  pathname: string,
  empty: () => T,
  update: (value: T) => R,
) {
  for (let attempt = 0; attempt < 12; attempt++) {
    let current: Awaited<ReturnType<typeof readPrivateJson<T>>> = null;
    try {
      current = await readPrivateJson<T>(pathname);
      const value = current?.value ?? empty();
      const result = update(value);
      await put(pathname, JSON.stringify(value), {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        cacheControlMaxAge: 60,
        ...(current
          ? { allowOverwrite: true, ifMatch: current.etag }
          : { allowOverwrite: false }),
      });
      return result;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (error instanceof BlobPreconditionFailedError) continue;
      if (
        !current &&
        error instanceof Error &&
        /already exists/i.test(error.message)
      )
        continue;
      throw new ServiceError(
        "Le service est momentanément indisponible. Réessayez dans quelques minutes.",
        503,
      );
    }
  }
  throw new ServiceError(
    "Le service est momentanément occupé. Réessayez dans quelques minutes.",
    503,
  );
}
