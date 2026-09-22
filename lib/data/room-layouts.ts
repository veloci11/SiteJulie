import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isDemo, isBlob, requireAdmin } from "@/lib/auth/server";
import { readLocal, mutateLocal } from "./local";
import { readBlob, mutateBlob } from "./blob";
import { getSlots } from "@/lib/museum/config";
import { ServiceError, resolvePlacement } from "@/lib/validation/artwork";
import {
  layoutSnapshotMatches,
  layoutArtworks,
  roomIdSchema,
  roomLayoutPlanSchema,
  type RoomLayoutSession,
} from "@/lib/admin/room-layout";

async function authorize() {
  await requireAdmin();
  if (!isDemo() && !isBlob())
    throw new ServiceError(
      "Le mode salle nécessite le stockage local ou Blob.",
      503,
    );
}
export async function getRoomLayout(
  roomId: string,
): Promise<RoomLayoutSession> {
  await authorize();
  if (!roomIdSchema.safeParse(roomId).success)
    throw new ServiceError("Salle invalide.");
  const store = isDemo() ? await readLocal() : await readBlob();
  if (!store.rooms.includes(roomId))
    throw new ServiceError("Cette salle n’existe pas.", 404);
  return {
    roomId,
    artworks: store.artworks.filter(
      (a) => a.roomId === roomId && a.publication === "published",
    ),
    draft: store.roomLayoutDrafts?.[roomId] ?? null,
  };
}
const commandSchema = z
  .object({
    action: z.enum(["draft", "apply"]),
    expectedDraftVersion: z.string().uuid().nullable(),
    plan: roomLayoutPlanSchema,
  })
  .strict();
export async function saveRoomLayout(raw: unknown) {
  await authorize();
  const parsed = commandSchema.safeParse(raw);
  if (!parsed.success)
    throw new ServiceError("La disposition envoyée est invalide.");
  const { action, plan, expectedDraftVersion } = parsed.data;
  const mutate = isDemo() ? mutateLocal : mutateBlob;
  return mutate((store) => {
    if (!store.rooms.includes(plan.roomId))
      throw new ServiceError("Cette salle n’existe pas.", 404);
    if (
      (store.roomLayoutDrafts?.[plan.roomId]?.version ?? null) !==
      expectedDraftVersion
    )
      throw new ServiceError(
        "Le brouillon a été modifié dans un autre onglet. Vos essais sont conservés ici ; rechargez la salle pour repartir de la dernière version.",
        409,
      );
    if (!layoutSnapshotMatches(plan, store.artworks))
      throw new ServiceError(
        "La salle ou ses œuvres ont changé depuis l’ouverture. Vos essais sont conservés ici ; rechargez la salle avant de réessayer.",
        409,
      );
    const slots = new Set(getSlots(plan.roomId).map((slot) => slot.id));
    for (const item of plan.items) {
      if (item.slotId === null) continue;
      if (!slots.has(item.slotId))
        throw new ServiceError(
          "Un tableau ne peut pas quitter cette salle dans ce mode.",
          409,
        );
    }
    if (action === "draft") {
      const draft = {
        version: randomUUID(),
        savedAt: new Date().toISOString(),
        plan,
      };
      store.roomLayoutDrafts = {
        ...store.roomLayoutDrafts,
        [plan.roomId]: draft,
      };
      return { action, draft };
    }
    const unplaced = plan.items.filter((item) => !item.slotId).length;
    if (unplaced)
      throw new ServiceError(
        `${unplaced} tableau${unplaced > 1 ? "x restent" : " reste"} dans la réserve. Replacez toutes les œuvres ou enregistrez un brouillon.`,
        409,
      );
    const candidates = layoutArtworks(plan, store.artworks);
    const ids = new Set(candidates.map((a) => a.id));
    const final = [
      ...store.artworks.filter((a) => !ids.has(a.id)),
      ...candidates,
    ];
    // Validate the final arrangement, never the intermediate steps of a swap.
    for (const candidate of candidates)
      resolvePlacement(
        candidate,
        final,
        store.rooms,
        store.settings.collectionRooms,
      );
    let changed = 0;
    store.artworks = store.artworks.map((original) => {
      const candidate = candidates.find((a) => a.id === original.id);
      if (
        !candidate ||
        (candidate.slotId === original.slotId &&
          candidate.displayScale === (original.displayScale ?? 1) &&
          candidate.placementOffsetX === (original.placementOffsetX ?? 0) &&
          candidate.placementOffsetY === (original.placementOffsetY ?? 0))
      )
        return original;
      changed++;
      return { ...candidate, revision: original.revision + 1 };
    });
    if (store.roomLayoutDrafts) delete store.roomLayoutDrafts[plan.roomId];
    return { action, changed };
  });
}
