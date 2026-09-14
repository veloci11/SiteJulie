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
function queue() {
  return (state.museumArrivalQueue ??= new ArrivalGenerationQueue({
    capture: captureArrivalBatch,
    // Deliberately avoid persisting a request/cookie context in the background
    // queue. Only explicitly enabled local public data is ever captured.
    readData: async () => {
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
    },
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
    supported,
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
