import { describe, expect, it } from "vitest";
import { contactOrigin } from "../components/public/ContactActions";

describe("configured contact origin", () => {
  it("keeps only the public web origin and preserves local preview ports", () => {
    expect(
      contactOrigin("https://galerie.example.test/base?tracking=x#part"),
    ).toBe("https://galerie.example.test");
    expect(contactOrigin("http://127.0.0.1:3001")).toBe(
      "http://127.0.0.1:3001",
    );
  });
  it("rejects relative, unsafe, malformed or credential-bearing origins", () => {
    for (const input of [
      undefined,
      "",
      "/gallery",
      "javascript:alert(1)",
      "file:///private",
      "https://user:password@example.test",
    ]) {
      expect(contactOrigin(input)).toBe("");
    }
  });
});
