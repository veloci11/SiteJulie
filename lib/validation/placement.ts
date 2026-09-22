import type { Artwork, AdminArtwork } from "@/lib/data/types";
import {
  artworkSize,
  FRAME_OUTSET,
  MIN_DISPLAY_SCALE,
  getSlots,
  type ArtworkSlot,
} from "@/lib/museum/config";
import { zoneBounds, normalizeZoneArtwork, getZones } from "@/lib/museum/zones";

/** Same envelope and frame dimensions in the editor, server validation and renderer. */
export function placementLimits(artwork: Artwork, slot: ArtworkSlot) {
  const size = artworkSize(artwork, slot);
  const bounds = zoneBounds(slot);
  const horizontal = Math.max(0, bounds.halfWidth - size.width / 2);
  return {
    horizontal,
    vertical: bounds.top - slot.position[1] - size.height / 2,
    minX: -horizontal,
    maxX: horizontal,
    minY: bounds.bottom - slot.position[1] + size.height / 2,
    maxY: bounds.top - slot.position[1] - size.height / 2,
    ...size,
  };
}
export function wallCoordinate(slot: ArtworkSlot) {
  return (
    slot.position[0] * Math.cos(slot.rotationY) -
    slot.position[2] * Math.sin(slot.rotationY)
  );
}
export function wallKey(slot: ArtworkSlot) {
  const angle =
    ((slot.rotationY % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.round(angle / (Math.PI / 2));
}
export function placementIssue(
  artwork: Artwork,
  slot: ArtworkSlot,
  all: readonly AdminArtwork[],
) {
  const limits = placementLimits(artwork, slot);
  const x = artwork.placementOffsetX ?? 0;
  const y = artwork.placementOffsetY ?? 0;
  if (
    x < limits.minX - 0.00001 ||
    x > limits.maxX + 0.00001 ||
    y < limits.minY - 0.00001 ||
    y > limits.maxY + 0.00001
  )
    return "Le cadre dépasse la zone sûre de ce mur. Réduisez la taille d’accrochage ou recentrez le tableau.";
  const center = wallCoordinate(slot) + x;
  const height = slot.position[1] + y;
  for (const other of all) {
    if (
      other.id === artwork.id ||
      other.publication !== "published" ||
      other.roomId !== artwork.roomId
    )
      continue;
    const otherSlot = getSlots(other.roomId).find((s) => s.id === other.slotId);
    if (!otherSlot || wallKey(otherSlot) !== wallKey(slot)) continue;
    const planeDistance = Math.abs(
      slot.wallNormal.reduce(
        (sum, n, i) => sum + n * (slot.position[i] - otherSlot.position[i]),
        0,
      ),
    );
    if (planeDistance > 0.1) continue;
    const otherSize = artworkSize(other, otherSlot);
    const dx = Math.abs(
      center - wallCoordinate(otherSlot) - (other.placementOffsetX ?? 0),
    );
    const dy = Math.abs(
      height - otherSlot.position[1] - (other.placementOffsetY ?? 0),
    );
    if (
      dx < (limits.width + otherSize.width) / 2 + FRAME_OUTSET + 0.04 &&
      dy < (limits.height + otherSize.height) / 2 + FRAME_OUTSET + 0.04
    )
      return `Le cadre chevauche « ${other.title} ». Laissez au moins 4 cm entre les cadres.`;
  }
  return null;
}

/** Resize around the current centre, stopping at the slot edge or a neighbor. */
export function safeDisplayScale(
  artwork: Artwork,
  slot: ArtworkSlot,
  requested: number,
  all: readonly AdminArtwork[],
) {
  const base = artworkSize({ ...artwork, displayScale: 1 }, slot);
  const bounds = zoneBounds(slot);
  const y = slot.position[1] + (artwork.placementOffsetY ?? 0);
  const maximum = Math.min(
    1,
    (2 * bounds.halfWidth - 2 * Math.abs(artwork.placementOffsetX ?? 0)) /
      base.width,
    (2 * Math.min(bounds.top - y, y - bounds.bottom)) / base.height,
  );
  const desired = Math.max(
    MIN_DISPLAY_SCALE,
    Math.min(
      maximum,
      Number.isFinite(requested) ? requested : (artwork.displayScale ?? 1),
    ),
  );
  const valid = (scale: number) =>
    !placementIssue({ ...artwork, displayScale: scale }, slot, all);
  if (valid(desired)) return desired;
  // At a fixed centre, envelopes only expand with scale; binary search keeps
  // both the frame and the required 4cm gap, including lower companion works.
  let low = MIN_DISPLAY_SCALE,
    high = desired;
  if (!valid(low)) return artwork.displayScale ?? 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (valid(mid)) low = mid;
    else high = mid;
  }
  return Math.floor(low * 10000) / 10000;
}

export function resizedScaleFromPointer(
  scale: number,
  base: { width: number; height: number },
  delta: { x: number; y: number },
  pixelsPerMetre: number,
) {
  const w = base.width * pixelsPerMetre,
    h = base.height * pixelsPerMetre;
  return w > 0 && h > 0
    ? scale + (2 * (delta.x * w + delta.y * h)) / (w * w + h * h)
    : scale;
}

/** Stop before a real neighbouring frame, including fast pointer moves. */
export function safePlacementOffsets(
  artwork: Artwork,
  slot: ArtworkSlot,
  desired: { placementOffsetX: number; placementOffsetY: number },
  all: readonly AdminArtwork[],
) {
  const start = {
    placementOffsetX: artwork.placementOffsetX ?? 0,
    placementOffsetY: artwork.placementOffsetY ?? 0,
  };
  const valid = (position: typeof start) =>
    !placementIssue({ ...artwork, ...position }, slot, all);
  if (!valid(start)) return valid(desired) ? desired : start;
  const dx = desired.placementOffsetX - start.placementOffsetX,
    dy = desired.placementOffsetY - start.placementOffsetY;
  const steps = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 100),
  );
  let result = start;
  for (let step = 1; step <= steps; step++) {
    const next = {
      placementOffsetX:
        Math.round((start.placementOffsetX + (dx * step) / steps) * 100) / 100,
      placementOffsetY:
        Math.round((start.placementOffsetY + (dy * step) / steps) * 100) / 100,
    };
    if (!valid(next)) break;
    result = next;
  }
  return result;
}

