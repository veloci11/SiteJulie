import "server-only";
import { ServiceError } from "@/lib/validation/artwork";
import { contactConfigured } from "./config";

type ContactEmail = {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  requestId: string;
};

async function sendResendEmail(input: ContactEmail, scope: string) {
  if (!contactConfigured(input.to))
    throw new ServiceError(
      "L’envoi est momentanément indisponible. Vous pouvez écrire directement à l’adresse indiquée.",
      503,
    );
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `${scope}/${input.requestId}`,
      },
      body: JSON.stringify({
        from: process.env.CONTACT_EMAIL_FROM,
        to: [input.to],
        reply_to: input.replyTo,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || typeof result.id !== "string" || !result.id)
      throw new Error("Email not accepted");
  } catch {
    // Provider errors can contain account details. Never forward them to a visitor.
    throw new ServiceError(
      "Le message n’a pas pu être envoyé. Réessayez ou utilisez l’adresse email indiquée.",
      502,
    );
  }
}

export function sendContactEmail(input: ContactEmail) {
  return sendResendEmail(input, "museum-contact");
}

export function sendContactReceipt(input: ContactEmail) {
  return sendResendEmail(input, "museum-contact-receipt");
}
