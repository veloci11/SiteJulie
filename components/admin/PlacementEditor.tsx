"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { collectionFitsRoom } from "@/lib/data/collections";
import { resolvePlacement } from "@/lib/validation/artwork";
import type { AdminArtwork } from "@/lib/data/types";
import {
  artworkSize,
  FRAME_OUTSET,
  getSlots,
  type ArtworkSlot,
} from "@/lib/museum/config";
import {
  dragPlacementOffsets,
  placementIssue,
  placementLimits,
  wallCoordinate,
  wallKey,
} from "@/lib/validation/placement";
const WALLS = [
  { id: 1, label: "Mur gauche" },
  { id: 3, label: "Mur droit" },
  { id: 0, label: "Mur du fond" },
  { id: 2, label: "Mur d’entrée" },
];
type Props = {
  artwork: AdminArtwork;
  artworks: AdminArtwork[];
  rooms: string[];
  onChange: (a: AdminArtwork) => void;
};
export default function PlacementEditor({
  artwork,
  artworks,
  rooms,
  onChange,
}: Props) {
  const slots = getSlots(artwork.roomId);
  const selected = slots.find((s) => s.id === artwork.slotId);
  const [wall, setWall] = useState(selected ? wallKey(selected) : 1);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    id: number;
    slotId: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  function beginDrag(event: PointerEvent<HTMLSpanElement>, slot: ArtworkSlot) {
    if (event.button !== 0 || slot.id !== artwork.slotId) return;
    const zone = event.currentTarget.parentElement!.getBoundingClientRect();
    drag.current = {
      id: event.pointerId,
      slotId: slot.id,
      startX: event.clientX,
      startY: event.clientY,
      x: artwork.placementOffsetX ?? 0,
      y: artwork.placementOffsetY ?? 0,
      width: zone.width,
      height: zone.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    setDragging(true);
  }
  function moveDrag(event: PointerEvent<HTMLSpanElement>, slot: ArtworkSlot) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId || start.slotId !== slot.id)
      return;
    event.preventDefault();
    event.stopPropagation();
    onChange({
      ...artwork,
      ...dragPlacementOffsets(
        artwork,
        slot,
        { x: start.x, y: start.y },
        { x: event.clientX - start.startX, y: event.clientY - start.startY },
        start,
      ),
    });
  }
  function endDrag(event: PointerEvent<HTMLSpanElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  useEffect(() => {
    const next = getSlots(artwork.roomId).find((s) => s.id === artwork.slotId);
    if (next) setWall(wallKey(next));
  }, [artwork.roomId, artwork.slotId]);
  useEffect(() => {
    if (artwork.slotId || !artwork.image || !artwork.alt.trim()) return;
    try {
      const placed = resolvePlacement(
        { ...artwork, publication: "published" },
        artworks,
        rooms,
      );
      onChange({ ...placed, publication: artwork.publication });
    } catch {
      /* The server returns the actionable error if no safe position exists. */
    }
  }, [artwork, artworks, rooms, onChange]);
  const peers = artworks.filter(
    (a) => a.id !== artwork.id && a.publication === "published",
  );
  const allowedRoom = (room: string) =>
    collectionFitsRoom(artwork, artworks, room);
  const occupied = (slot: ArtworkSlot) =>
    peers.find((a) => a.slotId === slot.id);
  const shown = slots.filter((s) => wallKey(s) === wall);
  const left =
    Math.min(
      ...shown.map((s) => wallCoordinate(s) - (s.maxWidthM + FRAME_OUTSET) / 2),
    ) - 0.12;
  const right =
    Math.max(
      ...shown.map((s) => wallCoordinate(s) + (s.maxWidthM + FRAME_OUTSET) / 2),
    ) + 0.12;
  const extent = Math.max(1, right - left);
  const limits = selected ? placementLimits(artwork, selected) : null;
  const issue = selected ? placementIssue(artwork, selected, artworks) : null;
  function choose(slot: ArtworkSlot) {
    onChange({
      ...artwork,
      roomId: slot.roomId,
      slotId: slot.id,
      placementOffsetX: 0,
      placementOffsetY: 0,
    });
  }
  function rescale(value: number) {
    const next = { ...artwork, displayScale: value };
    if (selected) {
      const bounds = placementLimits(next, selected);
      const horizontal = Math.floor(bounds.horizontal * 100) / 100;
      const vertical = Math.floor(bounds.vertical * 100) / 100;
      next.placementOffsetX = Math.max(
        -horizontal,
        Math.min(horizontal, next.placementOffsetX ?? 0),
      );
      next.placementOffsetY = Math.max(
        -vertical,
        Math.min(vertical, next.placementOffsetY ?? 0),
      );
    }
    onChange(next);
  }
  return (
    <div className="admin-placement">
      <p>
        Choisissez un mur, puis une zone libre. Le cadre et les tableaux voisins
        restent visibles pendant vos réglages.
      </p>
      <p className="admin-placement-room">
        <strong>
          Salle {artwork.roomId.replace("room-", "")} ·{" "}
          {artwork.collection || "Sans collection"}
        </strong>
        <br />
        <small>La salle suit la collection choisie ci-dessus.</small>
      </p>
      {!allowedRoom(artwork.roomId) && (
        <p className="admin-placement-warning">
          Cette collection doit rejoindre sa salle. Choisissez son emplacement
          automatique.
        </p>
      )}
      <div className="admin-wall-tabs" aria-label="Choisir le mur">
        {WALLS.map((w) => (
          <button
            type="button"
            key={w.id}
            aria-pressed={wall === w.id}
            onClick={() => setWall(w.id)}
          >
            <svg viewBox="0 0 100 30" aria-hidden="true">
              <rect x="1" y="1" width="98" height="28" rx="2" fill="#e9e3d7" />
              {slots
                .filter((s) => wallKey(s) === w.id)
                .map((s, i, group) => (
                  <rect
                    key={s.id}
                    x={5 + (i * 90) / group.length}
                    y="6"
                    width={78 / group.length}
                    height="18"
                    rx="1"
                    fill={
                      s.id === artwork.slotId
                        ? "#546346"
                        : occupied(s)
                          ? "#b1a18c"
                          : "#fcfaf5"
                    }
                    stroke="#bfb6a7"
                  />
                ))}
            </svg>
            {w.label}
          </button>
        ))}
      </div>
      <div
        className="admin-wall-preview"
        style={{
          aspectRatio: `${extent} / 4.2`,
          maxWidth: `${(extent / 4.2) * 320}px`,
        }}
        aria-label={`Aperçu ${WALLS.find((w) => w.id === wall)?.label.toLowerCase()}`}
      >
        <span className="admin-wall-floor" aria-hidden="true" />
        {shown.map((slot) => {
          const other = occupied(slot);
          const isSelected = selected?.id === slot.id;
          const displayed = isSelected ? artwork : other;
          const size = displayed ? artworkSize(displayed, slot) : null;
          const x = ((wallCoordinate(slot) - left) / extent) * 100;
          const cellWidth = ((slot.maxWidthM + FRAME_OUTSET) / extent) * 100;
          return (
            <button
              key={slot.id}
              type="button"
              className={`admin-wall-slot${isSelected ? " selected" : ""}${other ? " occupied" : ""}`}
              disabled={Boolean(other) || !allowedRoom(artwork.roomId)}
              aria-pressed={isSelected}
              aria-label={`${slot.label}${other ? ` · occupé par ${other.title}` : " · emplacement libre"}`}
              onClick={() => choose(slot)}
              style={{
                left: `${x - cellWidth / 2}%`,
                width: `${cellWidth}%`,
                top: "9%",
                height: `${((slot.maxHeightM + FRAME_OUTSET) / 4.2) * 100}%`,
              }}
            >
              {displayed && size ? (
                <span
                  className={`admin-wall-artwork ${displayed.availability === "sold" ? "sold" : ""}${isSelected ? " is-draggable" : ""}`}
                  data-dragging={isSelected && dragging ? "true" : undefined}
                  title={
                    isSelected
                      ? "Glissez pour déplacer le tableau. Les champs en centimètres restent disponibles."
                      : undefined
                  }
                  onPointerDown={
                    isSelected ? (event) => beginDrag(event, slot) : undefined
                  }
                  onPointerMove={
                    isSelected ? (event) => moveDrag(event, slot) : undefined
                  }
                  onPointerUp={isSelected ? endDrag : undefined}
                  onPointerCancel={isSelected ? endDrag : undefined}
                  onLostPointerCapture={isSelected ? endDrag : undefined}
                  onClick={
                    isSelected
                      ? (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }
                      : undefined
                  }
                  style={{
                    width: `${((size.width + FRAME_OUTSET) / (slot.maxWidthM + FRAME_OUTSET)) * 100}%`,
                    height: `${((size.height + FRAME_OUTSET) / (slot.maxHeightM + FRAME_OUTSET)) * 100}%`,
                    left: `${50 + ((displayed.placementOffsetX ?? 0) / (slot.maxWidthM + FRAME_OUTSET)) * 100}%`,
                    top: `${50 - ((displayed.placementOffsetY ?? 0) / (slot.maxHeightM + FRAME_OUTSET)) * 100}%`,
                  }}
                >
                  {displayed.thumbnail ? (
                    <img src={displayed.thumbnail} alt="" draggable={false} />
                  ) : (
                    <span>Votre œuvre</span>
                  )}
                  {displayed.availability === "sold" && <b>VENDUE</b>}
                </span>
              ) : (
                <span className="admin-slot-empty">+</span>
              )}
              <span className="admin-slot-label">
                {slot.label.replace(/.*· /, "")}
                {other
                  ? " · occupé"
                  : isSelected
                    ? " · sélectionné"
                    : " · libre"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="admin-placement-legend">
        <span>○ Zone libre</span>
        <span>▣ Œuvre exposée</span>
        <span>▣ Vert : sélection</span>
        {selected && (
          <span>Glissez le tableau sélectionné pour le déplacer.</span>
        )}
      </div>
      <button
        type="button"
        className="admin-text-button"
        onClick={() =>
          onChange({
            ...artwork,
            slotId: "",
            placementOffsetX: 0,
            placementOffsetY: 0,
          })
        }
      >
        Choisir automatiquement un emplacement
      </button>
      {selected && limits ? (
        <fieldset className="admin-placement-adjust">
          <legend>Régler « {selected.label} »</legend>
          <label>
            Taille d’accrochage ·{" "}
            {Math.round((artwork.displayScale ?? 1) * 100)} %
            <input
              aria-label="Taille d’accrochage"
              type="range"
              min="35"
              max="100"
              step="1"
              value={Math.round((artwork.displayScale ?? 1) * 100)}
              onChange={(e) => rescale(Number(e.target.value) / 100)}
            />
          </label>
          <p className="admin-help">
            {artwork.widthCm || artwork.heightCm
              ? "Les dimensions déclarées sont conservées. Ce réglage change seulement la taille présentée dans la salle."
              : "Échelle indicative : les dimensions réelles ne sont pas encore renseignées."}{" "}
            Présentation : {Math.round(limits.width * 100)} ×{" "}
            {Math.round(limits.height * 100)} cm.
          </p>
          <div className="admin-two">
            {(
              [
                {
                  key: "placementOffsetX",
                  label: "Horizontal (cm)",
                  limit: limits.horizontal,
                },
                {
                  key: "placementOffsetY",
                  label: "Hauteur (cm)",
                  limit: limits.vertical,
                },
              ] as const
            ).map((axis) => (
              <label key={axis.key}>
                {axis.label}
                <input
                  type="number"
                  min={-Math.floor(axis.limit * 100)}
                  max={Math.floor(axis.limit * 100)}
                  step="1"
                  value={Math.round((artwork[axis.key] ?? 0) * 100)}
                  onChange={(e) =>
                    onChange({
                      ...artwork,
                      [axis.key]: Number(e.target.value) / 100,
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className="admin-help">
            Horizontal positif : vers la droite du mur. Hauteur positive : vers
            le haut. Réduisez la taille pour libérer de l’espace autour du
            cadre.
          </p>
          <button
            type="button"
            className="admin-text-button"
            onClick={() =>
              onChange({
                ...artwork,
                placementOffsetX: 0,
                placementOffsetY: 0,
                displayScale: 1,
              })
            }
          >
            Recentrer et rétablir la taille
          </button>
          <p
            className={issue ? "admin-placement-warning" : "admin-placement-ok"}
            role="status"
          >
            {issue || "Le cadre tient dans sa zone, sans chevauchement."}
          </p>
        </fieldset>
      ) : (
        <p className="admin-help">
          Emplacement automatique : la place sera attribuée à la publication.
          Cliquez sur une zone pour la choisir vous-même.
        </p>
      )}
    </div>
  );
}
