import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
const data = vi.hoisted(() => ({
  settings: { email: "artist@example.test", artistName: "Julie Thiam" },
  artworks: [
    { id: "published", slug: "public-work", title: "Une œuvre publique" },
  ],
}));
vi.mock("@/lib/data/repository", () => ({ getPublicData: async () => data }));
vi.mock("@vercel/blob", async (importOriginal) => {
  const { blobMock } = await import("./private-blob-fixture");
  return blobMock(await importOriginal<typeof import("@vercel/blob")>());
});
import { blobFixture } from "./private-blob-fixture";
import { POST } from "@/app/api/contact/route";
const fetchMock = vi.fn();
let address = 0;
beforeEach(() => {
  blobFixture.files.clear();
  blobFixture.failWrites = false;
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "fixture-only");
  vi.stubEnv("MUSEUM_SESSION_SECRET", "fixture-secret".repeat(4));
  vi.stubEnv("MUSEUM_DATA_MODE", "blob");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gallery.example.test");
  vi.stubEnv("RESEND_API_KEY", "test-secret-never-exposed");
  vi.stubEnv("CONTACT_EMAIL_FROM", "Gallery <contact@mail.example.test>");
  vi.stubEnv("CONTACT_FORM_ENABLED", "1");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock
    .mockReset()
    .mockImplementation(async () => Response.json({ id: "provider-accepted" }));
  address++;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function request(
  extra: Record<string, unknown> = {},
  origin = "https://gallery.example.test",
  body?: string,
) {
  return new Request("https://gallery.example.test/api/contact", {
    method: "POST",
    headers: {
      host: "gallery.example.test",
      origin,
      "content-type": "application/json",
      "x-vercel-forwarded-for": `192.0.2.${address}`,
    },
    body:
      body ??
      JSON.stringify({
        name: "Visiteur",
        email: `visitor${address}@example.test`,
        message: "Je souhaite en savoir plus sur votre peinture.",
        requestId: randomUUID(),
        website: "",
        ...extra,
      }),
  });
}
describe("Contact endpoint with a mocked Resend API; no real email", () => {
  it("sends the artist notification and a separate visitor confirmation", async () => {
    const id = randomUUID();
    const response = await POST(
      request({ artworkId: "published", requestId: id }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      confirmationSent: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const message = JSON.parse(options.body);
    expect(message.to).toEqual(["artist@example.test"]);
    expect(message.from).toBe("Gallery <contact@mail.example.test>");
    expect(message.reply_to).toBe(`visitor${address}@example.test`);
    expect(message.text).toContain(
      "https://gallery.example.test/oeuvres/public-work",
    );
    expect(message.html).toContain("Une nouvelle demande");
    expect(message.html).toContain("Une œuvre publique");
    expect(message.html).toContain("mailto:visitor");
    expect(message.html).toContain(
      "https://gallery.example.test/oeuvres/public-work",
    );
    expect(options.headers["Idempotency-Key"]).toBe(`museum-contact/${id}`);
    const [receiptUrl, receiptOptions] = fetchMock.mock.calls[1];
    const receipt = JSON.parse(receiptOptions.body);
    expect(receiptUrl).toBe("https://api.resend.com/emails");
    expect(receipt.to).toEqual([`visitor${address}@example.test`]);
    expect(receipt.reply_to).toBe("artist@example.test");
    expect(receipt.subject).toBe("Message bien envoyé — Julie Thiam");
    expect(receipt.html).toContain("Message bien envoyé");
    expect(receipt.html).not.toContain("Je souhaite en savoir plus");
    expect(receiptOptions.headers["Idempotency-Key"]).toBe(
      `museum-contact-receipt/${id}`,
    );
  });
  it("escapes visitor content in HTML and keeps the text alternative", async () => {
    expect(
      (
        await POST(
          request({
            message:
              "Bonjour, <script>alert('x')</script> puis-je avoir des détails ?",
          }),
        )
      ).status,
    ).toBe(200);
    const message = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.text).toContain("<script>");
    expect(message.html).not.toContain("À propos de l’œuvre");
    const receipt = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(receipt.html).not.toContain("<script>");
    expect(receipt.html).not.toContain("&lt;script&gt;");
  });
  it("rejects cross-site requests, malformed bodies, hidden works and arbitrary recipients", async () => {
    expect((await POST(request({}, "https://evil.example.test"))).status).toBe(
      403,
    );
    expect((await POST(request({}, undefined, "{broken"))).status).toBe(400);
    expect((await POST(request({ artworkId: "draft-secret" }))).status).toBe(
      400,
    );
    expect((await POST(request({ to: "attacker@example.test" }))).status).toBe(
      400,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects bots, invalid emails, header injection and oversized payloads", async () => {
    for (const extra of [
      { website: "bot.example.test" },
      { email: "bad" },
      { name: "Header\r\nBcc: someone@example.test" },
    ])
      expect((await POST(request(extra))).status).toBe(400);
    expect(
      (
        await POST(
          request(
            {},
            undefined,
            JSON.stringify({ message: "x".repeat(21000) }),
          ),
        )
      ).status,
    ).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("never sends in demo or preview mode, or with missing configuration", async () => {
    for (const [key, value] of [
      ["MUSEUM_DATA_MODE", "demo"],
      ["VERCEL_ENV", "preview"],
      ["RESEND_API_KEY", ""],
      ["CONTACT_FORM_ENABLED", "0"],
    ]) {
      const old = process.env[key];
      vi.stubEnv(key, value);
      expect((await POST(request())).status).toBe(
        key === "MUSEUM_DATA_MODE" ? 403 : 503,
      );
      vi.stubEnv(key, old);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("reports provider failure without exposing its account details or claiming success", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { message: "private-provider-account-information" },
        { status: 403 },
      ),
    );
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain(
      "private-provider",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("reports receipt failure without asking the visitor to resend the artist message", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ id: "artist-accepted" }))
      .mockResolvedValueOnce(
        Response.json(
          { message: "private-provider-account-information" },
          { status: 403 },
        ),
      );
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      confirmationSent: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("throttles a burst of contact messages", async () => {
    for (let n = 0; n < 5; n++)
      expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});
