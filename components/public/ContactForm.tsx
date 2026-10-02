"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Mail } from "lucide-react";
import Link from "next/link";
import type { Artwork } from "@/lib/data/types";

export default function ContactForm({
  artwork,
  enabled,
}: {
  artwork?: Artwork;
  enabled: boolean;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ payload: string; requestId: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !enabled) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const input = {
      name: String(values.get("name") || "").trim(),
      email: String(values.get("email") || "").trim(),
      message: String(values.get("message") || "").trim(),
      website: String(values.get("website") || ""),
      ...(artwork ? { artworkId: artwork.id } : {}),
    };
    const payload = JSON.stringify(input);
    if (pending.current?.payload !== payload)
      pending.current = { payload, requestId: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          requestId: pending.current.requestId,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true)
        throw new Error(
          result.error || "Le message n’a pas pu être envoyé. Réessayez.",
        );
      setSent(true);
      setConfirmationSent(result.confirmationSent === true);
      pending.current = null;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Connexion interrompue. Réessayez.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!enabled)
    return (
      <p className="contact-form-notice" role="status">
        L’envoi depuis le site est momentanément indisponible. Vous pouvez
        écrire directement par email ci-dessous.
      </p>
    );
  if (sent)
    return (
      <div className="contact-success" role="status">
        <Check size={22} />
        <p>Votre message a été envoyé.</p>
        <span>
          {confirmationSent
            ? "Une confirmation a été envoyée à votre adresse email. Julie pourra vous répondre à cette adresse."
            : "Julie pourra vous répondre à l’adresse indiquée. L’email de confirmation n’a pas pu être envoyé."}
        </span>
      </div>
    );
  return (
    <form
      className="contact-form"
      onSubmit={submit}
      aria-label="Envoyer un message"
      aria-busy={busy}
    >
      <div className="contact-form-row">
        <div>
          <label htmlFor={`${id}-name`}>Votre nom</label>
          <input
            id={`${id}-name`}
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
          />
        </div>
        <div>
          <label htmlFor={`${id}-email`}>Votre email</label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </div>
      </div>
      <label htmlFor={`${id}-message`}>Votre message</label>
      <textarea
        id={`${id}-message`}
        name="message"
        rows={5}
        required
        minLength={10}
        maxLength={5000}
        placeholder={
          artwork
            ? "Que souhaitez-vous savoir sur cette œuvre ?"
            : "Une œuvre, les cours, une question…"
        }
      />
      <div className="contact-honeypot" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Site web</label>
        <input
          id={`${id}-website`}
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <p className="contact-privacy">
        Votre nom, votre email et votre message servent uniquement à répondre à
        votre demande et à vous en confirmer l’envoi.{" "}
        <Link href="/confidentialite">Protection de vos données</Link>.
      </p>
      {error && (
        <p className="contact-form-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="button button-dark"
        disabled={busy || !enabled}
      >
        <Mail size={17} />
        {busy ? "Envoi en cours…" : "Envoyer le message"}
        <ArrowUpRight size={17} />
      </button>
    </form>
  );
}
