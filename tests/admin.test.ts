import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
const session = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  host: "127.0.0.1:3000",
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      session.cookies.has(key)
        ? { value: session.cookies.get(key) }
        : undefined,
    set: (key: string, value: string) => session.cookies.set(key, value),
    getAll: () => [],
  }),
  headers: async () => new Headers({ host: session.host }),
}));
import {
  assertMutationRequest,
  enterDemo,
  requireAdmin,
} from "@/lib/auth/server";
import {
  getAdminData,
  getPublicData,
  saveArtwork,
  addRoom,
  createCollection,
  saveSettings,
} from "@/lib/data/repository";
import {
  getMedia,
  processImage,
  createUpload,
  putLocalUpload,
  completeUpload,
} from "@/lib/media/service";
import type { AdminArtwork } from "@/lib/data/types";
import { getSlots } from "@/lib/museum/config";
import {
  blankSettings,
  publicArtwork,
  resolvePlacement,
} from "@/lib/validation/artwork";
const fixture: AdminArtwork = {
  id: "test-1",
  slug: "test-1",
  title: "Test de validation",
  description: "Fixture jetable",
  technique: null,
  widthCm: null,
  heightCm: null,
  year: null,
  imageWidth: 600,
  imageHeight: 900,
  image: "/api/media/test-1?variant=room",
  thumbnail: "/api/media/test-1?variant=thumb",
  detailImage: "/api/media/test-1?variant=detail",
  alt: "Image de test",
  priceMinor: 9876543,
  priceVisibility: "on_request",
  currency: "EUR",
  availability: "available",
  publication: "published",
  roomId: "room-1",
  slotId: "room-1-slot-01",
  frameStyle: "brass",
  order: 0,
  collection: "",
  revision: 1,
};
let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), "museum-admin-test-"));
  vi.stubEnv("MUSEUM_DATA_MODE", "demo");
  vi.stubEnv("MUSEUM_LOCAL_DATA_DIR", folder);
  session.cookies.clear();
  session.host = "127.0.0.1:3000";
  await writeFile(
    path.join(folder, "seed.json"),
    JSON.stringify({
      artworks: [fixture],
      settings: blankSettings,
      rooms: ["room-1"],
    }),
  );
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
describe("Public projection", () => {
  it("preserves a painting on D centre instead of opening a doorway behind it", async () => {
    await writeFile(
      path.join(folder, "seed.json"),
      JSON.stringify({
        artworks: [{ ...fixture, roomId: "room-2", slotId: "room-2-slot-13" }],
        settings: blankSettings,
        rooms: ["room-1", "room-2"],
      }),
    );
    await enterDemo();
    await expect(addRoom()).rejects.toThrow("D centre");
    const data = await getPublicData();
    expect(data.rooms).toEqual(["room-1", "room-2"]);
    expect(data.artworks[0].slotId).toBe("room-2-slot-13");
    expect(() =>
      resolvePlacement(
        { ...fixture, roomId: "room-2", slotId: "room-2-slot-13" },
        [],
        ["room-1", "room-2", "room-3"],
      ),
    ).toThrow();
  });
  it("omits hidden price, private keys and non-published works", async () => {
    const data = await getPublicData();
    expect(data.artworks).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain("9876543");
    expect(data.artworks[0].priceMinor).toBeNull();
    expect(data.artworks[0]).not.toHaveProperty("revision");
    expect(data.artworks[0]).not.toHaveProperty("priceVisibility");
    expect(data.artworks[0]).not.toHaveProperty("publication");
    await enterDemo();
    await saveArtwork({ ...fixture, publication: "draft" });
    expect((await getPublicData()).artworks).toHaveLength(0);
    await expect(getMedia("test-1", "room")).rejects.toThrow();
  });
  it("publishes only the explicitly visible amount", () => {
    expect(
      publicArtwork({ ...fixture, priceVisibility: "public" }).priceMinor,
    ).toBe(9876543);
  });
});
describe("Server permissions and persistence", () => {
  it("rejects anonymous admin reads and mutations", async () => {
    await expect(getAdminData()).rejects.toMatchObject({ status: 401 });
    await expect(saveArtwork(fixture)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects local demo on another host and rejects cross-origin mutations", async () => {
    session.host = "example.com";
    await expect(enterDemo()).rejects.toMatchObject({ status: 403 });
    await expect(
      assertMutationRequest(
        new Request("http://127.0.0.1:3000/api/admin/settings", {
          method: "POST",
          headers: {
            host: "127.0.0.1:3000",
            origin: "https://attacker.invalid",
          },
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects a forged session cookie", async () => {
    session.cookies.set("museum_demo", `${Date.now() + 100000}.forged`);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });
  it("saves revisions atomically and rejects stale writes", async () => {
    await enterDemo();
    const results = await Promise.allSettled([
      saveArtwork({ ...fixture, title: "Premier" }),
      saveArtwork({ ...fixture, title: "Second" }),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
    const data = JSON.parse(
      await readFile(path.join(folder, "data.json"), "utf8"),
    );
    expect(data.artworks[0].revision).toBe(2);
    session.cookies.clear();
    await enterDemo();
    expect((await getAdminData()).artworks[0].title).toBe("Premier");
  });
  it("rejects missing public prices and forged image paths", async () => {
    await enterDemo();
    await expect(
      saveArtwork({ ...fixture, priceVisibility: "public", priceMinor: null }),
    ).rejects.toThrow();
    await expect(
      saveArtwork({ ...fixture, image: "https://remote.invalid/source.jpg" }),
    ).rejects.toThrow("serveur");
  });
  it("fits the showroom independently of the dimensions declared in the description", () => {
    const slots = getSlots("room-1");
    const center = slots.find((slot) => slot.id === "room-1-slot-10")!;
    const widthCm = (slots[0].maxWidthM + center.maxWidthM) * 50;
    const large = {
      ...fixture,
      id: "large",
      slug: "large",
      slotId: "",
      imageWidth: widthCm * 10,
      imageHeight: 2000,
      widthCm,
      heightCm: 200,
    };
    expect(resolvePlacement(large, [], ["room-1"]).slotId).toBe(
      "room-1-slot-01",
    );
  });
  it("refuses occupied slots and requires explicit room extension", async () => {
    const full = Array.from({ length: 12 }, (_, i) => ({
      ...fixture,
      id: `test-${i + 1}`,
      slug: `test-${i + 1}`,
      slotId: `room-1-slot-${String(i + 1).padStart(2, "0")}`,
    }));
    const next = { ...fixture, id: "test-13", slug: "test-13", slotId: "" };
    expect(() => resolvePlacement(next, full, ["room-1"])).toThrow("salle");
    await enterDemo();
    expect(await addRoom()).toBe("room-2");
    expect(resolvePlacement(next, full, ["room-1", "room-2"]).roomId).toBe(
      "room-2",
    );
  });
  it("keeps each collection together without an arbitrary two-collection limit", () => {
    const portrait = { ...fixture, collection: "Visages" };
    const next = {
      ...fixture,
      id: "next",
      slug: "next",
      collection: "Visages",
      slotId: "",
    };
    expect(
      resolvePlacement(next, [portrait], ["room-1", "room-2"]).roomId,
    ).toBe("room-1");
    const landscape = resolvePlacement(
      { ...next, collection: "Paysages", slotId: "room-1-slot-02" },
      [portrait],
      ["room-1", "room-2"],
    );
    expect(landscape.roomId).toBe("room-1");
    expect(
      resolvePlacement(
        { ...next, id: "third", collection: "Soies" },
        [portrait, landscape],
        ["room-1", "room-2"],
      ).roomId,
    ).toBe("room-1");
    expect(() =>
      resolvePlacement(
        { ...next, roomId: "room-2", slotId: "room-2-slot-01" },
        [portrait],
        ["room-1", "room-2"],
      ),
    ).toThrow("collection reste dans sa salle");
  });
});
describe("Actual image decoding", () => {
  async function pendingImage(width = 120, height = 180) {
    const token = await createUpload(fixture.id);
    const buffer = await sharp({
      create: { width, height, channels: 3, background: "#ab465d" },
    })
      .png()
      .toBuffer();
    await putLocalUpload(
      token.id,
      new Request("http://127.0.0.1:3000/api/admin/upload", {
        method: "PUT",
        body: new Uint8Array(buffer),
      }),
    );
    return token.id;
  }
  it("keeps a new image private with its draft and finalizes it only once", async () => {
    await enterDemo();
    await saveArtwork({ ...fixture, publication: "draft" });
    const id = await pendingImage();
    const saved = await completeUpload(id);
    expect(saved).toMatchObject({
      publication: "draft",
      mediaId: id,
      imageWidth: 120,
      imageHeight: 180,
      revision: 3,
    });
    await expect(completeUpload(id)).rejects.toMatchObject({ status: 404 });
    session.cookies.clear();
    await expect(getMedia(fixture.id, "room")).rejects.toMatchObject({
      status: 401,
    });
  });
  it("does not replace the image after another edit during the upload", async () => {
    await enterDemo();
    const id = await pendingImage();
    const edited = await saveArtwork({ ...fixture, title: "Autre onglet" });
    await expect(completeUpload(id)).rejects.toMatchObject({ status: 409 });
    expect((await getAdminData()).artworks[0]).toEqual(edited);
  });
  it("preserves the published image when a new ratio no longer fits the wall", async () => {
    await enterDemo();
    const saved = await saveArtwork({
      ...fixture,
      widthCm: 100,
      displayScale: 0.6,
      placementOffsetX: 0.5,
    });
    const id = await pendingImage(2000, 100);
    await expect(completeUpload(id)).rejects.toThrow("cadre");
    expect((await getAdminData()).artworks[0]).toEqual(saved);
  });
  it("refuses disguised non-images and SVG", async () => {
    await expect(processImage(Buffer.from("not an image"))).rejects.toThrow();
    await expect(
      processImage(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
        ),
      ),
    ).rejects.toThrow();
  });
  it("creates valid variants without upscaling", async () => {
    const original = await sharp({
      create: { width: 100, height: 180, channels: 3, background: "#ab465d" },
    })
      .png()
      .toBuffer();
    const result = await processImage(original);
    expect(result.width).toBe(100);
    expect(result.height).toBe(180);
    expect(result.outputs.map((x) => x.variant)).toEqual([
      "thumb",
      "room",
      "detail",
    ]);
    for (const output of result.outputs) {
      const metadata = await sharp(output.buffer).metadata();
      expect(metadata.width).toBe(100);
      expect(metadata.height).toBe(180);
      expect(metadata.format).toBe("webp");
    }
  });
});

describe("Collection-local order and safe moves", () => {
  async function withCollections() {
    const names = ["a", "b", "c", "d"];
    const artworks = names.map((id, i) => ({
      ...fixture,
      id,
      slug: id,
      title: id,
      collection: i < 2 ? "Visages" : "Paysages",
      roomId: i < 2 ? "room-1" : "room-2",
      slotId: `room-${i < 2 ? 1 : 2}-slot-${i % 2 ? "06" : "02"}`,
      order: i,
      revision: 1,
    }));
    await writeFile(
      path.join(folder, "seed.json"),
      JSON.stringify({
        artworks,
        settings: blankSettings,
        rooms: ["room-1", "room-2"],
      }),
    );
    await enterDemo();
    return artworks;
  }
  it("reads legacy global positions as local ranks without mutating the file", async () => {
    await withCollections();
    expect((await getAdminData()).artworks.map((a) => a.order)).toEqual([
      0, 1, 0, 1,
    ]);
    const disk = JSON.parse(
      await readFile(path.join(folder, "seed.json"), "utf8"),
    );
    expect(disk.artworks.map((a: AdminArtwork) => a.order)).toEqual([
      0, 1, 2, 3,
    ]);
  });
  it("inserts at position one, preserves hidden prices and rejects stale peer revisions", async () => {
    await withCollections();
    const all = (await getAdminData()).artworks;
    const b = all.find((a) => a.id === "b")!;
    await saveArtwork({ ...b, order: 0 });
    const read = (await getAdminData()).artworks;
    expect(read.map((a) => a.id)).toEqual(["b", "a", "c", "d"]);
    expect(read.map((a) => a.order)).toEqual([0, 1, 0, 1]);
    await expect(
      saveArtwork(all.find((a) => a.id === "a")!),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getPublicData()).artworks.map((a) => a.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
    expect(
      (await getPublicData()).artworks.every((a) => a.priceMinor === null),
    ).toBe(true);
  });
  it("changing collection via API resets old placement and closes its old order gap atomically", async () => {
    await withCollections();
    const a = (await getAdminData()).artworks.find((a) => a.id === "a")!;
    const saved = await saveArtwork({
      ...a,
      collection: "Paysages",
      order: 1,
      placementOffsetX: 4,
    });
    expect(saved.roomId).toBe("room-2");
    expect(saved.slotId).toMatch(/^room-2-slot-/);
    expect(saved.placementOffsetX).toBe(0);
    const data = await getAdminData();
    expect(data.artworks.map((a) => a.id)).toEqual(["b", "c", "a", "d"]);
    expect(data.artworks.map((a) => a.order)).toEqual([0, 0, 1, 2]);
    expect(saved.publication).toBe("published");
    const disk = JSON.parse(
      await readFile(path.join(folder, "data.json"), "utf8"),
    );
    expect(disk.artworks.find((x: AdminArtwork) => x.id === "a")).toEqual(
      saved,
    );
  });
  it("preserves a deliberately adjusted wall position in the new collection room", async () => {
    await withCollections();
    const a = (await getAdminData()).artworks.find((a) => a.id === "a")!;
    const saved = await saveArtwork({
      ...a,
      collection: "Paysages",
      roomId: "room-2",
      slotId: "room-2-slot-05",
      placementOffsetX: 0.2,
      placementOffsetY: 0.15,
      displayScale: 0.6,
      order: 1,
    });
    expect(saved).toMatchObject({
      roomId: "room-2",
      slotId: "room-2-slot-05",
      placementOffsetX: 0.2,
      placementOffsetY: 0.15,
      displayScale: 0.6,
      order: 1,
    });
  });
  it("a rejected move does not reorder any collection or partially save fields", async () => {
    await withCollections();
    const data = await getAdminData();
    const a = data.artworks[0];
    await expect(
      saveArtwork({
        ...a,
        collection: "Paysages",
        roomId: "room-2",
        slotId: "room-2-slot-02",
        order: 0,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await getAdminData()).toEqual(data);
  });
});

describe("Collection creation", () => {
  it("requires an administrator and rejects unavailable rooms", async () => {
    await expect(
      createCollection({ name: "Nouvelle", roomId: "room-1" }),
    ).rejects.toMatchObject({ status: 401 });
    await enterDemo();
    await expect(
      createCollection({ name: "Nouvelle", roomId: "room-4" }),
    ).rejects.toThrow("salle n’existe pas");
    await expect(
      createCollection({ name: "  ", roomId: "room-1" }),
    ).rejects.toThrow("nom de collection");
  });
  it("persists an empty collection and anchors its first artwork in the chosen room", async () => {
    await enterDemo();
    await addRoom();
    await createCollection({ name: "  Lumières  ", roomId: "room-2" });
    expect((await getAdminData()).settings.collectionRooms).toEqual({
      Lumières: "room-2",
    });
    await expect(
      createCollection({ name: "LUMIÈRES", roomId: "room-1" }),
    ).rejects.toMatchObject({ status: 409 });
    const saved = await saveArtwork({
      ...fixture,
      collection: "Lumières",
      slotId: "",
    });
    expect(saved.roomId).toBe("room-2");
    expect(saved.slotId).toMatch(/^room-2-/);
    expect(saved.order).toBe(0);
    // Saving text from a stale tab cannot erase the newly created collection.
    await saveSettings(blankSettings);
    expect((await getAdminData()).settings.collectionRooms).toEqual({
      Lumières: "room-2",
    });
    expect((await getPublicData()).artworks[0].collection).toBe("Lumières");
  });
  it("does not silently move the collection to another room when its chosen room is full", async () => {
    const slots = getSlots("room-2");
    const occupied = slots.map((slot, i) => ({
      ...fixture,
      id: `occupied-${i}`,
      collection: "Existing",
      roomId: "room-2",
      slotId: slot.id,
    }));
    expect(() =>
      resolvePlacement(
        { ...fixture, id: "new", collection: "New", slotId: "" },
        occupied,
        ["room-1", "room-2"],
        { New: "room-2" },
      ),
    ).toThrow("Aucune zone");
  });
});
