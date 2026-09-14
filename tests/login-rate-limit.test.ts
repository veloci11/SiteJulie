import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scryptSync } from "node:crypto";

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

import { POST } from "@/app/api/admin/login/route";

function passwordHash(password: string) {
  const salt = Buffer.from("login-rate-test-salt");
  const hash = scryptSync(password, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function request(password: string, ip: string) {
  return new Request("https://juliethiam.art/api/admin/login", {
    method: "POST",
    headers: {
      host: "juliethiam.art",
      origin: "https://juliethiam.art",
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ username: "admin-test", password }),
  });
}

beforeEach(() => {
  session.cookies.clear();
  vi.stubEnv("MUSEUM_DATA_MODE", "blob");
  vi.stubEnv("MUSEUM_ADMIN_USERNAME", "admin-test");
  vi.stubEnv("MUSEUM_ADMIN_PASSWORD_HASH", passwordHash("correct-password"));
  vi.stubEnv("MUSEUM_SESSION_SECRET", "s".repeat(48));
});

afterEach(() => vi.unstubAllEnvs());

describe("Admin login throttling", () => {
  it("temporarily blocks an address after repeated failures", async () => {
    for (let index = 0; index < 6; index++)
      expect((await POST(request("wrong-password", "192.0.2.10"))).status).toBe(
        401,
      );
    expect((await POST(request("correct-password", "192.0.2.10"))).status).toBe(
      429,
    );
    expect((await POST(request("correct-password", "192.0.2.11"))).status).toBe(
      200,
    );
  });
});
