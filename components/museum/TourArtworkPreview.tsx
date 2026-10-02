"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { ArrowUpRight } from "lucide-react";
import type { Artwork, Destination } from "@/lib/data/types";
import { priceLabel } from "@/lib/public";

export function TourArtworkPreview({
  artwork,
  dock,
  onSelect,
  collectionDescriptions,
  lookingAround = false,
}: {
  artwork: Artwork | undefined;
  collectionDescriptions?: Record<string, string>;
  lookingAround?: boolean;
  dock: RefObject<HTMLElement | null>;
  onSelect: (destination: Destination) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [bottom, setBottom] = useState<number | null>(null);
  const [held, setHeld] = useState<Artwork | null>(null);
  const visible = lookingAround ? artwork : (held ?? artwork);
  useEffect(() => {
    if (lookingAround) setHeld(null);
  }, [lookingAround]);
  useEffect(() => {
    const node = dock.current;
    const shell = node?.closest(".visit-shell");
    if (!node || !shell) return;
    const measure = () =>
      setBottom(
        shell.getBoundingClientRect().bottom -
          node.getBoundingClientRect().top +
          10,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(shell);
    measure();
    return () => observer.disconnect();
  }, [dock]);
  if (!visible || bottom === null) return null;
  return (
    <button
      ref={button}
      className="visit-auto-preview"
      style={{ "--preview-bottom": `${bottom}px` } as CSSProperties}
      data-artwork-id={visible.id}
      aria-label={`Découvrir ${visible.title}`}
      onClick={() => onSelect({ kind: "artwork", artworkId: visible.id })}
      // Do not replace the intended click target while it is hovered or focused.
      onPointerEnter={() => setHeld(visible)}
      onPointerLeave={() => {
        if (document.activeElement !== button.current) setHeld(null);
      }}
      onFocus={() => setHeld(visible)}
      onBlur={() => {
        if (!button.current?.matches(":hover")) setHeld(null);
      }}
    >
      <span className="visit-auto-preview-collection">
        Collection : {visible.collection}
      </span>
      <img
        src={visible.thumbnail}
        alt=""
        crossOrigin="anonymous"
        decoding="async"
      />
      <span className="visit-auto-preview-copy">
        <strong>{visible.title}</strong>
        <span>{priceLabel(visible)}</span>
      </span>
      {collectionDescriptions?.[visible.collection] && (
        <span className="visit-auto-preview-description">
          {collectionDescriptions[visible.collection]}
        </span>
      )}
      <span className="visit-auto-preview-action">
        Découvrir l’œuvre <ArrowUpRight size={16} aria-hidden="true" />
      </span>
    </button>
  );
}
