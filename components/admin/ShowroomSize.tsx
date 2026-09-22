"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { AdminArtwork } from "@/lib/data/types";
import { zoneBounds } from "@/lib/museum/zones";
import { slotCode } from "@/lib/admin/placement-guide";
import {
  artworkSize,
  FRAME_OUTSET,
  MIN_DISPLAY_SCALE,
  type ArtworkSlot,
} from "@/lib/museum/config";
import {
  resizedScaleFromPointer,
  safeDisplayScale,
  wallCoordinate,
} from "@/lib/validation/placement";

export function previewImageStyle(size: { width: number; height: number }) {
  return {
    width: `${(100 * size.width) / (size.width + FRAME_OUTSET)}%`,
    height: `${(100 * size.height) / (size.height + FRAME_OUTSET)}%`,
    left: `${(50 * FRAME_OUTSET) / (size.width + FRAME_OUTSET)}%`,
    top: `${(50 * FRAME_OUTSET) / (size.height + FRAME_OUTSET)}%`,
  };
}
/** One visible/clickable frame per work; overlapping maximum envelopes are hidden. */
export function previewSlotStyle(
  slot: ArtworkSlot,
  artwork: AdminArtwork | undefined,
  left: number,
  extent: number,
) {
  const size = artwork
    ? artworkSize(artwork, slot)
    : { width: 0.8, height: 0.6 };
  const width = size.width + FRAME_OUTSET;
  const height = size.height + FRAME_OUTSET;
  return {
    left: `${(100 * (wallCoordinate(slot) - left + (artwork?.placementOffsetX ?? 0) - width / 2)) / extent}%`,
    top: `${(100 * (4.2 - slot.position[1] - (artwork?.placementOffsetY ?? 0) - height / 2)) / 4.2}%`,
    width: `${(100 * width) / extent}%`,
    height: `${(100 * height) / 4.2}%`,
  };
}
export function MovementZone({
  slot,
  left,
  extent,
  onClick,
  onDrop,
}: {
  slot: ArtworkSlot;
  left: number;
  extent: number;
  onClick?: () => void;
  onDrop?: (event: React.DragEvent) => void;
}) {
  const bounds = zoneBounds(slot);
  return (
    <button
      type="button"
      className="admin-movement-zone"
      aria-label={`Zone ${slotCode(slot)} · Ajouter le tableau sélectionné`}
      data-zone-id={slot.id}
      onClick={onClick}
      onDragOver={
        onDrop
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }
          : undefined
      }
      onDrop={onDrop}
      style={{
        left: `${(100 * (wallCoordinate(slot) - left - (slot.maxWidthM + FRAME_OUTSET) / 2)) / extent}%`,
        top: `${(100 * (4.2 - bounds.top - FRAME_OUTSET / 2)) / 4.2}%`,
        width: `${(100 * (slot.maxWidthM + FRAME_OUTSET)) / extent}%`,
        height: `${(100 * (bounds.top - bounds.bottom + FRAME_OUTSET)) / 4.2}%`,
      }}
    >
      <span>{slotCode(slot)}</span>
    </button>
  );
}
type SizingProps = {
  artwork: AdminArtwork;
  slot: ArtworkSlot;
  artworks: readonly AdminArtwork[];
  onChange: (scale: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
};

export function ResizeHandle({
  artwork,
  slot,
  artworks,
  onChange,
  onStart,
  onEnd,
  left,
  extent,
}: SizingProps & { left: number; extent: number }) {
  const [active, setActive] = useState(false);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    ppm: number;
    source: AdminArtwork;
  } | null>(null);
  const size = artworkSize(artwork, slot);
  function finish(event: PointerEvent<HTMLButtonElement>) {
    if (gesture.current?.id !== event.pointerId) return;
    gesture.current = null;
    setActive(false);
    onEnd?.();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <button
      type="button"
      className="admin-resize-handle"
      aria-label="Redimensionner le tableau"
      title="Glissez ce coin pour redimensionner. Au clavier : flèches pour ajuster la taille."
      data-resizing={active ? "true" : undefined}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const board =
          event.currentTarget.parentElement!.getBoundingClientRect();
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          ppm: (board.width - 2) / extent,
          source: artwork,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        onStart?.();
        setActive(true);
      }}
      onPointerMove={(event) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const scale = resizedScaleFromPointer(
          start.source.displayScale ?? 1,
          artworkSize({ ...start.source, displayScale: 1 }, slot),
          { x: event.clientX - start.x, y: event.clientY - start.y },
          start.ppm,
        );
        onChange(safeDisplayScale(start.source, slot, scale, artworks));
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onKeyDown={(event) => {
        const direction = ["ArrowRight", "ArrowUp"].includes(event.key)
          ? 1
          : ["ArrowLeft", "ArrowDown"].includes(event.key)
            ? -1
            : 0;
        if (!direction && !["Home", "End"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const scale =
          event.key === "Home"
            ? MIN_DISPLAY_SCALE
            : event.key === "End"
              ? 1
              : (artwork.displayScale ?? 1) +
                direction * (event.shiftKey ? 0.1 : 0.01);
        onChange(safeDisplayScale(artwork, slot, scale, artworks));
      }}
      style={{
        left: `${(100 * (wallCoordinate(slot) - left + (artwork.placementOffsetX ?? 0) + (size.width + FRAME_OUTSET) / 2)) / extent}%`,
        top: `${(100 * (4.2 - slot.position[1] - (artwork.placementOffsetY ?? 0) + (size.height + FRAME_OUTSET) / 2)) / 4.2}%`,
      }}
    >
      <span aria-hidden="true">↘</span>
    </button>
  );
}

function SizeInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const format = (n: number) => String(Math.round(n * 10) / 10);
  const [text, setText] = useState(format(value));
  const emitted = useRef(value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (Math.abs(value - emitted.current) > 0.02) {
      setText(format(value));
      emitted.current = value;
    }
  }, [value]);
  const parsed =
    text.trim() && /^\d+(?:[.,]\d*)?$/.test(text)
      ? Number(text.replace(",", "."))
      : NaN;
  const valid =
    Number.isFinite(parsed) &&
    parsed >= Number(format(min)) - 0.000001 &&
    parsed <= Number(format(max)) + 0.000001;
  useEffect(() => {
    input.current?.setCustomValidity(
      valid
        ? ""
        : `Saisissez une taille entre ${format(min)} et ${format(max)} cm.`,
    );
  }, [valid, min, max]);
  function emit(n: number) {
    emitted.current = n;
    onChange(n);
  }
  return (
    <label>
      {label}
      <input
        ref={input}
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={!valid}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const n = /^\d+(?:[.,]\d*)?$/.test(next)
            ? Number(next.replace(",", "."))
            : NaN;
          if (Number.isFinite(n) && n >= min && n <= max) emit(n);
        }}
        onBlur={() => {
          if (!Number.isFinite(parsed)) return;
          const bounded = Math.max(min, Math.min(max, parsed));
          setText(format(bounded));
          emit(bounded);
        }}
      />
      <small>
        De {format(min)} à {format(max)} cm
      </small>
    </label>
  );
}

