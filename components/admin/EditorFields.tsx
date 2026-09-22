"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import type { AdminArtwork } from "@/lib/data/types";

/** Keep decimal keystrokes (including a French comma) until the field is left. */
export function PriceInput({
  artwork,
  onChange,
}: {
  artwork: AdminArtwork;
  onChange: (value: number | null) => void;
}) {
  const [text, setText] = useState(
    artwork.priceMinor === null ? "" : String(artwork.priceMinor / 100),
  );
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== input.current)
      setText(
        artwork.priceMinor === null ? "" : String(artwork.priceMinor / 100),
      );
  }, [artwork.priceMinor]);
  return (
    <input
      ref={input}
      type="text"
      inputMode="decimal"
      maxLength={15}
      required={artwork.priceVisibility === "public"}
      value={text}
      placeholder="Ex. 1250,50"
      onChange={(event) => {
        const value = event.target.value;
        setText(value);
        const normalized = value.trim().replace(",", ".");
        const valid =
          !normalized ||
          (/^\d+(?:\.\d{0,2})?$/.test(normalized) &&
            Number(normalized) <= 100000000);
        event.target.setCustomValidity(
          valid ? "" : "Saisissez un prix positif avec deux décimales maximum.",
        );
        if (valid)
          onChange(normalized ? Math.round(Number(normalized) * 100) : null);
      }}
    />
  );
}

export function ArtworkImage({
  artwork,
  file,
  preview,
  busy,
  onFile,
  onAlt,
  onError,
  onChecking,
}: {
  artwork: AdminArtwork;
  file: File | null;
  preview: string;
  busy: boolean;
  onFile: (file: File | null) => void;
  onAlt: (alt: string) => void;
  onError: (message: string) => void;
  onChecking: (checking: boolean) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [checking, setChecking] = useState(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  async function choose(file: File) {
    if (busy || checking) return;
    if (!/\.(jpe?g|png|webp|avif)$/i.test(file.name)) {
      onError(
        "Choisissez une image JPEG, PNG, WebP ou AVIF. Pour une photo HEIC, exportez-la en JPEG.",
      );
      return;
    }
    if (!file.size || file.size > 20 * 1024 * 1024) {
      onError("Choisissez une image non vide de 20 Mio maximum.");
      return;
    }
    const current = ++request.current;
    setChecking(true);
    onChecking(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (image.naturalWidth * image.naturalHeight > 25_000_000)
        throw new Error(
          "Cette image dépasse 25 mégapixels. Réduisez sa résolution avant de l’ajouter.",
        );
      if (current === request.current) onFile(file);
    } catch (error) {
      if (current === request.current)
        onError(
          error instanceof Error && error.message.includes("mégapixels")
            ? error.message
            : "Cette image ne peut pas être lue. Essayez un autre fichier.",
        );
    } finally {
      URL.revokeObjectURL(url);
      if (current === request.current) {
        setChecking(false);
        onChecking(false);
      }
    }
  }
  return (
    <section className="admin-card admin-image-card">
      <h2>Image du tableau</h2>
      <div
        className={`admin-image-preview${dragging ? " is-dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length > 1)
            onError("Ajoutez une seule image principale à la fois.");
          else if (e.dataTransfer.files[0])
            void choose(e.dataTransfer.files[0]);
        }}
      >
        {preview || artwork.image ? (
          <img
            src={preview || artwork.detailImage || artwork.image}
            alt={artwork.alt || "Aperçu du tableau"}
          />
        ) : (
          <div>
            <ImagePlus size={36} />
            <p>Déposez la photo de votre tableau ici</p>
          </div>
        )}
      </div>
      <label className="admin-upload">
        <ImagePlus size={18} />
        {checking
          ? "Vérification de l’image…"
          : preview || artwork.image
            ? "Remplacer l’image"
            : "Choisir une image"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
          disabled={busy || checking}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void choose(file);
            e.target.value = "";
          }}
        />
      </label>
      {file && (
        <div className="admin-pending-image" role="status">
          <span>
            {file.name}
            <small>
              Prête à être enregistrée ·{" "}
              {(file.size / 1024 / 1024).toLocaleString("fr-FR", {
                maximumFractionDigits: 1,
              })}{" "}
              Mio
            </small>
          </span>
          <button
            type="button"
            aria-label="Annuler le changement d’image"
            disabled={busy}
            onClick={() => onFile(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}
      <small>
        JPEG, PNG, WebP ou AVIF · 20 Mio / 25 mégapixels maximum. Les
        proportions sont conservées.
      </small>
      <label>
        Texte alternatif
        <textarea
          rows={2}
          maxLength={500}
          value={artwork.alt}
          onChange={(e) => onAlt(e.target.value)}
          placeholder="Décrivez brièvement ce que l’on voit"
          required={artwork.publication === "published"}
        />
        <small>
          Une courte description pour les personnes qui ne voient pas l’image.
          Obligatoire pour publier.
        </small>
      </label>
    </section>
  );
}
