import { z } from "zod";
import { collectionFitsRoom } from "@/lib/data/collections";
import type { AdminArtwork, Artwork, SiteSettings } from "@/lib/data/types";
import { getSlots } from "@/lib/museum/config";
import { placementIssue } from "./placement";
export class ServiceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const optionalNumber = z.number().finite().positive().max(100000).nullable();
export const artworkSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9-]+$/),
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(6000),
    technique: z.string().max(200).nullable(),
    widthCm: optionalNumber,
    heightCm: optionalNumber,
    year: z.number().int().min(1000).max(2200).nullable(),
    imageWidth: z.number().int().nonnegative(),
    imageHeight: z.number().int().nonnegative(),
    image: z.string().max(500),
    thumbnail: z.string().max(500),
    detailImage: z.string().max(500),
    alt: z.string().max(500),
    priceMinor: z.number().int().min(0).max(10000000000).nullable(),
    currency: z.enum(["EUR", "CHF", "USD"]),
    availability: z.enum([
      "available",
      "reserved",
      "sold",
      "private_collection",
    ]),
    publication: z.enum(["draft", "published", "archived"]),
    priceVisibility: z.enum(["public", "on_request"]),
    roomId: z.string().regex(/^room-[1-9]\d*$/),
    slotId: z.string().max(80),
    frameStyle: z.enum(["brass", "oak", "white"]),
    placementOffsetX: z.number().finite().min(-5).max(5).default(0),
    placementOffsetY: z.number().finite().min(-5).max(5).default(0),
    displayScale: z.number().finite().min(0.35).max(1).default(1),
    order: z.number().int().min(0).max(100000),
    collection: z.string().trim().max(200),
    revision: z.number().int().min(0),
    mediaId: z.string().max(80).optional(),
  })
  .superRefine((a, ctx) => {
    if (a.priceVisibility === "public" && a.priceMinor === null)
      ctx.addIssue({
        code: "custom",
        message: "Un prix public doit être renseigné.",
        path: ["priceMinor"],
      });
  });
export const settingsSchema = z.object({
  artistName: z.string().trim().max(100),
  tagline: z.string().max(200),
  heroTitle: z.string().max(200),
  aboutTitle: z.string().max(100),
  aboutText: z.string().max(10000),
  contactTitle: z.string().max(100),
  contactText: z.string().max(3000),
  email: z.union([z.literal(""), z.email()]),
  instagramUrl: z
    .union([
      z.literal(""),
      z.url().refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          ["www.instagram.com", "instagram.com"].includes(url.hostname) &&
          !url.username &&
          !url.password
        );
      }, "Utilisez un lien Instagram HTTPS."),
    ])
    .optional(),
  coursesText: z.string().max(6000).optional(),
  collectionDescriptions: z
    .record(z.string().max(200), z.string().max(6000))
    .optional(),
  currency: z.enum(["EUR", "CHF", "USD"]),
});
export function publicArtwork(a: AdminArtwork): Artwork {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    description: a.description,
    technique: a.technique,
    widthCm: a.widthCm,
    heightCm: a.heightCm,
    year: a.year,
    imageWidth: a.imageWidth,
    imageHeight: a.imageHeight,
    image: `/api/media/${a.id}?variant=room&v=${a.mediaId || "1"}`,
    thumbnail: `/api/media/${a.id}?variant=thumb&v=${a.mediaId || "1"}`,
    detailImage: `/api/media/${a.id}?variant=detail&v=${a.mediaId || "1"}`,
    alt: a.alt,
    priceMinor: a.priceVisibility === "public" ? a.priceMinor : null,
    currency: a.currency,
    availability: a.availability,
    roomId: a.roomId,
    slotId: a.slotId,
    frameStyle: a.frameStyle,
    placementOffsetX: a.placementOffsetX ?? 0,
    placementOffsetY: a.placementOffsetY ?? 0,
    displayScale: a.displayScale ?? 1,
    order: a.order,
    collection: a.collection,
  };
}
export function resolvePlacement(
  a: AdminArtwork,
  all: AdminArtwork[],
  rooms: string[],
): AdminArtwork {
  if (a.publication !== "published") return a;
  if (a.imageWidth < 1 || a.imageHeight < 1 || !a.image || !a.alt.trim())
    throw new ServiceError(
      "Ajoutez une image prête et son texte alternatif avant publication.",
    );
  const occupied = new Set(
    all
      .filter((x) => x.id !== a.id && x.publication === "published")
      .map((x) => x.slotId),
  );
  const roomCompatible = (roomId: string) => collectionFitsRoom(a, all, roomId);
  const slots = rooms.flatMap(getSlots);
  const ratio = a.imageWidth / a.imageHeight;
  const widthM = a.widthCm
    ? a.widthCm / 100
    : a.heightCm
      ? (a.heightCm / 100) * ratio
      : null;
  const heightM = a.heightCm
    ? a.heightCm / 100
    : a.widthCm
      ? a.widthCm / 100 / ratio
      : null;
  const scale = a.displayScale ?? 1;
  const compatible = (slot: ReturnType<typeof getSlots>[number]) =>
    (!widthM || widthM * scale <= slot.maxWidthM) &&
    (!heightM || heightM * scale <= slot.maxHeightM) &&
    (!widthM || (widthM / ratio) * scale <= slot.maxHeightM);
  const slot = a.slotId
    ? slots.find((x) => x.id === a.slotId && x.roomId === a.roomId)
    : slots.find(
        (x) =>
          !occupied.has(x.id) &&
          compatible(x) &&
          roomCompatible(x.roomId) &&
          !placementIssue({ ...a, roomId: x.roomId, slotId: x.id }, x, all),
      );
  if (!slot)
    throw new ServiceError(
      "Aucun emplacement disponible pour cette collection. Choisissez un emplacement adapté ou activez une salle pour une nouvelle collection.",
      409,
    );
  if (occupied.has(slot.id))
    throw new ServiceError(
      "Cet emplacement est déjà occupé. Choisissez Automatique ou un autre emplacement.",
      409,
    );
  if (!roomCompatible(slot.roomId))
    throw new ServiceError(
      "Une collection reste dans sa salle, avec deux collections maximum par salle. Choisissez une salle compatible.",
      409,
    );
  if (!compatible(slot))
    throw new ServiceError(
      "Les dimensions physiques dépassent cet emplacement. Choisissez un emplacement adapté.",
    );
  const issue = placementIssue(
    { ...a, roomId: slot.roomId, slotId: slot.id },
    slot,
    all,
  );
  if (issue) throw new ServiceError(issue, 409);
  return { ...a, roomId: slot.roomId, slotId: slot.id };
}
export const blankSettings: SiteSettings = {
  artistName: "",
  tagline: "",
  heroTitle: "",
  aboutTitle: "À propos",
  aboutText: "",
  contactTitle: "Contact",
  contactText: "",
  email: "",
  currency: "EUR",
};