export default function ShowroomSize({
  artwork,
  slot,
  artworks,
  onChange,
  onStart,
  onEnd,
}: SizingProps) {
  const base = artworkSize({ ...artwork, displayScale: 1 }, slot);
  const size = artworkSize(artwork, slot);
  const maximum = safeDisplayScale(artwork, slot, 1, artworks);
  const update = (scale: number) =>
    onChange(safeDisplayScale(artwork, slot, scale, artworks));
  return (
    <div className="admin-showroom-size">
      <label>
        Taille dans le showroom ·{" "}
        {Math.round((artwork.displayScale ?? 1) * 100)} %
        <input
          aria-label="Taille dans le showroom"
          type="range"
          min={MIN_DISPLAY_SCALE * 100}
          max="100"
          step="1"
          value={Math.round((artwork.displayScale ?? 1) * 100)}
          onPointerDown={onStart}
          onPointerUp={onEnd}
          onPointerCancel={onEnd}
          onBlur={onEnd}
          onChange={(event) => update(Number(event.target.value) / 100)}
        />
      </label>
      <div className="admin-two">
        <SizeInput
          label="Largeur dans le showroom (cm)"
          value={size.width * 100}
          min={base.width * MIN_DISPLAY_SCALE * 100}
          max={base.width * maximum * 100}
          onChange={(value) => update(value / 100 / base.width)}
        />
        <SizeInput
          label="Hauteur dans le showroom (cm)"
          value={size.height * 100}
          min={base.height * MIN_DISPLAY_SCALE * 100}
          max={base.height * maximum * 100}
          onChange={(value) => update(value / 100 / base.height)}
        />
      </div>
      <p className="admin-help">
        Les proportions de la photo sont conservées. La taille s’arrête au bord
        de la place ou avant un cadre voisin. Les dimensions réelles de la
        description restent inchangées.
      </p>
      {(artwork.widthCm || artwork.heightCm) && (
        <button
          type="button"
          className="admin-text-button"
          onClick={() =>
            update(
              artwork.widthCm
                ? artwork.widthCm / 100 / base.width
                : artwork.heightCm! / 100 / base.height,
            )
          }
        >
          Partir des dimensions réelles
        </button>
      )}
    </div>
  );
}