/** Pointer motion and keyboard offsets use the same centimetre precision/bounds. */
export function dragPlacementOffsets(
  artwork: Artwork,
  slot: ArtworkSlot,
  origin: { x: number; y: number },
  delta: { x: number; y: number },
  viewport: { width: number; height: number },
) {
  const limits = placementLimits(artwork, slot);
  const roundAndClamp = (value: number, min: number, max: number) => {
    return (
      Math.max(
        Math.ceil(min * 100),
        Math.min(Math.floor(max * 100), Math.round(value * 100)),
      ) / 100
    );
  };
  return {
    placementOffsetX: roundAndClamp(
      origin.x +
        (viewport.width > 0
          ? (delta.x / viewport.width) * (slot.maxWidthM + FRAME_OUTSET)
          : 0),
      limits.minX,
      limits.maxX,
    ),
    placementOffsetY: roundAndClamp(
      origin.y -
        (viewport.height > 0
          ? (delta.y / viewport.height) * (slot.maxHeightM + FRAME_OUTSET)
          : 0),
      limits.minY,
      limits.maxY,
    ),
  };
}

/** Rectangle packing candidates align to the zone edges or neighbouring frames. */
export function findZonePlacement(
  a: AdminArtwork,
  slot: ArtworkSlot,
  all: readonly AdminArtwork[],
  shrink = false,
) {
  const source = normalizeZoneArtwork(a);
  const oldSlot =
    getSlots(source.roomId).find((s) => s.id === source.slotId) ??
    getZones(source.roomId)[0];
  const base = artworkSize({ ...source, displayScale: 1 }, slot);
  const initialScale = Math.min(
    1,
    oldSlot
      ? artworkSize(source, oldSlot).height / base.height
      : (source.displayScale ?? 1),
  );
  // New arrivals must keep a readable short side; existing works are never resized.
  const minimum = Math.max(
    MIN_DISPLAY_SCALE,
    0.25 / Math.min(base.width, base.height),
  );
  const atScale = (displayScale: number) => {
    const candidate = {
      ...source,
      slotId: slot.id,
      roomId: slot.roomId,
      displayScale,
    };
    const bounds = placementLimits(candidate, slot);
    const xs = [
      source.slotId === slot.id ? (source.placementOffsetX ?? 0) : 0,
      bounds.minX,
      bounds.maxX,
    ];
    const ys = [
      source.slotId === slot.id ? (source.placementOffsetY ?? 0) : 0,
      bounds.minY,
      bounds.maxY,
    ];
    for (const other of all) {
      if (
        other.id === a.id ||
        other.roomId !== slot.roomId ||
        other.publication !== "published"
      )
        continue;
      const otherSlot = getSlots(other.roomId).find(
        (s) => s.id === other.slotId,
      );
      if (!otherSlot || wallKey(otherSlot) !== wallKey(slot)) continue;
      const size = artworkSize(other, otherSlot);
      const x =
        wallCoordinate(otherSlot) +
        (other.placementOffsetX ?? 0) -
        wallCoordinate(slot);
      const y =
        otherSlot.position[1] +
        (other.placementOffsetY ?? 0) -
        slot.position[1];
      const gapX = (bounds.width + size.width) / 2 + FRAME_OUTSET + 0.041;
      const gapY = (bounds.height + size.height) / 2 + FRAME_OUTSET + 0.041;
      xs.push(x - gapX, x + gapX);
      ys.push(y - gapY, y + gapY);
    }
    const positions = xs
      .flatMap((x) => [Math.floor(x * 100) / 100, Math.ceil(x * 100) / 100])
      .flatMap((x) =>
        ys
          .flatMap((y) => [Math.floor(y * 100) / 100, Math.ceil(y * 100) / 100])
          .map((y) => ({
            x: Math.max(
              Math.ceil(bounds.minX * 100) / 100,
              Math.min(Math.floor(bounds.maxX * 100) / 100, x),
            ),
            y: Math.max(
              Math.ceil(bounds.minY * 100) / 100,
              Math.min(Math.floor(bounds.maxY * 100) / 100, y),
            ),
          })),
      )
      .sort((a, b) => a.x * a.x + a.y * a.y - b.x * b.x - b.y * b.y);
    for (const p of positions) {
      const placed = {
        ...candidate,
        placementOffsetX: p.x,
        placementOffsetY: p.y,
      };
      if (!placementIssue(placed, slot, all)) return placed;
    }
    return null;
  };
  if (shrink && initialScale < minimum) return null;
  const full = atScale(initialScale);
  if (full || !shrink) return full;
  let result = atScale(minimum);
  if (!result) return null;
  let lo = minimum,
    hi = initialScale;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const fit = atScale(mid);
    if (fit) {
      result = fit;
      lo = mid;
    } else hi = mid;
  }
  return result;
}
