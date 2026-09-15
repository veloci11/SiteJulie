import type { AdminArtwork, Artwork } from "./types";

export const collectionKey = (name: string) =>
  name.trim().toLocaleLowerCase("fr");
/** A collection belongs to its chosen room, even before its first publication. */
export function collectionFitsRoom(
  artwork: Pick<AdminArtwork, "id" | "collection">,
  all: readonly AdminArtwork[],
  roomId: string,
  collectionRooms: Record<string, string> = {},
) {
  const peers = all.filter(
    (a) => a.id !== artwork.id && a.publication === "published",
  );
  const name = collectionKey(artwork.collection);
  const existingRoom = name
    ? peers.find((a) => collectionKey(a.collection) === name)?.roomId
    : undefined;
  const registered = Object.entries(collectionRooms).find(
    ([key]) => collectionKey(key) === name,
  )?.[1];
  return (
    (!existingRoom || existingRoom === roomId) &&
    (!registered || registered === roomId)
  );
}
type Ordered = Pick<Artwork, "id" | "collection" | "roomId" | "order">;
/** Room order keeps public collections together even when local positions restart. */
export function groupCollections<T extends Ordered>(
  artworks: readonly T[],
  rooms: readonly string[],
  collectionRooms: Record<string, string> = {},
) {
  const groups = new Map<
    string,
    { name: string; roomId: string; artworks: T[] }
  >();
  for (const [name, roomId] of Object.entries(collectionRooms))
    groups.set(collectionKey(name), { name, roomId, artworks: [] });
  for (const a of artworks) {
    const key = collectionKey(a.collection);
    const group = groups.get(key) ?? {
      name: a.collection.trim(),
      roomId: a.roomId,
      artworks: [],
    };
    group.artworks.push(a);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        rooms.indexOf(a.roomId) - rooms.indexOf(b.roomId) ||
        a.name.localeCompare(b.name, "fr"),
    )
    .map((g) => ({
      ...g,
      artworks: g.artworks.sort(
        (a, b) => a.order - b.order || a.id.localeCompare(b.id),
      ),
    }));
}
/** Read-only projection also understands legacy global orders and gaps. */
export function normalizeCollectionOrder<T extends Ordered>(
  artworks: readonly T[],
  rooms: readonly string[],
): T[] {
  return groupCollections(artworks, rooms).flatMap((g) =>
    g.artworks.map((a, order) => ({ ...a, order })),
  );
}
/** One atomic write inserts the candidate and closes gaps in its former collection. */
export function insertInCollection(
  candidate: AdminArtwork,
  all: readonly AdminArtwork[],
  rooms: readonly string[],
) {
  const peers = normalizeCollectionOrder(
    all.filter((a) => a.id !== candidate.id),
    rooms,
  );
  const own = peers.filter(
    (a) => collectionKey(a.collection) === collectionKey(candidate.collection),
  );
  own.splice(Math.min(candidate.order, own.length), 0, candidate);
  const ranked = own.map((a, order) => ({ ...a, order }));
  return [
    ...peers.filter(
      (a) =>
        collectionKey(a.collection) !== collectionKey(candidate.collection),
    ),
    ...ranked,
  ].map((a) => {
    const old = all.find((x) => x.id === a.id);
    return a.id !== candidate.id && old && old.order !== a.order
      ? { ...a, revision: old.revision + 1 }
      : a;
  });
}
/** Existing collection names are selected, never inferred from a free-typed typo. */
export function moveToCollection(
  a: AdminArtwork,
  name: string,
  all: readonly AdminArtwork[],
  collectionRooms: Record<string, string> = {},
) {
  const peers = all.filter(
    (x) => x.id !== a.id && collectionKey(x.collection) === collectionKey(name),
  );
  const anchor = peers.find((x) => x.publication === "published") ?? peers[0];
  const registered = Object.entries(collectionRooms).find(
    ([key]) => collectionKey(key) === collectionKey(name),
  );
  return {
    ...a,
    collection: registered?.[0] ?? anchor?.collection ?? name,
    roomId: registered?.[1] ?? anchor?.roomId ?? a.roomId,
    slotId: "",
    placementOffsetX: 0,
    placementOffsetY: 0,
    order: peers.length,
  };
}
