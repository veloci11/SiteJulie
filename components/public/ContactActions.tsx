"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, Copy, Check, Mail, Instagram } from "lucide-react";
import type { Artwork, SiteSettings } from "@/lib/data/types";
import { contactHref } from "@/lib/public";
// Only publish a web origin, never credentials, query strings or a configured path.
export function contactOrigin(value: string | undefined) {
  try {
    const url = new URL(value || "");
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.origin
      : "";
  } catch {
    return "";
  }
}
export default function ContactActions({
  settings,
  artwork,
}: {
  settings: SiteSettings;
  artwork?: Artwork;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  // The first client render must equal SSR. Reading window during render left
  // the server's relative mailto href unpatched after React hydration.
  const [origin, setOrigin] = useState(() =>
    contactOrigin(process.env.NEXT_PUBLIC_SITE_URL),
  );
  useEffect(() => {
    if (!origin) setOrigin(contactOrigin(window.location.origin));
  }, [origin]);
  const awaitingOrigin = Boolean(settings.email && artwork && !origin);
  const href = awaitingOrigin ? null : contactHref(settings, artwork, origin);
  return (
    <div className="contact-actions">
      {artwork && (
        <div className="contact-context">
          <img src={artwork.thumbnail} alt="" />
          <div>
            <span className="eyebrow">Votre demande concerne</span>
            <strong>{artwork.title}</strong>
            <small>Référence {artwork.id}</small>
          </div>
        </div>
      )}
      {href ? (
        <>
          <a className="button button-dark" href={href}>
            <Mail size={17} /> Écrire un message <ArrowUpRight size={17} />
          </a>
          <div className="email-line">
            <a href={`mailto:${settings.email}`}>{settings.email}</a>
            <button
              type="button"
              className="icon-button"
              aria-label="Copier l’adresse email"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(settings.email);
                  setCopied(true);
                  setError("");
                } catch {
                  setError(
                    "Copie indisponible. Sélectionnez l’adresse ci-dessus.",
                  );
                }
              }}
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}
            </button>
          </div>
          <small className="muted">
            Ouvre votre application de messagerie.
          </small>
          <span role="status" className="muted">
            {copied ? "Adresse copiée." : error}
          </span>
        </>
      ) : awaitingOrigin ? (
        <p role="status" className="muted">
          Préparation du lien de contact…
        </p>
      ) : (
        <div className="contact-unconfigured">
          <Mail size={22} />
          <p>L’adresse de contact sera bientôt renseignée.</p>
          <small>
            Elle se configure dans l’administration de cette version de
            démonstration.
          </small>
        </div>
      )}
      {settings.instagramUrl && (
        <a
          className="text-link"
          href={settings.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Instagram size={17} /> Retrouvez Julie sur Instagram{" "}
          <ArrowUpRight size={15} />
        </a>
      )}
    </div>
  );
}
