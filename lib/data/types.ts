export type Availability =
  "available" | "reserved" | "sold" | "private_collection";
export type Publication = "draft" | "published" | "archived";
export type FrameStyle = "brass" | "oak" | "white";
export type Currency = "EUR" | "CHF" | "USD";
export interface Artwork {
  id: string;
  slug: string;
  title: string;
  description: string;
  technique: string | null;
  widthCm: number | null;
  heightCm: number | null;
  year: number | null;
  imageWidth: number;
  imageHeight: number;
  image: string;
  thumbnail: string;
  detailImage: string;
  alt: string;
  priceMinor: number | null;
  currency: Currency;
  availability: Availability;
  roomId: string;
  slotId: string;
  frameStyle: FrameStyle;
  /** Metres in the wall-local horizontal/up axes; omitted legacy values mean zero. */
  placementOffsetX?: number;
  placementOffsetY?: number;
  /** 0.01–1 of the zone anchor's maximum image size, independent of catalogue dimensions. */
  displayScale?: number;
  order: number;
  collection: string;
}
export interface AdminArtwork extends Artwork {
  publication: Publication;
  priceVisibility: "public" | "on_request";
  revision: number;
  mediaId?: string;
}
export interface SiteSettings {
  artistName: string;
  tagline: string;
  heroTitle: string;
  aboutTitle: string;
  aboutText: string;
  contactTitle: string;
  contactText: string;
  email: string;
  instagramUrl?: string;
  coursesText?: string;
  collectionDescriptions?: Record<string, string>;
  collectionRooms?: Record<string, string>;
  currency: Currency;
}
export interface PublicData {
  /** Public capability flag; provider credentials stay on the server. */
  contactEnabled?: boolean;
  artworks: Artwork[];
  settings: SiteSettings;
  mode: "demo" | "supabase" | "blob";
  rooms: string[];
}
export type Destination =
  | { kind: "home" }
  | { kind: "artwork"; artworkId: string }
  | { kind: "about" }
  | { kind: "contact"; artworkId?: string }
  | { kind: "room"; roomId: string };
