export const CATALOGUE_CHANGED = "museum-catalogue-changed";

/** A refresh signal only: never put artwork payloads or credentials in storage. */
export function notifyCatalogueChanged() {
  window.dispatchEvent(new Event(CATALOGUE_CHANGED));
  try {
    localStorage.setItem(CATALOGUE_CHANGED, crypto.randomUUID());
  } catch {
    // Storage may be disabled; focus refresh remains available.
  }
  try {
    const channel = new BroadcastChannel(CATALOGUE_CHANGED);
    channel.postMessage("refresh");
    channel.close();
  } catch {
    // Older browsers receive the storage or focus event instead.
  }
}
