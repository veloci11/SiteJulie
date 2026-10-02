import { z } from "zod";
import { assertMutationRequest } from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
import { getPublicData } from "@/lib/data/repository";
import { ServiceError } from "@/lib/validation/artwork";
import { siteOrigin } from "@/lib/seo";
import { sendContactEmail, sendContactReceipt } from "@/lib/contact/send";
import { limitContact } from "@/lib/contact/rate-limit";
import { renderContactNotification } from "@/lib/contact/notification";
import { renderContactConfirmation } from "@/lib/contact/confirmation";

export const runtime = "nodejs";
const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .refine((v) => !/[\r\n]/.test(v)),
    email: z.email().max(254),
    message: z.string().trim().min(10).max(5000),
    artworkId: z.string().max(100).optional(),
    website: z.literal("").optional(),
    requestId: z.uuid(),
  })
  .strict();

async function boundedJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ServiceError("Format de message invalide.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError("Message vide.", 400);
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 20000) {
      await reader.cancel();
      throw new ServiceError("Message trop volumineux.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ServiceError("Message invalide.", 400);
  }
}

export async function POST(request: Request) {
  try {
    await assertMutationRequest(request);
    const origin = siteOrigin();
    if (!origin || request.headers.get("origin") !== origin)
      throw new ServiceError("Origine de requête refusée.", 403);
    const parsed = schema.safeParse(await boundedJson(request));
    if (!parsed.success)
      throw new ServiceError(
        "Vérifiez votre nom, votre email et votre message (10 à 5 000 caractères).",
        400,
      );
    const input = parsed.data;
    await limitContact(request, input.email);
    const data = await getPublicData();
    const artwork = input.artworkId
      ? data.artworks.find((a) => a.id === input.artworkId)
      : undefined;
    if (input.artworkId && !artwork)
      throw new ServiceError(
        "Cette œuvre n’est plus disponible dans le catalogue.",
        400,
      );
    const notification = renderContactNotification({
      artistName: data.settings.artistName,
      visitorName: input.name,
      visitorEmail: input.email,
      message: input.message,
      origin,
      artwork,
    });
    await sendContactEmail({
      to: data.settings.email,
      replyTo: input.email,
      ...notification,
      requestId: input.requestId,
    });
    let confirmationSent = true;
    try {
      await sendContactReceipt({
        to: input.email,
        replyTo: data.settings.email,
        ...renderContactConfirmation({
          artistName: data.settings.artistName,
          visitorName: input.name,
          contactEmail: data.settings.email,
        }),
        requestId: input.requestId,
      });
    } catch {
      // The artist notification was accepted already. A receipt failure must
      // not make a visitor retry and submit the same message twice.
      confirmationSent = false;
      console.error("Contact receipt was not accepted by the email provider.");
    }
    return success({ ok: true, confirmationSent });
  } catch (error) {
    return failure(error);
  }
}
