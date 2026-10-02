import {
  normalizeCollectionOrder,
  insertInCollection,
  moveToCollection,
  collectionKey,
} from "./collections";
import { headers } from "next/headers";
import { cache } from "react";
import {
  contactConfigured,
  effectiveContactSettings,
} from "@/lib/contact/config";
import type { AdminArtwork, PublicData, SiteSettings } from "./types";
import {
  isDemo,
  isBlob,
  requireAdmin,
  supabaseSession,
  assertLocalHost,
} from "@/lib/auth/server";
import { mutateLocal, readLocal } from "./local";
import { mutateBlob, readBlob } from "./blob";
import { getSlots } from "@/lib/museum/config";
import {
  artworkSchema,
  publicArtwork,
  resolvePlacement,
  ServiceError,
  settingsSchema,
  blankSettings,
} from "@/lib/validation/artwork";
export const getPublicData = cache(async (): Promise<PublicData> => {
  if (isDemo()) {
    assertLocalHost((await headers()).get("host"));
    const data = await readLocal();
    return {
      mode: "demo",
      contactEnabled: false,
      settings: data.settings,
      rooms: data.rooms,
      artworks: normalizeCollectionOrder(
        data.artworks.filter((a) => a.publication === "published"),
        data.rooms,
      ).map(publicArtwork),
    };
  }
  if (isBlob()) {
    await headers();
    const data = await readBlob();
    const settings = effectiveContactSettings(data.settings);
    return {
      mode: "blob",
      contactEnabled: contactConfigured(settings.email),
      settings,
      rooms: data.rooms,
      artworks: normalizeCollectionOrder(
        data.artworks.filter((a) => a.publication === "published"),
        data.rooms,
      ).map(publicArtwork),
    };
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
    return {
      mode: "supabase",
      artworks: [],
      settings: blankSettings,
      rooms: ["room-1"],
    };
  const client = await supabaseSession();
  const { data, error } = await client.rpc("get_public_museum");
  if (error)
    throw new ServiceError("Le catalogue est momentanément indisponible.", 503);
  return {
    ...data,
    artworks: normalizeCollectionOrder(data.artworks, data.rooms),
    mode: "supabase",
    contactEnabled: contactConfigured(data.settings.email),
  };
});
export async function getAdminData() {
  await requireAdmin();
  if (isDemo() || isBlob()) {
    const data = isDemo() ? await readLocal() : await readBlob();
    return {
      ...data,
      settings: isBlob()
        ? effectiveContactSettings(data.settings)
        : data.settings,
      artworks: normalizeCollectionOrder(data.artworks, data.rooms),
    };
  }
  const client = await supabaseSession();
  const [artworks, settings, rooms] = await Promise.all([
    client.from("artworks").select("payload"),
    client.from("site_settings").select("payload").eq("id", 1).single(),
    client.from("rooms").select("id").order("sort_order"),
  ]);
  if (artworks.error || settings.error || rooms.error)
    throw new ServiceError("Impossible de charger l’administration.", 503);
  return {
    artworks: normalizeCollectionOrder(
      (artworks.data || []).map((x) => x.payload) as AdminArtwork[],
      (rooms.data || []).map((r) => r.id),
    ),
    settings: settings.data!.payload as SiteSettings,
    rooms: (rooms.data || []).map((r) => r.id),
  };
}
function prepareCollectionChange(
  a: AdminArtwork,
  old: AdminArtwork | undefined,
  all: AdminArtwork[],
  collectionRooms: Record<string, string> = {},
) {
  if (!old || collectionKey(old.collection) === collectionKey(a.collection))
    return a;
  const moved = moveToCollection(a, a.collection, all, collectionRooms);
  // Keep a deliberate wall selection in the destination room; reset only stale old placement.
  if (
    a.roomId === moved.roomId &&
    a.slotId !== old.slotId &&
    a.slotId.startsWith(`${moved.roomId}-slot-`)
  )
    return a;
  return { ...moved, order: a.order };
}
export async function saveArtwork(raw: unknown) {
  await requireAdmin();
  const parsed = artworkSchema.safeParse(raw);
  if (!parsed.success)
    throw new ServiceError(parsed.error.issues.map((x) => x.message).join(" "));
  const a = parsed.data;
  if (isDemo() || isBlob()) {
    const mutate = isDemo() ? mutateLocal : mutateBlob;
    return mutate((data) => {
      const old = data.artworks.find((x) => x.id === a.id);
      if ((old?.revision || 0) !== a.revision)
        throw new ServiceError(
          "Cette œuvre a été modifiée depuis son ouverture. Rechargez-la avant de réessayer.",
          409,
        );
      if (data.artworks.some((x) => x.id !== a.id && x.slug === a.slug))
        throw new ServiceError("Cet identifiant de lien existe déjà.", 409);
      if (
        a.image !== old?.image ||
        a.mediaId !== old?.mediaId ||
        a.imageWidth !== old?.imageWidth ||
        a.imageHeight !== old?.imageHeight
      ) {
        if (a.image || a.mediaId)
          throw new ServiceError(
            "L’image doit être téléversée et traitée par le serveur.",
          );
      }
      const next = {
        ...resolvePlacement(
          prepareCollectionChange(
            a,
            old,
            data.artworks,
            data.settings.collectionRooms,
          ),
          data.artworks,
          data.rooms,
          data.settings.collectionRooms,
        ),
        revision: a.revision + 1,
      };
      data.artworks = insertInCollection(next, data.artworks, data.rooms);
      return data.artworks.find((x) => x.id === a.id)!;
    });
  }
  const data = await getAdminData();
  const old = data.artworks.find((x) => x.id === a.id);
  const next = resolvePlacement(
    prepareCollectionChange(
      a,
      old,
      data.artworks,
      data.settings.collectionRooms,
    ),
    data.artworks,
    data.rooms,
    data.settings.collectionRooms,
  );
  const client = await supabaseSession();
  const { data: saved, error } = await client.rpc("save_artwork", {
    candidate: next,
  });
  if (error) throw new ServiceError(error.message, 409);
  return saved as AdminArtwork;
}
export async function saveSettings(raw: unknown) {
  await requireAdmin();
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success)
    throw new ServiceError("Vérifiez les textes et l’adresse email.");
  if (isDemo() || isBlob()) {
    const mutate = isDemo() ? mutateLocal : mutateBlob;
    return mutate(
      (data) =>
        (data.settings = {
          ...parsed.data,
          collectionRooms: data.settings.collectionRooms,
          collectionDescriptions: {
            ...data.settings.collectionDescriptions,
            ...parsed.data.collectionDescriptions,
          },
        }),
    );
  }
  const client = await supabaseSession();
  const { error } = await client
    .from("site_settings")
    .update({ payload: parsed.data })
    .eq("id", 1);
  if (error) throw new ServiceError("Enregistrement impossible.", 503);
  return parsed.data;
}
export async function addRoom() {
  await requireAdmin();
  if (isDemo() || isBlob()) {
    const mutate = isDemo() ? mutateLocal : mutateBlob;
    return mutate((data) => {
      if (data.rooms.length >= 4)
        throw new ServiceError("Cette version accepte quatre salles.");
      const terminalRoom = data.rooms.at(-1)!;
      const centralZone = getSlots(terminalRoom).find(
        (slot) => slot.terminalOnly,
      );
      if (
        centralZone &&
        data.artworks.some(
          (a) =>
            a.publication === "published" &&
            a.roomId === terminalRoom &&
            a.slotId === centralZone.id,
        )
      )
        throw new ServiceError(
          "Déplacez d’abord les tableaux de D centre dans la salle 2 : l’ajout d’une salle ouvre un passage à cet endroit.",
          409,
        );
      const id = `room-${data.rooms.length + 1}`;
      data.rooms.push(id);
      return id;
    });
  }
  const client = await supabaseSession();
  const { data, error } = await client.rpc("add_museum_room");
  if (error) throw new ServiceError(error.message, 409);
  return data as string;
}

