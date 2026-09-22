import "server-only";
import { readLocal, localRoot } from "@/lib/data/local";
import { publicArtwork } from "@/lib/validation/artwork";
import { normalizeCollectionOrder } from "@/lib/data/collections";
import type { PublicData } from "@/lib/data/types";
import { arrivalFingerprint } from "./arrival";
import {
  arrivalCaptureOrigin,
  ArrivalGenerationQueue,
} from "./arrivalGeneration";
import { arrivalReady } from "./arrivalImage";
import { captureArrivalBatch } from "./arrivalCapture";

const state = globalThis as typeof globalThis & {
  museumArrivalQueue?: ArrivalGenerationQueue;
};
async function localPublicSnapshot(): Promise<PublicData> {
  const store = await readLocal();
  return {
    mode: "demo",
    rooms: store.rooms,
    settings: store.settings,
    artworks: normalizeCollectionOrder(
      store.artworks.filter((a) => a.publication === "published"),
      store.rooms,
    ).map(publicArtwork),
  };
}
function queue() {
  return (state.museumArrivalQueue ??= new ArrivalGenerationQueue({
    capture: captureArrivalBatch,
    // Deliberately avoid persisting a request/cookie context in the background
    // queue. Only explicitly enabled local public data is ever captured.
    readData: localPublicSnapshot,
  }));
}
export async function arrivalStatus(data: PublicData) {
  const fingerprint = arrivalFingerprint(data);
  const origin = arrivalCaptureOrigin(process.env);
  const supported = data.mode === "demo" && !!origin;
  const ready = await arrivalReady(data, localRoot());
  const retryAfterMs = supported ? queue().retryAfter(fingerprint) : 0;
  return {
    fingerprint,
    ready,
    supported: supported || data.mode === "blob" || data.mode === "demo",
    captureMethod: supported
      ? "server"
      : ["demo", "blob"].includes(data.mode)
        ? "browser"
        : null,
    ...(retryAfterMs
      ? {
          error:
            "L’aperçu sera réessayé automatiquement. Le fond sans œuvres reste affiché.",
          retryAfterMs,
        }
      : {}),
  };
}
export function scheduleArrival(
  data: PublicData,
  after: (callback: () => Promise<void>) => void,
) {
  const origin = arrivalCaptureOrigin(process.env);
  if (data.mode !== "demo" || !origin) return;
  const worker = queue();
  worker.enqueue({ data, local: localRoot(), origin });
  after(() => worker.drain());
}

/** Warm the next arrival image as soon as an authorised edit is saved. */
export function refreshArrivalAfterSave(
  after: (callback: () => Promise<void>) => void,
) {
  const origin = arrivalCaptureOrigin(process.env);
  if (!origin) return;
  after(async () => {
    try {
      const worker = queue();
      worker.enqueue({
        data: await localPublicSnapshot(),
        local: localRoot(),
        origin,
      });
      await worker.drain();
    } catch (error) {
      // Saving already succeeded; the public image endpoint will retry a failed warm-up.
      console.error("Arrival preview refresh failed", error);
    }
  });
}
