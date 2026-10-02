import { afterEach, describe, expect, it, vi } from "vitest";
import { effectiveContactSettings } from "@/lib/contact/config";
import { blankSettings } from "@/lib/validation/artwork";

afterEach(() => vi.unstubAllEnvs());

describe("public contact address migration", () => {
  it("replaces only the previous stored address", () => {
    vi.stubEnv("CONTACT_EMAIL_MIGRATION_FROM", "old@example.test");
    vi.stubEnv("CONTACT_EMAIL_MIGRATION_TO", "contact@example.test");
    const previous = { ...blankSettings, email: "old@example.test" };
    expect(effectiveContactSettings(previous).email).toBe(
      "contact@example.test",
    );
    expect(effectiveContactSettings({
      ...previous,
      email: "new-choice@example.test",
    }).email).toBe("new-choice@example.test");
    expect(previous.email).toBe("old@example.test");
  });

  it("ignores an invalid or incomplete replacement configuration", () => {
    vi.stubEnv("CONTACT_EMAIL_MIGRATION_FROM", "old@example.test");
    vi.stubEnv("CONTACT_EMAIL_MIGRATION_TO", "invalid-address");
    expect(
      effectiveContactSettings({
        ...blankSettings,
        email: "old@example.test",
      }).email,
    ).toBe("old@example.test");
  });
});
