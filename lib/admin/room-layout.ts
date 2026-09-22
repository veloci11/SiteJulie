import { z } from "zod";
import type { AdminArtwork } from "@/lib/data/types";
import { getSlots, MIN_DISPLAY_SCALE } from "@/lib/museum/config";
import { placementIssue } from "@/lib/validation/placement";
import { normalizeZoneArtwork } from "@/lib/museum/zones";

export const roomIdSchema = z.string().regex(/^room-[1-4]$/);
export const roomLayoutItemSchema = z
  .object({
    artworkId: z.string().min(1).max(200),
    revision: z.number().int().nonnegative(),
    slotId: z.string().max(100).nullable(),
    previousSlotId: z.string().max(100).optional(),
    placementOffsetX: z.number().finite().min(-10).max(10),
    placementOffsetY: z.number().finite().min(-10).max(10),
    displayScale: z.number().min(MIN_DISPLAY_SCALE).max(1),
  })
  .strict();
export const roomLayoutPlanSchema = z
  .object({
    roomId: roomIdSchema,
    items: z.array(roomLayoutItemSchema).max(500),
  })
  .strict();
export const roomLayoutDraftSchema = z
  .object({
    version: z.string().uuid(),
    savedAt: z.string().datetime(),
    plan: roomLayoutPlanSchema,
  })
  .strict();
export const roomLayoutDraftsSchema = z
  .record(roomIdSchema, roomLayoutDraftSchema)
  .refine((drafts) =>
    Object.entries(drafts).every(([room, draft]) => draft.plan.roomId === room),
  );
export type RoomLayoutItem = z.infer<typeof roomLayoutItemSchema>;
export type RoomLayoutPlan = z.infer<typeof roomLayoutPlanSchema>;
export type RoomLayoutDraft = z.infer<typeof roomLayoutDraftSchema>;
export type RoomLayoutSession = {
  roomId: string;
  artworks: AdminArtwork[];
  draft: RoomLayoutDraft | null;
};
export function normalizeRoomLayout(
  plan: RoomLayoutPlan,
  artworks: AdminArtwork[],
): RoomLayoutPlan {
  return {
    ...plan,
    items: plan.items.map((item) => {
      const original = artworks.find((a) => a.id === item.artworkId);
      if (!original) return item;
      const a = normalizeZoneArtwork({
        ...original,
        ...item,
        slotId: item.slotId || item.previousSlotId || original.slotId,
      });
      return {
        ...item,
        slotId: item.slotId === null ? null : a.slotId,
        previousSlotId: a.slotId,
        displayScale: a.displayScale ?? 1,
        placementOffsetX: a.placementOffsetX ?? 0,
        placementOffsetY: a.placementOffsetY ?? 0,
      };
    }),
  };
}
export function makeRoomLayout(
  roomId: string,
  artworks: AdminArtwork[],
): RoomLayoutPlan {
  return {
    roomId,
    items: artworks
      .filter((a) => a.roomId === roomId && a.publication === "published")
      .map(normalizeZoneArtwork)
      .map((a) => ({
        artworkId: a.id,
        revision: a.revision,
        slotId: a.slotId || null,
        previousSlotId: a.slotId || undefined,
        placementOffsetX: a.placementOffsetX ?? 0,
        placementOffsetY: a.placementOffsetY ?? 0,
        displayScale: a.displayScale ?? 1,
      })),
  };
}
export function layoutSnapshotMatches(
  plan: RoomLayoutPlan,
  artworks: AdminArtwork[],
) {
  const current = artworks.filter(
    (a) => a.roomId === plan.roomId && a.publication === "published",
  );
  return (
    current.length === plan.items.length &&
    new Set(plan.items.map((item) => item.artworkId)).size === current.length &&
    plan.items.every((item) =>
      current.some(
        (a) => a.id === item.artworkId && a.revision === item.revision,
      ),
    )
  );
}
export function layoutArtworks(plan: RoomLayoutPlan, artworks: AdminArtwork[]) {
  return plan.items.flatMap((item) => {
    const original = artworks.find((a) => a.id === item.artworkId);
    return original
      ? [
          normalizeZoneArtwork({
            ...original,
            slotId: item.slotId ?? "",
            placementOffsetX: item.placementOffsetX,
            placementOffsetY: item.placementOffsetY,
            displayScale: item.displayScale,
          }),
        ]
      : [];
  });
}
export function layoutIssues(plan: RoomLayoutPlan, artworks: AdminArtwork[]) {
  const candidates = layoutArtworks(plan, artworks);
  const slots = getSlots(plan.roomId);
  return candidates.flatMap((a) => {
    if (!a.slotId) return [];
    const slot = slots.find((slot) => slot.id === a.slotId);
    const message = !slot
      ? "L’emplacement ne fait pas partie de cette salle."
      : placementIssue(a, slot, candidates);
    return message ? [{ artworkId: a.id, message }] : [];
  });
}
