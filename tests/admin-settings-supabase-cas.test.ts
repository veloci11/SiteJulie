import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
vi.mock("@/lib/auth/server", () => ({
  requireAdmin: vi.fn(async () => ({ id: "fixture-admin" })),
  isDemo: () => false,
  isBlob: () => false,
  assertLocalHost: vi.fn(),
  supabaseSession: vi.fn(),
}));
import { supabaseSession } from "@/lib/auth/server";
import { saveSettings } from "@/lib/data/repository";
import { blankSettings } from "@/lib/validation/artwork";
import type { SiteSettings } from "@/lib/data/types";

beforeEach(() => {
  vi.mocked(supabaseSession).mockReset();
  vi.stubEnv("CONTACT_EMAIL_MIGRATION_FROM", "");
  vi.stubEnv("CONTACT_EMAIL_MIGRATION_TO", "");
});
afterEach(() => vi.unstubAllEnvs());

function fixtureClient(current: SiteSettings, changedBeforeWrite = false) {
  const requests: { url: URL; method: string }[] = [];
  const fixtureFetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      if (method === "GET") return Response.json({ payload: current });
      if (changedBeforeWrite)
        return Response.json(
          {
            code: "PGRST116",
            details: "The result contains 0 rows",
            message: "Cannot coerce the result to a single JSON object",
          },
          { status: 406 },
        );
      return Response.json(JSON.parse(String(init?.body)));
    },
  );
  const client = createClient(
    "https://fixture.supabase.invalid",
    "fixture-only",
    {
      global: { fetch: fixtureFetch },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  vi.mocked(supabaseSession).mockResolvedValue(client);
  return requests;
}

describe("Settings optimistic writes use Supabase JSONB comparison", () => {
  it("saves normally with a conditional filter matching the stored payload", async () => {
    const requests = fixtureClient(blankSettings);
    const saved = await saveSettings({
      ...blankSettings,
      contactText: "Modification normale",
      expectedSettings: blankSettings,
    });
    expect(saved.contactText).toBe("Modification normale");
    expect(saved).not.toHaveProperty("expectedSettings");
    expect(requests.map((request) => request.method)).toEqual(["GET", "PATCH"]);
    expect(requests[1].url.searchParams.get("payload")).toBe(
      `eq.${JSON.stringify(blankSettings)}`,
    );
  });

  it("rejects a stale initial form before attempting an update", async () => {
    const requests = fixtureClient({
      ...blankSettings,
      artistName: "Autre onglet",
    });
    await expect(
      saveSettings({
        ...blankSettings,
        contactText: "Formulaire périmé",
        expectedSettings: blankSettings,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(requests.map((request) => request.method)).toEqual(["GET"]);
  });

  it("rejects a concurrent change between the read and the conditional update", async () => {
    const requests = fixtureClient(blankSettings, true);
    await expect(
      saveSettings({
        ...blankSettings,
        contactText: "Modification concurrente",
        expectedSettings: blankSettings,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(requests[1].url.searchParams.get("payload")).toBe(
      `eq.${JSON.stringify(blankSettings)}`,
    );
  });

  it("compares the effective email but conditions the write on the raw stored payload", async () => {
    const stored = { ...blankSettings, email: "before@example.test" };
    const displayed = { ...blankSettings, email: "after@example.test" };
    const requests = fixtureClient(stored);
    vi.stubEnv("CONTACT_EMAIL_MIGRATION_FROM", "before@example.test");
    vi.stubEnv("CONTACT_EMAIL_MIGRATION_TO", "after@example.test");
    const saved = await saveSettings({
      ...displayed,
      tagline: "Nouvelle accroche",
      expectedSettings: displayed,
    });
    expect(saved.email).toBe("after@example.test");
    expect(requests[1].url.searchParams.get("payload")).toBe(
      `eq.${JSON.stringify(stored)}`,
    );
  });
});
