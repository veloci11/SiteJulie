import type { Artwork, Destination, SiteSettings } from "@/lib/data/types";
export function priceLabel(a: Artwork) {
  if (a.availability === "private_collection") return "Collection privée";
  return a.priceMinor === null
    ? "Prix sur demande"
    : new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: a.currency,
        maximumFractionDigits: a.priceMinor % 100 ? 2 : 0,
      }).format(a.priceMinor / 100);
}
export function availabilityLabel(a: Artwork) {
  if (a.availability === "private_collection") return "Collection privée";
  return a.availability === "sold"
    ? "Vendue"
    : a.availability === "reserved"
      ? "Réservée"
      : "Disponibilité sur demande";
}
export function destinationUrl(d: Destination, artworks: Artwork[]) {
  if (d.kind === "home") return "/";
  if (d.kind === "about") return "/?vue=apropos";
  if (d.kind === "contact")
    return `/?vue=contact${d.artworkId ? "&oeuvre=" + encodeURIComponent(d.artworkId) : ""}`;
  if (d.kind === "room")
    return "/?vue=salle&salle=" + encodeURIComponent(d.roomId);
  const a = artworks.find((a) => a.id === d.artworkId);
  return a ? "/?vue=oeuvre&slug=" + encodeURIComponent(a.slug) : "/";
}
export function parseDestination(
  search: string,
  artworks: Artwork[],
  rooms: string[],
): Destination {
  const p = new URLSearchParams(search);
  if (p.get("vue") === "apropos") return { kind: "about" };
  if (p.get("vue") === "contact") {
    const id = p.get("oeuvre");
    return {
      kind: "contact",
      ...(id && artworks.some((a) => a.id === id) ? { artworkId: id } : {}),
    };
  }
  if (p.get("vue") === "salle" && rooms.includes(p.get("salle") || ""))
    return { kind: "room", roomId: p.get("salle")! };
  if (p.get("vue") === "oeuvre") {
    const a = artworks.find((a) => a.slug === p.get("slug"));
    if (a) return { kind: "artwork", artworkId: a.id };
  }
  return { kind: "home" };
}
export function classicUrl(d: Destination, artworks: Artwork[]) {
  if (d.kind === "about") return "/a-propos";
  if (d.kind === "contact") {
    const a = artworks.find((a) => a.id === d.artworkId);
    return "/contact" + (a ? "?oeuvre=" + encodeURIComponent(a.slug) : "");
  }
  if (d.kind === "artwork") {
    const a = artworks.find((a) => a.id === d.artworkId);
    return a ? "/oeuvres/" + encodeURIComponent(a.slug) : "/oeuvres";
  }
  return "/oeuvres";
}
export function contactHref(
  settings: SiteSettings,
  artwork?: Artwork,
  origin = "",
) {
  if (!settings.email) return null;
  const subject = artwork
    ? `À propos de ${artwork.title} — ${artwork.id}`
    : "Un échange autour de votre peinture";
  const text = artwork
    ? `Bonjour,\n\nJe souhaite en savoir plus sur l’œuvre « ${artwork.title} » (référence : ${artwork.id}).\n${origin}/oeuvres/${encodeURIComponent(artwork.slug)}\n\n`
    : "Bonjour,\n\nJe souhaite échanger avec vous au sujet de votre peinture.\n\n";
  return `mailto:${settings.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}
