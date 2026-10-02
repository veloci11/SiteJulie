import "server-only";
import { z } from "zod";
import type { SiteSettings } from "@/lib/data/types";

export function effectiveContactSettings(settings: SiteSettings): SiteSettings {
  const previous = process.env.CONTACT_EMAIL_MIGRATION_FROM?.trim();
  const replacement = process.env.CONTACT_EMAIL_MIGRATION_TO?.trim();
  if (
    !previous ||
    !replacement ||
    settings.email.toLowerCase() !== previous.toLowerCase() ||
    !z.email().safeParse(replacement).success
  )
    return settings;
  return { ...settings, email: replacement };
}

export function contactConfigured(recipient: string) {
  const from = process.env.CONTACT_EMAIL_FROM?.trim() || "";
  const mailbox = from.match(/<([^<>]+)>$/)?.[1] || from;
  return Boolean(
    ["blob", "supabase"].includes(process.env.MUSEUM_DATA_MODE || "") &&
    process.env.VERCEL_ENV !== "preview" &&
    process.env.CONTACT_FORM_ENABLED !== "0" &&
    process.env.RESEND_API_KEY?.trim() &&
    !/[\r\n]/.test(from) &&
    z.email().safeParse(mailbox).success &&
    z.email().safeParse(recipient).success,
  );
}
