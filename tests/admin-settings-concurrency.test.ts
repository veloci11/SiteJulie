import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const mode = vi.hoisted(() => ({ blob: false }));
vi.mock("@vercel/blob", async (importOriginal) => {
  const { blobMock } = await import("./private-blob-fixture");
  return blobMock(await importOriginal<typeof import("@vercel/blob")>());
});
vi.mock("@/lib/auth/server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "fixture-admin" })),
  isDemo: () => !mode.blob,
  isBlob: () => mode.blob,
  assertLocalHost: vi.fn(),
  supabaseSession: vi.fn(),
}));
import { getAdminData, saveSettings } from "@/lib/data/repository";
import { blankSettings } from "@/lib/validation/artwork";
import type { SiteSettings } from "@/lib/data/types";
import { blobFixture, seedBlob } from "./private-blob-fixture";

let folder: string;
beforeEach(async () => {
  mode.blob = false;
  blobFixture.files.clear();
  blobFixture.writes = [];
  folder = await mkdtemp(
    path.join(os.tmpdir(), "museum-settings-concurrency-"),
  );
  vi.stubEnv("MUSEUM_DATA_MODE", "demo");
  vi.stubEnv("MUSEUM_LOCAL_DATA_DIR", folder);
  vi.stubEnv("CONTACT_EMAIL_MIGRATION_FROM", "");
  vi.stubEnv("CONTACT_EMAIL_MIGRATION_TO", "");
  await seed(blankSettings);
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
async function seed(settings: SiteSettings) {
  await writeFile(
    path.join(folder, "seed.json"),
    JSON.stringify({ artworks: [], settings, rooms: ["room-1"] }),
  );
}

describe("Admin settings concurrency", () => {
  it("rejects a stale settings form instead of erasing another tab's texts", async () => {
    const baseline = (await getAdminData()).settings;
    const saved = await saveSettings({
      ...baseline,
      artistName: "Premier onglet",
      expectedSettings: baseline,
    });
    await expect(
      saveSettings({
        ...baseline,
        contactText: "Deuxième onglet",
        expectedSettings: baseline,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getAdminData()).settings).toEqual(saved);
  });

  it("keeps already open clients compatible when they omit the baseline", async () => {
    const saved = await saveSettings({
      ...blankSettings,
      tagline: "Ancien client",
    });
    expect(saved.tagline).toBe("Ancien client");
    expect((await getAdminData()).settings.tagline).toBe("Ancien client");
  });

  it("compares collection descriptions without depending on JSON key order", async () => {
    await seed({
      ...blankSettings,
      collectionRooms: { A: "room-1", B: "room-1" },
      collectionDescriptions: { A: "Premier", B: "Deuxième" },
    });
    const baseline = (await getAdminData()).settings;
    const saved = await saveSettings({
      ...baseline,
      tagline: "Texte modifié",
      expectedSettings: {
        ...baseline,
        collectionRooms: { B: "room-1", A: "room-1" },
        collectionDescriptions: { B: "Deuxième", A: "Premier" },
      },
    });
    expect(saved.tagline).toBe("Texte modifié");
  });

  it("does not lose a migration of the public email when comparing starting settings", async () => {
    mode.blob = true;
    seedBlob(
      "museum/catalog.json",
      JSON.stringify({
        artworks: [],
        settings: { ...blankSettings, email: "before@example.test" },
        rooms: ["room-1"],
      }),
    );
    vi.stubEnv("CONTACT_EMAIL_MIGRATION_FROM", "before@example.test");
    vi.stubEnv("CONTACT_EMAIL_MIGRATION_TO", "after@example.test");
    const baseline = (await getAdminData()).settings;
    expect(baseline.email).toBe("after@example.test");
    const saved = await saveSettings({
      ...baseline,
      tagline: "Nouvelle accroche",
      expectedSettings: baseline,
    });
    expect(saved.email).toBe("after@example.test");
    expect((await getAdminData()).settings.email).toBe("after@example.test");
  });

  it("rejects a stale Blob form inside the catalog mutation", async () => {
    mode.blob = true;
    seedBlob(
      "museum/catalog.json",
      JSON.stringify({
        artworks: [],
        settings: blankSettings,
        rooms: ["room-1"],
      }),
    );
    const baseline = (await getAdminData()).settings;
    const saved = await saveSettings({
      ...baseline,
      aboutText: "Texte déjà enregistré",
      expectedSettings: baseline,
    });
    const writes = blobFixture.writes.length;
    await expect(
      saveSettings({
        ...baseline,
        contactText: "Formulaire périmé",
        expectedSettings: baseline,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getAdminData()).settings).toEqual(saved);
    expect(blobFixture.writes).toHaveLength(writes);
  });
});
