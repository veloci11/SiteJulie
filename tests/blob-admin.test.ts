import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, scryptSync } from "node:crypto";

const session = vi.hoisted(() => ({ cookies: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      session.cookies.has(key)
        ? { value: session.cookies.get(key) }
        : undefined,
    set: (key: string, value: string) => session.cookies.set(key, value),
    getAll: () => [],
  }),
  headers: async () => new Headers({ host: "juliethiam.art" }),
}));

import { enterBlobAdmin, requireAdmin } from "@/lib/auth/server";

function passwordHash(password: string) {
  const salt = Buffer.from("blob-admin-test-salt");
  const hash = scryptSync(password, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

beforeEach(() => {
  session.cookies.clear();
  vi.stubEnv("MUSEUM_DATA_MODE", "blob");
  vi.stubEnv("MUSEUM_ADMIN_USERNAME", "admin-test");
  vi.stubEnv("MUSEUM_ADMIN_PASSWORD_HASH", passwordHash("correct-password"));
  vi.stubEnv("MUSEUM_SESSION_SECRET", "s".repeat(48));
});

afterEach(() => vi.unstubAllEnvs());

describe("Single-account Vercel Blob administration", () => {
  it("rejects expired, malformed and excessively long sessions even with a valid signature", async () => {
    for (const expires of [
      "NaN",
      "Infinity",
      String(Date.now() - 60000),
      String(Date.now() + 48 * 3600000),
    ]) {
      const signature = createHmac("sha256", "s".repeat(48))
        .update(expires)
        .digest("hex");
      session.cookies.set("museum_admin", `${expires}.${signature}`);
      await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
    }
    await enterBlobAdmin("admin-test", "correct-password");
    session.cookies.set(
      "museum_admin",
      session.cookies.get("museum_admin") + ".extra",
    );
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });
  it("opens a signed server session only with the configured credentials", async () => {
    await expect(
      enterBlobAdmin("admin-test", "wrong-password"),
    ).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      enterBlobAdmin("wrong-user", "correct-password"),
    ).rejects.toMatchObject({ status: 401 });
    await enterBlobAdmin("admin-test", "correct-password");
    await expect(requireAdmin()).resolves.toMatchObject({
      id: "vercel-blob-admin",
      demo: false,
    });
  });

  it("rejects forged cookies and incomplete server configuration", async () => {
    session.cookies.set("museum_admin", `${Date.now() + 60_000}.forged`);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
    vi.stubEnv("MUSEUM_SESSION_SECRET", "short");
    await expect(
      enterBlobAdmin("admin-test", "correct-password"),
    ).rejects.toMatchObject({ status: 503 });
  });
});
