"use client";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from "react";
import { ArrowLeft, Undo2, Redo2, LockKeyhole, Save } from "lucide-react";
import {
  makeRoomLayout,
  normalizeRoomLayout,
  layoutSnapshotMatches,
  layoutArtworks,
  layoutIssues,
  type RoomLayoutPlan,
  type RoomLayoutSession,
  type RoomLayoutItem,
  type RoomLayoutDraft,
} from "@/lib/admin/room-layout";
import { getSlots, artworkSize, FRAME_OUTSET } from "@/lib/museum/config";
import {
  wallKey,
  wallCoordinate,
  placementLimits,
  dragPlacementOffsets,
  safePlacementOffsets,
  findZonePlacement,
} from "@/lib/validation/placement";
import type { AdminArtwork } from "@/lib/data/types";
import type { ArtworkSlot } from "@/lib/museum/config";
import { getZones, normalizeZoneArtwork } from "@/lib/museum/zones";
import { slotCode, WALL_GUIDES } from "@/lib/admin/placement-guide";
import { notifyCatalogueChanged } from "@/lib/museum/catalogueEvents";
import RoomPlan from "./RoomPlan";
import ShowroomSize, {
  ResizeHandle,
  MovementZone,
  previewImageStyle,
  previewSlotStyle,
} from "./ShowroomSize";
import { OffsetInput } from "./PlacementEditor";
import "./room-layout.css";