/** Empty collections persist in settings; creation never moves existing works. */
export async function createCollection(raw: unknown) {
  await requireAdmin();
  const input = raw as { name?: unknown; roomId?: unknown } | null;
  if (
    !input ||
    typeof input.name !== "string" ||
    typeof input.roomId !== "string"
  )
    throw new ServiceError("Renseignez le nom de la collection et sa salle.");
  const name = input.name.trim();
  if (
    !name ||
    name.length > 200 ||
    ["__proto__", "constructor", "prototype"].includes(collectionKey(name))
  )
    throw new ServiceError(
      "Choisissez un nom de collection de 1 à 200 caractères.",
    );
  if (!isDemo() && !isBlob())
    throw new ServiceError(
      "La création de collections nécessite le stockage Blob.",
      503,
    );
  const mutate = isDemo() ? mutateLocal : mutateBlob;
  return mutate((store) => {
    if (!store.rooms.includes(input.roomId as string))
      throw new ServiceError("Cette salle n’existe pas.");
    const names = [
      ...Object.keys(store.settings.collectionRooms ?? {}),
      ...store.artworks.map((a) => a.collection),
    ];
    if (
      names.some((existing) => collectionKey(existing) === collectionKey(name))
    )
      throw new ServiceError(
        "Une collection porte déjà ce nom. Sélectionnez-la dans la liste.",
        409,
      );
    store.settings.collectionRooms = {
      ...store.settings.collectionRooms,
      [name]: input.roomId as string,
    };
    store.settings.collectionDescriptions = {
      ...store.settings.collectionDescriptions,
      [name]: "",
    };
    return { name, roomId: input.roomId as string };
  });
}
