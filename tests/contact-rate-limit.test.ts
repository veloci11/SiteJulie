import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@vercel/blob", async (importOriginal) => {
  const { blobMock } = await import("./private-blob-fixture");
  return blobMock(await importOriginal<typeof import("@vercel/blob")>());
});
import { blobFixture, seedBlob } from "./private-blob-fixture";
import {
  CONTACT_LIMITS_PATH,
  cleanupContactLimits,
  limitContact,
} from "@/lib/contact/rate-limit";
beforeEach(() => {
  blobFixture.files.clear();
  blobFixture.failWrites = false;
  vi.stubEnv("MUSEUM_DATA_MODE", "blob");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "fixture-only");
  vi.stubEnv("MUSEUM_SESSION_SECRET", "private-fixture-secret".repeat(3));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const request = (ip = "192.0.2.1", forwarded = "fake") =>
  new Request("https://gallery.example.test/api/contact", {
    headers: { "x-vercel-forwarded-for": ip, "x-forwarded-for": forwarded },
  });
describe("distributed contact protection", () => {
  it("admits exactly five competing submissions using shared compare-and-swap", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        limitContact(request(), "visitor@example.test"),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    for (const result of results)
      if (result.status === "rejected") expect(result.reason.status).toBe(429);
    expect(
      JSON.parse(blobFixture.files.get(CONTACT_LIMITS_PATH)!.body).entries.daily
        .count,
    ).toBe(5);
  });
  it("enforces IP and email independently and ignores spoofed forwarding headers", async () => {
    for (let n = 0; n < 5; n++)
      await limitContact(request(), `visitor${n}@example.test`);
    await expect(
      limitContact(request("192.0.2.1", "other-ip"), "new@example.test"),
    ).rejects.toMatchObject({ status: 429 });
    blobFixture.files.clear();
    for (let n = 0; n < 5; n++)
      await limitContact(request(`192.0.2.${n}`), "VISITOR@example.test");
    await expect(
      limitContact(request("192.0.2.100"), "visitor@example.test"),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("stores keyed fingerprints without plaintext contact information", async () => {
    await limitContact(request(), "private-person@example.test");
    const body = blobFixture.files.get(CONTACT_LIMITS_PATH)!.body;
    expect(body).not.toContain("192.0.2.1");
    expect(body).not.toContain("private-person");
    const keys = Object.keys(JSON.parse(body).entries).filter(
      (key) => key !== "daily",
    );
    expect(keys).toHaveLength(2);
    expect(keys.every((key) => /^[a-f0-9]{64}$/.test(key))).toBe(true);
  });
  it("purges expired entries and allows messages again", async () => {
    vi.useFakeTimers();
    for (let n = 0; n < 5; n++)
      await limitContact(request(), "visitor@example.test");
    vi.setSystemTime(Date.now() + 16 * 60000);
    await cleanupContactLimits();
    expect(
      Object.keys(
        JSON.parse(blobFixture.files.get(CONTACT_LIMITS_PATH)!.body).entries,
      ),
    ).toEqual(["daily"]);
    await limitContact(request(), "visitor@example.test");
  });
  it("reserves headroom for the daily email quota even across different visitors", async () => {
    for (let n = 0; n < 40; n++)
      await limitContact(request(`192.0.2.${n}`), `visitor${n}@example.test`);
    await expect(
      limitContact(request("192.0.2.200"), "new@example.test"),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("fails closed on broken configuration, storage outage or corrupt state", async () => {
    blobFixture.failWrites = true;
    await expect(
      limitContact(request(), "visitor@example.test"),
    ).rejects.toMatchObject({ status: 503 });
    blobFixture.failWrites = false;
    seedBlob(CONTACT_LIMITS_PATH, '{"version":9}');
    await expect(
      limitContact(request(), "visitor@example.test"),
    ).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("MUSEUM_SESSION_SECRET", "");
    await expect(
      limitContact(request(), "visitor@example.test"),
    ).rejects.toMatchObject({ status: 503 });
  });
});