async function request<T>(url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Connexion interrompue. Vos essais sont conservés ici ; réessayez avant de fermer.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw Object.assign(
      new Error(
        response.status === 401
          ? "Votre session a expiré. Reconnectez-vous dans un autre onglet, puis réessayez ici."
          : data?.error ||
              "Enregistrement impossible. Vos essais sont conservés ; réessayez.",
      ),
      { status: response.status },
    );
  return data;
}
const signature = (plan: RoomLayoutPlan) => JSON.stringify(plan);
export default function RoomLayoutEditor({
  roomId,
  rooms,
  onClose,
}: {
  roomId: string;
  rooms: string[];
  onClose: (applied?: boolean) => void;
}) {
  const [session, setSession] = useState<RoomLayoutSession | null>(null);
  const [history, setHistory] = useState<RoomLayoutPlan[]>([]);
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState("");
  const [version, setVersion] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wall, setWall] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [inputTouched, setInputTouched] = useState(false);
  const operation = useRef(false);
  const dragId = useRef<string | null>(null);
  const resizeHistory = useRef<RoomLayoutPlan[] | null>(null);
  const pointerDrag = useRef<{
    id: number;
    art: AdminArtwork;
    slot: ArtworkSlot;
    x: number;
    y: number;
    width: number;
    height: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const plan = history[index];
  const dirty = inputTouched || Boolean(plan && signature(plan) !== saved);
  async function load() {
    if (operation.current) return;
    operation.current = true;
    setLoading(true);
    setError("");
    try {
      const next = await request<RoomLayoutSession>(
        `/api/admin/room-layout?roomId=${encodeURIComponent(roomId)}`,
      );
      const compatible =
        next.draft && layoutSnapshotMatches(next.draft.plan, next.artworks);
      const initial = compatible
        ? normalizeRoomLayout(next.draft!.plan, next.artworks)
        : makeRoomLayout(roomId, next.artworks);
      setSession(next);
      setHistory([initial]);
      setIndex(0);
      setSaved(signature(initial));
      setInputTouched(false);
      setVersion(next.draft?.version ?? null);
      setSelectedId(null);
      setConflict(false);
      setFeedback(
        compatible
          ? "Brouillon repris. La salle visible n’a pas été modifiée."
          : next.draft
            ? "La salle a changé depuis ce brouillon. La disposition actuelle est chargée ; un nouvel enregistrement remplacera l’ancien brouillon."
            : "Disposition actuelle chargée. Vos essais restent privés jusqu’à l’application.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      operation.current = false;
      setLoading(false);
    }
  }
  useEffect(() => {
    void load(); /* One room remains locked for this editor's lifetime. */
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  useEffect(() => {
    if (exitOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [exitOpen]);
  function commit(next: RoomLayoutPlan) {
    if (operation.current || !plan) return;
    next = normalizeRoomLayout(next, session!.artworks);
    if (signature(plan) === signature(next)) {
      setResetKey((key) => key + 1);
      setInputTouched(false);
      setError("");
      return;
    }
    const stack = [...history.slice(0, index + 1), next].slice(-40);
    setHistory(stack);
    setIndex(stack.length - 1);
    setFeedback("");
    setError("");
    setResetKey((key) => key + 1);
  }
  function patch(id: string, fields: Partial<RoomLayoutItem>, reset = false) {
    if (!plan) return;
    // Inputs keep their own intermediate text; do not remount on each keystroke.
    const next = {
      ...plan,
      items: normalizeRoomLayout(plan, session!.artworks).items.map((item) =>
        item.artworkId === id ? { ...item, ...fields } : item,
      ),
    };
    if (operation.current) return;
    if (signature(next) === signature(plan)) {
      if (reset) {
        setResetKey((key) => key + 1);
        setInputTouched(false);
        setError("");
      }
      return;
    }
    const stack = [...history.slice(0, index + 1), next].slice(-40);
    setHistory(stack);
    setIndex(stack.length - 1);
    setError("");
    setFeedback("");
    if (reset) setResetKey((key) => key + 1);
  }
  function beginResize() {
    resizeHistory.current = history
      .slice(0, index + 1)
      .map((p) => normalizeRoomLayout(p, session!.artworks));
  }
  function endResize() {
    resizeHistory.current = null;
  }
  function resizeTo(id: string, displayScale: number) {
    gesturePatch(id, { displayScale });
  }
  function gesturePatch(id: string, fields: Partial<RoomLayoutItem>) {
    if (!resizeHistory.current) {
      patch(id, fields);
      return;
    }
    const base = resizeHistory.current;
    const start = base[base.length - 1];
    const next = {
      ...start,
      items: start.items.map((item) =>
        item.artworkId === id ? { ...item, ...fields } : item,
      ),
    };
    const stack = (
      signature(next) === signature(start) ? base : [...base, next]
    ).slice(-40);
    setHistory(stack);
    setIndex(stack.length - 1);
    setFeedback("");
    setError("");
  }
  function leave() {
    if (!busy) {
      if (dirty) setExitOpen(true);
      else onClose();
    }
  }
  async function save(action: "draft" | "apply", close = false) {
    if (!plan || operation.current) return;
    const invalid = document.querySelector<HTMLInputElement>(
      ".room-layout-editor input:invalid",
    );
    if (invalid) {
      setExitOpen(false);
      const details = invalid.closest("details");
      if (details) details.open = true;
      requestAnimationFrame(() => invalid.focus());
      setError("Terminez le réglage de position avant d’enregistrer.");
      return;
    }
    operation.current = true;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const result = await request<{ draft?: RoomLayoutDraft }>(
        "/api/admin/room-layout",
        { action, expectedDraftVersion: version, plan },
      );
      setSaved(signature(plan));
      setInputTouched(false);
      setConflict(false);
      if (action === "draft") {
        setVersion(result.draft!.version);
        setFeedback(
          "Brouillon enregistré. Vous pourrez le reprendre après fermeture ; la galerie reste inchangée.",
        );
        if (close) onClose();
      } else {
        notifyCatalogueChanged();
        onClose(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
      setConflict(
        Boolean(
          e && typeof e === "object" && "status" in e && e.status === 409,
        ),
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  if (loading || !session || !plan)
    return (
      <section className="room-layout-editor">
        <button className="admin-back" onClick={() => onClose()}>
          <ArrowLeft size={16} /> Retour aux œuvres
        </button>
        <h1>Réorganiser la salle {roomId.replace("room-", "")}</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => void load()}>Réessayer</button>
          </>
        ) : (
          <p role="status">Chargement de la salle…</p>
        )}
      </section>
    );
  const slots = getZones(roomId, rooms);
  const artworks = layoutArtworks(plan, session.artworks);
  const selected = artworks.find((a) => a.id === selectedId);
  const selectedSlot = slots.find((slot) => slot.id === selected?.slotId);
  const reserve = artworks.filter((a) => !a.slotId);
  const issues = layoutIssues(plan, session.artworks);
  const guide = WALL_GUIDES.find((item) => item.id === wall)!;
  const shown = slots
    .filter((slot) => wallKey(slot) === wall)
    .sort(
      (a, b) =>
        wallCoordinate(a) - wallCoordinate(b) || b.position[1] - a.position[1],
    );
  const left =
    Math.min(
      ...shown.map(
        (slot) => wallCoordinate(slot) - (slot.maxWidthM + FRAME_OUTSET) / 2,
      ),
    ) - 0.12;
  const right =
    Math.max(
      ...shown.map(
        (slot) => wallCoordinate(slot) + (slot.maxWidthM + FRAME_OUTSET) / 2,
      ),
    ) + 0.12;
  const extent = right - left;
  const limits =
    selected && selectedSlot ? placementLimits(selected, selectedSlot) : null;
  const complete =
    reserve.length === 0 && issues.length === 0 && plan.items.length > 0;
  function beginMove(
    event: PointerEvent<HTMLButtonElement>,
    art: AdminArtwork,
    slot: ArtworkSlot,
  ) {
    if (event.button !== 0 || busy) return;
    event.preventDefault();
    event.stopPropagation();
    const board = event.currentTarget.parentElement!.getBoundingClientRect();
    pointerDrag.current = {
      id: event.pointerId,
      art,
      slot,
      x: event.clientX,
      y: event.clientY,
      width: ((board.width - 2) / extent) * (slot.maxWidthM + FRAME_OUTSET),
      height: ((board.height - 2) / 4.2) * (slot.maxHeightM + FRAME_OUTSET),
      moved: false,
    };
    suppressClick.current = false;
    beginResize();
    setSelectedId(art.id);
    setMovingId(art.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function movePainting(event: PointerEvent<HTMLButtonElement>) {
    const start = pointerDrag.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 3) return;
    start.moved = true;
    event.preventDefault();
    const desired = dragPlacementOffsets(
      start.art,
      start.slot,
      {
        x: start.art.placementOffsetX ?? 0,
        y: start.art.placementOffsetY ?? 0,
      },
      { x: dx, y: dy },
      start,
    );
    gesturePatch(
      start.art.id,
      safePlacementOffsets(
        artworks.find((a) => a.id === start.art.id) ?? start.art,
        start.slot,
        desired,
        artworks,
      ),
    );
  }
  function endMove(event: PointerEvent<HTMLButtonElement>) {
    const start = pointerDrag.current;
    if (!start || start.id !== event.pointerId) return;
    if (start.moved && event.type === "pointerup") {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (target?.closest(".room-layout-reserve")) {
        gesturePatch(start.art.id, {
          slotId: null,
          previousSlotId: start.slot.id,
        });
      } else {
        const destination =
          target?.closest<HTMLElement>("[data-zone-id]")?.dataset.zoneId;
        if (destination && destination !== start.slot.id)
          place(start.art.id, destination);
      }
    }
    suppressClick.current = start.moved;
    pointerDrag.current = null;
    setMovingId(null);
    endResize();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function remove(id: string) {
    patch(
      id,
      {
        slotId: null,
        previousSlotId: artworks.find((a) => a.id === id)?.slotId || undefined,
      },
      true,
    );
    setSelectedId(id);
  }
  function place(id: string, slotId: string) {
    if (
      !session!.artworks.some((a) => a.id === id) ||
      !slots.some((slot) => slot.id === slotId)
    )
      return;
    const art = artworks.find((a) => a.id === id)!;
    if (art.slotId === slotId) return;
    const previousSlotId =
      art.slotId ||
      plan.items.find((item) => item.artworkId === id)?.previousSlotId ||
      normalizeZoneArtwork(session!.artworks.find((a) => a.id === id)!).slotId;
    const fitted = findZonePlacement(
      { ...art, slotId: previousSlotId },
      slots.find((s) => s.id === slotId)!,
      artworks,
      true,
    );
    if (!fitted) {
      setError(
        `Impossible dans ${slotCode(slots.find((s) => s.id === slotId)!)} : pas assez de place sans réduire le petit côté sous 25 cm. Les tableaux présents restent inchangés.`,
      );
      return;
    }
    gesturePatch(id, {
      slotId,
      previousSlotId: slotId,
      placementOffsetX: fitted.placementOffsetX ?? 0,
      placementOffsetY: fitted.placementOffsetY ?? 0,
      displayScale: fitted.displayScale ?? 1,
    });
    setFeedback(
      "Tableau ajouté dans la zone. Seul ce tableau a été adapté à l’espace libre.",
    );
    setSelectedId(id);
  }
  function startDrag(event: DragEvent, id: string) {
    if (busy) {
      event.preventDefault();
      return;
    }
    dragId.current = id;
    setSelectedId(id);
    event.dataTransfer.setData("application/x-museum-artwork", id);
    event.dataTransfer.effectAllowed = "move";
  }
  function drop(event: DragEvent, slotId?: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData("application/x-museum-artwork");
    if (!busy && id === dragId.current && artworks.some((a) => a.id === id)) {
      if (slotId) place(id, slotId);
      else remove(id);
    }
    dragId.current = null;
  }
  return (
    <section className="room-layout-editor">
      <header className="room-layout-heading">
        <button className="admin-back" disabled={busy} onClick={leave}>
          <ArrowLeft size={16} /> Retour aux œuvres
        </button>
        <p className="admin-overline">
          <LockKeyhole size={14} /> Une seule salle · aucun transfert entre
          salles
        </p>
        <h1>Réorganiser la salle {roomId.replace("room-", "")}</h1>
        <p>
          Retirez les tableaux dans la réserve, puis replacez-les. La salle
          visible reste intacte pendant vos essais.
        </p>
      </header>
      <fieldset
        className="room-layout-controls"
        disabled={busy}
        onInput={() => setInputTouched(true)}
      >
        <legend className="room-layout-sr">
          Disposition de la salle {roomId.replace("room-", "")}
        </legend>
        <div className="room-layout-toolbar">
          <button
            type="button"
            className="admin-secondary"
            disabled={index === 0}
            onClick={() => {
              setIndex(index - 1);
              setResetKey((key) => key + 1);
              setError("");
              setFeedback("");
              setInputTouched(false);
            }}
          >
            <Undo2 size={16} /> Annuler le geste
          </button>
          <button
            type="button"
            className="admin-secondary"
            disabled={index === history.length - 1}
            onClick={() => {
              setIndex(index + 1);
              setResetKey((key) => key + 1);
              setError("");
              setFeedback("");
              setInputTouched(false);
            }}
          >
            <Redo2 size={16} /> Rétablir
          </button>
          <button
            type="button"
            className="admin-text-button"
            disabled={reserve.length === artworks.length}
            onClick={() =>
              commit({
                ...plan,
                items: plan.items.map((item) => ({ ...item, slotId: null })),
              })
            }
          >
            Tout mettre en réserve
          </button>
          <button
            type="button"
            className="admin-text-button"
            onClick={() => commit(makeRoomLayout(roomId, session.artworks))}
          >
            Remettre comme dans la galerie
          </button>
        </div>
        <div className="room-layout-workspace">
          <RoomPlan
            roomId={roomId}
            rooms={rooms}
            slots={slots}
            selected={selectedSlot}
            viewedWall={wall}
            occupied={(slot) =>
              artworks.find((a) => a.id !== selectedId && a.slotId === slot.id)
            }
            onView={setWall}
          />
          <div className="room-layout-wall">
            <nav
              className="room-layout-wall-tabs"
              aria-label="Choisir le mur à réorganiser"
            >
              {WALL_GUIDES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Afficher le mur ${item.code} · ${item.label}`}
                  aria-pressed={wall === item.id}
                  onClick={() => setWall(item.id)}
                >
                  <b>{item.code}</b>
                  <span>{item.label.replace("Mur ", "")}</span>
                </button>
              ))}
            </nav>
            <h2>
              {guide.code} · {guide.label} <small>Vue de face</small>
            </h2>
            <p className="admin-help">
              Une zone peut contenir plusieurs tableaux. Glissez chaque tableau
              pour le déplacer ; la poignée ↘ règle sa taille. Sélectionnez un
              tableau de la réserve, puis une zone : seul le nouvel arrivant est
              adapté à l’espace libre.
            </p>
            <div
              className="admin-wall-preview room-layout-board"
              aria-label={`Accrochage du mur ${guide.code}`}
              style={{ aspectRatio: `${extent} / 4.2` }}
            >
              <span className="admin-wall-floor" aria-hidden="true" />
              {shown.map((slot) => (
                <MovementZone
                  key={slot.id}
                  slot={slot}
                  left={left}
                  extent={extent}
                  onClick={() =>
                    selectedId
                      ? place(selectedId, slot.id)
                      : setFeedback(
                          "Choisissez un tableau dans la réserve, puis une zone.",
                        )
                  }
                  onDrop={(event) => drop(event, slot.id)}
                />
              ))}
              {shown.flatMap((slot) =>
                artworks
                  .filter((a) => a.slotId === slot.id)
                  .map((art) => {
                    const size = art ? artworkSize(art, slot) : null;
                    return (
                      <button
                        key={art.id}
                        type="button"
                        className={`admin-wall-slot ${art?.id === selectedId ? "selected" : ""} ${art ? "is-filled" : "is-free"}`}
                        aria-label={`${slotCode(slot)} · ${art ? art.title : "Placer le tableau ici"}`}
                        aria-pressed={Boolean(art && art.id === selectedId)}
                        draggable={false}
                        data-zone-id={slot.id}
                        data-artwork-id={art.id}
                        data-moving={
                          art && movingId === art.id ? "true" : undefined
                        }
                        onPointerDown={
                          art
                            ? (event) => beginMove(event, art, slot)
                            : undefined
                        }
                        onPointerMove={movePainting}
                        onPointerUp={endMove}
                        onPointerCancel={endMove}
                        onLostPointerCapture={endMove}
                        onDragOver={(event) => {
                          if (dragId.current) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }
                        }}
                        onDrop={(event) => drop(event, slot.id)}
                        onClick={() => {
                          if (suppressClick.current) {
                            suppressClick.current = false;
                            return;
                          }
                          art
                            ? setSelectedId(art.id)
                            : selectedId
                              ? place(selectedId, slot.id)
                              : setFeedback(
                                  "Choisissez d’abord un tableau sur le mur ou dans la réserve.",
                                );
                        }}
                        style={previewSlotStyle(slot, art, left, extent)}
                      >
                        {art && size ? (
                          <span
                            className="admin-wall-artwork"
                            style={{
                              width: "100%",
                              height: "100%",
                              left: "50%",
                              top: "50%",
                            }}
                          >
                            <img
                              src={art.thumbnail}
                              alt=""
                              draggable={false}
                              style={previewImageStyle(size)}
                            />
                          </span>
                        ) : (
                          <span className="admin-slot-empty">+</span>
                        )}
                      </button>
                    );
                  }),
              )}
              {selected && selectedSlot && wallKey(selectedSlot) === wall && (
                <ResizeHandle
                  artwork={selected}
                  slot={selectedSlot}
                  artworks={artworks}
                  left={left}
                  extent={extent}
                  onStart={beginResize}
                  onEnd={endResize}
                  onChange={(scale) => resizeTo(selected.id, scale)}
                />
              )}
            </div>
            <p className="admin-wall-key">
              Pointillés : zone autorisée · Bleu : tableau sélectionné. Les
              cadres voisins bloquent le déplacement.
            </p>
            <div
              className="room-layout-slot-list"
              aria-label={`Zones du mur ${guide.code}`}
            >
              {shown.map((slot) => {
                const residents = artworks.filter((a) => a.slotId === slot.id);
                return (
                  <section className="admin-zone-card" key={slot.id}>
                    <button
                      type="button"
                      aria-label={`${slotCode(slot)} · Ajouter dans cette zone`}
                      onClick={() =>
                        selectedId
                          ? place(selectedId, slot.id)
                          : setFeedback(
                              "Choisissez un tableau dans la réserve.",
                            )
                      }
                    >
                      <b>{slotCode(slot)}</b>
                      <span>
                        {residents.length} tableau
                        {residents.length > 1 ? "x" : ""}
                      </span>
                      <span>Ajouter ici +</span>
                    </button>
                    {residents.map((art) => (
                      <button
                        key={art.id}
                        type="button"
                        aria-pressed={art.id === selectedId}
                        aria-label={`${slotCode(slot)} · Sélectionner ${art.title}`}
                        onClick={() => setSelectedId(art.id)}
                      >
                        <img src={art.thumbnail} alt="" />
                        <span>{art.title}</span>
                      </button>
                    ))}
                  </section>
                );
              })}
            </div>
            {selected ? (
              <section
                className="room-layout-selection"
                aria-label="Tableau sélectionné"
              >
                <div>
                  <img src={selected.thumbnail} alt="" />
                  <div>
                    <strong>{selected.title}</strong>
                    <p>
                      {selectedSlot
                        ? `Mur ${WALL_GUIDES.find((entry) => entry.id === wallKey(selectedSlot))!.code} · ${slotCode(selectedSlot)}`
                        : "Dans la réserve · choisissez une zone"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-secondary"
                  disabled={!selected.slotId}
                  onClick={() => remove(selected.id)}
                >
                  Mettre en réserve
                </button>
                {limits && selectedSlot && (
                  <details className="room-layout-adjust">
                    <summary>Ajuster la taille et la position</summary>
                    <ShowroomSize
                      key={`${selected.id}:${selected.slotId}:${resetKey}`}
                      artwork={selected}
                      slot={selectedSlot}
                      artworks={artworks}
                      onStart={beginResize}
                      onEnd={endResize}
                      onChange={(scale) => resizeTo(selected.id, scale)}
                    />
                    {(
                      [
                        {
                          key: "placementOffsetX",
                          label: "Horizontal (cm)",
                          bound: limits.horizontal,
                          min: limits.minX,
                          decrease: "Déplacer de 1 cm vers la gauche",
                          increase: "Déplacer de 1 cm vers la droite",
                        },
                        {
                          key: "placementOffsetY",
                          label: "Hauteur (cm)",
                          bound: limits.vertical,
                          min: limits.minY,
                          decrease: "Descendre de 1 cm",
                          increase: "Monter de 1 cm",
                        },
                      ] as const
                    ).map((axis) => (
                      <div className="admin-offset-field" key={axis.key}>
                        <span>{axis.label}</span>
                        <OffsetInput
                          key={`${selected.id}:${selected.slotId}:${resetKey}`}
                          value={Math.round((selected[axis.key] ?? 0) * 100)}
                          limit={Math.floor(axis.bound * 100)}
                          min={Math.ceil(axis.min * 100)}
                          label={axis.label}
                          decrease={axis.decrease}
                          increase={axis.increase}
                          onChange={(value) =>
                            patch(selected.id, { [axis.key]: value / 100 })
                          }
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      className="admin-text-button"
                      onClick={() =>
                        patch(
                          selected.id,
                          { placementOffsetX: 0, placementOffsetY: 0 },
                          true,
                        )
                      }
                    >
                      Recentrer ce tableau
                    </button>
                  </details>
                )}
              </section>
            ) : (
              <p className="room-layout-empty-selection">
                Cliquez sur un tableau pour le retirer ou le déplacer.
              </p>
            )}
            {issues.length > 0 && (
              <div className="admin-placement-warning" role="status">
                <strong>À ajuster avant application</strong>
                <ul>
                  {issues.map((issue) => (
                    <li key={issue.artworkId}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(issue.artworkId);
                          const slot = slots.find(
                            (slot) =>
                              slot.id ===
                              artworks.find((a) => a.id === issue.artworkId)
                                ?.slotId,
                          );
                          if (slot) setWall(wallKey(slot));
                        }}
                      >
                        {artworks.find((a) => a.id === issue.artworkId)?.title}
                      </button>{" "}
                      : {issue.message}
                    </li>
                  ))}
                </ul>
                <p>Vous pouvez conserver ces essais en brouillon.</p>
              </div>
            )}
          </div>
        </div>
        <footer className="room-layout-dock">
          <section
            className="room-layout-reserve"
            aria-label="Réserve de cette salle"
            onDragOver={(event) => {
              if (dragId.current) event.preventDefault();
            }}
            onDrop={(event) => drop(event)}
          >
            <div className="room-layout-reserve-heading">
              <strong>Réserve · Salle {roomId.replace("room-", "")}</strong>
              <span>
                {reserve.length} à replacer / {artworks.length} tableaux
              </span>
            </div>
            <div className="room-layout-tray">
              {reserve.length ? (
                reserve.map((art) => (
                  <button
                    key={art.id}
                    type="button"
                    aria-label={`Choisir dans la réserve : ${art.title}`}
                    aria-pressed={selectedId === art.id}
                    draggable
                    onDragStart={(event) => startDrag(event, art.id)}
                    onDragEnd={() => {
                      dragId.current = null;
                    }}
                    onClick={() => setSelectedId(art.id)}
                  >
                    <img src={art.thumbnail} alt="" draggable={false} />
                    <span>{art.title}</span>
                  </button>
                ))
              ) : (
                <p>
                  Glissez un tableau ici, ou sélectionnez-le puis choisissez «
                  Mettre en réserve ».
                </p>
              )}
            </div>
          </section>
          <div className="room-layout-status" aria-live="polite">
            {error ? (
              <p role="alert" className="room-layout-error">
                {error}
              </p>
            ) : feedback ? (
              <p>{feedback}</p>
            ) : null}
            {error.includes("session a expiré") && (
              <a href="/admin" target="_blank" rel="noopener noreferrer">
                Se reconnecter dans un autre onglet
              </a>
            )}
            {conflict && (
              <button
                type="button"
                className="admin-text-button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Recharger remplacera vos essais actuels par la dernière version enregistrée. Continuer ?",
                    )
                  )
                    void load();
                }}
              >
                Recharger la salle
              </button>
            )}
            <span>
              {dirty ? "Essais non enregistrés" : "Disposition enregistrée"} ·{" "}
              {reserve.length
                ? "Application bloquée : replacez tous les tableaux, ou gardez un brouillon."
                : issues.length
                  ? "Application bloquée : corrigez les ajustements signalés."
                  : !artworks.length
                    ? "Cette salle est vide : publiez d’abord des œuvres pour les réorganiser."
                    : "Tous les tableaux sont placés."}
            </span>
          </div>
          <div className="room-layout-save-actions">
            <button
              type="button"
              className="admin-secondary"
              onClick={() => void save("draft")}
            >
              <Save size={16} />{" "}
              {busy ? "Enregistrement…" : "Enregistrer le brouillon"}
            </button>
            <button
              type="button"
              className="admin-primary"
              disabled={!complete}
              onClick={() => void save("apply")}
            >
              Appliquer à la galerie
            </button>
          </div>
        </footer>
      </fieldset>
      <dialog
        ref={dialog}
        className="room-layout-exit"
        aria-labelledby="room-layout-exit-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) setExitOpen(false);
        }}
      >
        <h2 id="room-layout-exit-title">Garder vos essais ?</h2>
        <p>
          {reserve.length
            ? `${reserve.length} tableau${reserve.length > 1 ? "x sont" : " est"} encore dans la réserve. `
            : ""}
          Vos derniers changements ne sont pas enregistrés. Enregistrez un
          brouillon pour les reprendre plus tard ; la salle visible restera
          inchangée.
        </p>
        {error && (
          <p role="alert" className="room-layout-error">
            {error}
          </p>
        )}
        <button
          type="button"
          className="admin-primary"
          disabled={busy}
          onClick={() => void save("draft", true)}
        >
          Enregistrer le brouillon et quitter
        </button>
        <button
          type="button"
          className="admin-secondary"
          disabled={busy}
          onClick={() => setExitOpen(false)}
        >
          Continuer l’édition
        </button>
        <button
          type="button"
          className="admin-text-button"
          disabled={busy}
          onClick={() => onClose()}
        >
          Quitter sans garder ces changements
        </button>
      </dialog>
    </section>
  );
}
