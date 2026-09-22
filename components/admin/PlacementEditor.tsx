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
  safePlacementOffsets,
  findZonePlacement,
  placementIssue,
  placementLimits,
  wallCoordinate,
  wallKey,
} from "@/lib/validation/placement";
import RoomPlan from "./RoomPlan";
import ShowroomSize, {
  ResizeHandle,
  MovementZone,
  previewImageStyle,
  previewSlotStyle,
} from "./ShowroomSize";
import { WALL_GUIDES, slotCode } from "@/lib/admin/placement-guide";
import { getZones, normalizeZoneArtwork } from "@/lib/museum/zones";
type Props = {
  artwork: AdminArtwork;
  artworks: AdminArtwork[];
  rooms: string[];
  collectionRooms?: Record<string, string>;
  onChange: (a: AdminArtwork) => void;
};
export default function PlacementEditor({
  artwork,
  artworks,
  rooms,
  collectionRooms,
  onChange,
}: Props) {
  const slots = getZones(artwork.roomId);
  const selected = slots.find((s) => s.id === artwork.slotId);
  const [wall, setWall] = useState(selected ? wallKey(selected) : 1);
  const [dragging, setDragging] = useState(false);
  const [automaticError, setAutomaticError] = useState("");
  const [resetVersion, setResetVersion] = useState(0);
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
    const board = event.currentTarget
      .closest(".admin-wall-preview")!
      .getBoundingClientRect();
    drag.current = {
      id: event.pointerId,
      slotId: slot.id,
      startX: event.clientX,
      startY: event.clientY,
      x: artwork.placementOffsetX ?? 0,
      y: artwork.placementOffsetY ?? 0,
      width: ((board.width - 2) / extent) * (slot.maxWidthM + FRAME_OUTSET),
      height: ((board.height - 2) / 4.2) * (slot.maxHeightM + FRAME_OUTSET),
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
      ...safePlacementOffsets(
        artwork,
        slot,
        dragPlacementOffsets(
          artwork,
          slot,
          { x: start.x, y: start.y },
          { x: event.clientX - start.startX, y: event.clientY - start.startY },
          start,
        ),
        artworks,
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
  const peers = artworks
    .filter((a) => a.id !== artwork.id && a.publication === "published")
    .map(normalizeZoneArtwork);
  const allowedRoom = (room: string) =>
    collectionFitsRoom(artwork, artworks, room, collectionRooms);
  const occupied = (slot: ArtworkSlot) =>
    peers.find((a) => a.slotId === slot.id);
  const shown = slots
    .filter((s) => wallKey(s) === wall)
    .sort(
      (a, b) =>
        wallCoordinate(a) - wallCoordinate(b) || b.position[1] - a.position[1],
    );
  const viewedGuide = WALL_GUIDES.find((entry) => entry.id === wall)!;
  const selectedGuide = selected
    ? WALL_GUIDES.find((entry) => entry.id === wallKey(selected))!
    : null;
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
    if (slot.id === selected?.id) return;
    setAutomaticError("");
    const fitted = findZonePlacement(artwork, slot, artworks, true);
    if (fitted) onChange(fitted);
    else
      setAutomaticError(
        "Impossible dans cette zone : pas assez de place pour garder un petit côté d’au moins 25 cm. Les œuvres présentes restent inchangées.",
      );
  }
  return (
    <div className="admin-placement">
      <p>
        Repérez le mur sur le plan, puis choisissez une place libre. Regarder un
        autre mur ne déplace pas votre tableau.
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
      <RoomPlan
        roomId={artwork.roomId}
        rooms={rooms}
        slots={slots}
        selected={selected}
        viewedWall={wall}
        occupied={occupied}
        onView={setWall}
      />
      <div className="admin-placement-choice" role="status">
        <span>Emplacement choisi</span>
        <strong>
          {selected
            ? `Salle ${artwork.roomId.replace("room-", "")} · ${selectedGuide!.code} · ${selectedGuide!.label} · ${slotCode(selected)}`
            : "Automatique · attribué à la publication"}
        </strong>
        {selected && wallKey(selected) !== wall && (
          <>
            <p>
              Vous regardez le mur {viewedGuide.code}. Votre tableau reste à
              l’emplacement {slotCode(selected)}.
            </p>
            <button
              type="button"
              className="admin-text-button"
              onClick={() => setWall(wallKey(selected))}
            >
              Revenir au tableau
            </button>
          </>
        )}
      </div>
      <p className="admin-wall-key">
        Pointillés : zone autorisée · Bleu : tableau sélectionné. Les cadres
        voisins bloquent le déplacement.
      </p>
      <header className="admin-wall-heading">
        <h4>
          2. {viewedGuide.code} · {viewedGuide.label} — vue de face
        </h4>
        <p>
          Les repères ci-dessous correspondent au plan. Les vignettes vous
          permettent de reconnaître les tableaux voisins.
        </p>
      </header>
      <p className="admin-help">
        Chaque zone accueille plusieurs œuvres. Seul le tableau ajouté est
        adapté à l’espace disponible.
      </p>
      <div
        className="admin-wall-preview"
        style={{
          aspectRatio: `${extent} / 4.2`,
          maxWidth: `${(extent / 4.2) * 320}px`,
        }}
        aria-label={`Aperçu ${viewedGuide.code} · ${viewedGuide.label}`}
      >
        <span className="admin-wall-floor" aria-hidden="true" />
        {shown.map((slot) => (
          <MovementZone
            key={slot.id}
            slot={slot}
            left={left}
            extent={extent}
            onClick={() => choose(slot)}
          />
        ))}
        {shown.flatMap((slot) =>
          [
            ...peers.filter((a) => a.slotId === slot.id),
            ...(selected?.id === slot.id ? [artwork] : []),
          ].map((displayed) => {
            const isSelected = displayed.id === artwork.id;
            const other = isSelected ? undefined : displayed;
            const size = displayed ? artworkSize(displayed, slot) : null;
            return (
              <button
                key={displayed.id}
                data-artwork-id={displayed.id}
                type="button"
                className={`admin-wall-slot${isSelected ? " selected" : ""}${other ? " occupied" : ""}`}
                disabled={Boolean(other) || !allowedRoom(artwork.roomId)}
                aria-pressed={isSelected}
                title={other ? `${slot.label} · ${other.title}` : undefined}
                aria-label={`${slotCode(slot)} · ${other ? `occupé par ${other.title}` : isSelected ? "votre tableau" : "emplacement libre"}`}
                onClick={() => choose(slot)}
                style={previewSlotStyle(slot, displayed, left, extent)}
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
                      width: "100%",
                      height: "100%",
                      left: "50%",
                      top: "50%",
                    }}
                  >
                    {displayed.thumbnail ? (
                      <img
                        src={displayed.thumbnail}
                        alt=""
                        draggable={false}
                        style={previewImageStyle(size)}
                      />
                    ) : (
                      <span>Votre œuvre</span>
                    )}
                    {displayed.availability === "sold" && <b>VENDUE</b>}
                  </span>
                ) : (
                  <span className="admin-slot-empty">+</span>
                )}
              </button>
            );
          }),
        )}
        {selected && wallKey(selected) === wall && (
          <ResizeHandle
            artwork={artwork}
            slot={selected}
            artworks={artworks}
            left={left}
            extent={extent}
            onChange={(displayScale) => onChange({ ...artwork, displayScale })}
          />
        )}
      </div>
      <div className="admin-placement-legend">
        <span>Pointillés : zones d’accrochage</span>
        <span>● Tableau exposé</span>
        <span>● Bleu : votre tableau</span>
        {selected && (
          <span>Glissez le tableau sélectionné pour le déplacer.</span>
        )}
      </div>
      <div
        className="admin-wall-inventory"
        aria-label={`Emplacements du mur ${viewedGuide.code}`}
      >
        {shown.map((slot) => {
          const other = occupied(slot);
          const isSelected = selected?.id === slot.id;
          const displayed = isSelected ? artwork : other;
          return (
            <button
              type="button"
              key={slot.id}
              className={isSelected ? "is-selected" : ""}
              disabled={!allowedRoom(artwork.roomId)}
              aria-pressed={isSelected}
              onClick={() => choose(slot)}
              aria-label={`${slotCode(slot)} · ${isSelected ? "Zone de ce tableau" : "Choisir cette zone"}`}
            >
              <b>{slotCode(slot)}</b>
              {displayed?.thumbnail ? (
                <img src={displayed.thumbnail} alt="" />
              ) : (
                <span className="admin-inventory-empty" aria-hidden="true">
                  +
                </span>
              )}
              <span>
                <strong>
                  {peers.filter((a) => a.slotId === slot.id).length +
                    (isSelected ? 1 : 0)}{" "}
                  tableau(x)
                </strong>
                <small>
                  {isSelected ? "Zone du tableau" : "Ajouter dans cette zone"}
                </small>
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="admin-text-button"
        onClick={() => {
          setAutomaticError("");
          const candidate = {
            ...artwork,
            slotId: "",
            placementOffsetX: 0,
            placementOffsetY: 0,
          };
          if (!artwork.image) {
            onChange(candidate);
            return;
          }
          try {
            const placed = resolvePlacement(
              {
                ...candidate,
                publication: "published",
                alt: artwork.alt || "Aperçu du tableau",
              },
              artworks,
              rooms,
              collectionRooms,
            );
            onChange({
              ...placed,
              publication: artwork.publication,
              alt: artwork.alt,
            });
          } catch (error) {
            setAutomaticError(
              error instanceof Error
                ? error.message
                : "Aucun emplacement adapté.",
            );
          }
        }}
      >
        Choisir automatiquement un emplacement
      </button>
      {automaticError && (
        <p className="admin-placement-warning" role="alert">
          {automaticError}
        </p>
      )}
      {selected && limits && wallKey(selected) === wall ? (
        <fieldset className="admin-placement-adjust">
          <legend>3. Ajuster le tableau · {slotCode(selected)}</legend>
          <ShowroomSize
            key={`${selected.id}:${resetVersion}`}
            artwork={artwork}
            slot={selected}
            artworks={artworks}
            onChange={(displayScale) => onChange({ ...artwork, displayScale })}
          />
          <div className="admin-two">
            {(
              [
                {
                  key: "placementOffsetX",
                  label: "Horizontal (cm)",
                  limit: limits.horizontal,
                  min: limits.minX,
                },
                {
                  key: "placementOffsetY",
                  label: "Hauteur (cm)",
                  limit: limits.vertical,
                  min: limits.minY,
                },
              ] as const
            ).map((axis) => (
              <div className="admin-offset-field" key={axis.key}>
                <span>{axis.label}</span>
                <OffsetInput
                  key={`${selected.id}:${resetVersion}`}
                  label={axis.label}
                  limit={Math.floor(axis.limit * 100)}
                  min={Math.ceil(axis.min * 100)}
                  value={Math.round((artwork[axis.key] ?? 0) * 100)}
                  decrease={
                    axis.key === "placementOffsetX"
                      ? "Déplacer de 1 cm vers la gauche"
                      : "Descendre de 1 cm"
                  }
                  increase={
                    axis.key === "placementOffsetX"
                      ? "Déplacer de 1 cm vers la droite"
                      : "Monter de 1 cm"
                  }
                  onChange={(value) =>
                    onChange({
                      ...artwork,
                      [axis.key]: value / 100,
                    })
                  }
                />
              </div>
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
            onClick={() => {
              setResetVersion((value) => value + 1);
              onChange({
                ...artwork,
                placementOffsetX: 0,
                placementOffsetY: 0,
                displayScale: 1,
              });
            }}
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
      ) : !selected ? (
        <p className="admin-help">
          Emplacement automatique : la place sera attribuée à la publication.
          Cliquez sur une zone pour la choisir vous-même.
        </p>
      ) : null}
    </div>
  );
}

/** Keep intermediate minus/empty keystrokes; never turn a negative move positive. */
export function OffsetInput({
  value,
  limit,
  min = -limit,
  label,
  decrease,
  increase,
  onChange,
}: {
  value: number;
  limit: number;
  min?: number;
  label: string;
  decrease: string;
  increase: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const emitted = useRef(value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setText(String(value));
    }
  }, [value]);
  const valid =
    /^-?\d+$/.test(text) && Number(text) >= min && Number(text) <= limit;
  useEffect(() => {
    input.current?.setCustomValidity(
      valid ? "" : `Saisissez un nombre entier entre ${min} et ${limit} cm.`,
    );
  }, [valid, limit, min]);
  function step(delta: number) {
    const next = Math.max(min, Math.min(limit, value + delta));
    emitted.current = next;
    setText(String(next));
    onChange(next);
  }
  return (
    <span className="admin-offset-control">
      <button
        type="button"
        aria-label={decrease}
        disabled={value <= min}
        onClick={() => step(-1)}
      >
        −
      </button>
      <input
        ref={input}
        aria-label={label}
        type="text"
        inputMode="decimal"
        required
        maxLength={7}
        value={text}
        aria-invalid={!valid || undefined}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (
            /^-?\d+$/.test(next) &&
            Number(next) >= min &&
            Number(next) <= limit
          ) {
            emitted.current = Number(next);
            onChange(Number(next));
          }
        }}
        onBlur={() => {
          if (valid) setText(String(Number(text)));
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            step(event.key === "ArrowUp" ? 1 : -1);
          }
        }}
      />
      <button
        type="button"
        aria-label={increase}
        disabled={value >= limit}
        onClick={() => step(1)}
      >
        +
      </button>
      <small>
        De {min < 0 ? `−${Math.abs(min)}` : min} à +{limit} cm
      </small>
    </span>
  );
}
