"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Expand,
  Grid2X2,
  Home,
  Mail,
  Menu,
  Minimize,
  X,
} from "lucide-react";
import type { Artwork, Destination, PublicData } from "@/lib/data/types";
import {
  availabilityLabel,
  classicUrl,
  destinationUrl,
  parseDestination,
  priceLabel,
} from "@/lib/public";
import { getRoomName } from "@/lib/museum/config";
import { groupCollections } from "@/lib/data/collections";
import ContactActions from "@/components/public/ContactActions";
import { useLiveMuseumData, useRoomPreviewVersion } from "./useLiveMuseumData";

const MuseumCanvas = dynamic(() => import("./MuseumCanvas"), {
  ssr: false,
  loading: () => null,
});
class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: Error) {
    console.error("Museum scene:", error);
    this.props.onError();
  }
  render() {
    return this.state.error ? null : this.props.children;
  }
}
type Drawer = "artworks" | "rooms" | "menu" | null;
function physicalDestination(
  destination: Destination,
  data: PublicData,
): Destination {
  if (destination.kind !== "about" && destination.kind !== "contact")
    return destination;
  const artwork =
    destination.kind === "contact"
      ? data.artworks.find((artwork) => artwork.id === destination.artworkId)
      : undefined;
  return { kind: "room", roomId: artwork?.roomId ?? data.rooms[0] ?? "room-1" };
}
function physicalRoom(destination: Destination, data: PublicData) {
  if (destination.kind === "room") return destination.roomId;
  if (destination.kind === "artwork")
    return (
      data.artworks.find((artwork) => artwork.id === destination.artworkId)
        ?.roomId ?? "room-1"
    );
  return data.rooms[0] ?? "room-1";
}
export default function MuseumShell({
  data: initialData,
  initialDestination = { kind: "home" },
}: {
  data: PublicData;
  initialDestination?: Destination;
}) {
  const { data, version: catalogueVersion } = useLiveMuseumData(initialData);
  const [destination, setDestination] =
    useState<Destination>(initialDestination);
  // Editorial routes describe the interface, not a place on a museum wall.
  const [sceneDestination, setSceneDestination] = useState<Destination>(() =>
    physicalDestination(initialDestination, data),
  );
  const sceneDestinationRef = useRef(sceneDestination);
  const [navigationId, setNavigationId] = useState(0);
  const [resumeFromCurrent, setResumeFromCurrent] = useState(false);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [compatible, setCompatible] = useState(false);
  const [traveling, setTraveling] = useState(false);
  const [roomAutoplay, setRoomAutoplay] = useState(
    initialDestination.kind === "room" ||
      initialDestination.kind === "about" ||
      initialDestination.kind === "contact",
  );
  const [reducedMotion, setReducedMotion] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [skip, setSkip] = useState(false);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const previewVersion = useRoomPreviewVersion(
    catalogueVersion,
    drawer === "rooms",
  );
  const [filter, setFilter] = useState("all");
  const [seenHint, setSeenHint] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [tourArtworkId, setTourArtworkId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const editorialDialog = useRef<HTMLDialogElement>(null);
  const editorialOpener = useRef<HTMLElement | null>(null);
  const drawerOpener = useRef<HTMLElement | null>(null);
  const idRef = useRef(0);
  const lastDestination = useRef<Destination>(initialDestination);
  const travelingRef = useRef(false);
  const initial = useRef(true);
  const initialLocationApplied = useRef(false);
  const touch = useRef<{ x: number; y: number; pointerId: number } | null>(
    null,
  );
  const suppressClick = useRef(0);
  const filmstrip = useRef<HTMLDivElement>(null);
  travelingRef.current = traveling;
  lastDestination.current = destination;
  sceneDestinationRef.current = sceneDestination;
  const activeArtwork =
    destination.kind === "artwork"
      ? data.artworks.find((a) => a.id === destination.artworkId)
      : undefined;
  const contactArtwork =
    destination.kind === "contact"
      ? data.artworks.find((a) => a.id === destination.artworkId)
      : undefined;
  const roomId = physicalRoom(sceneDestination, data);
  const lastKnownRoom = useRef(roomId);
  if (
    sceneDestination.kind !== "artwork" ||
    data.artworks.some((a) => a.id === sceneDestination.artworkId)
  )
    lastKnownRoom.current = roomId;
  const roomArtworks = data.artworks.filter((a) => a.roomId === roomId);
  const primaryCollection = roomArtworks.find(
    (a) => a.slotId === `${roomId}-slot-01`,
  )?.collection;
  const roomCollections = groupCollections(roomArtworks, data.rooms).sort(
    (a, b) =>
      Number(b.name === primaryCollection) -
      Number(a.name === primaryCollection),
  );
  const currentCollection =
    roomCollections.find((g) => g.name === selectedCollection) ??
    roomCollections[0];
  const collectionArtworks = currentCollection?.artworks ?? [];
  const nextRoomId =
    data.rooms[(data.rooms.indexOf(roomId) + 1) % data.rooms.length];
  useEffect(() => {
    if (activeArtwork) setSelectedCollection(activeArtwork.collection);
  }, [activeArtwork?.id, activeArtwork?.collection]);
  const overview = destination.kind === "home" || destination.kind === "room";
  const tourArtwork = overview
    ? (collectionArtworks.find((a) => a.id === tourArtworkId) ??
      collectionArtworks[0])
    : undefined;
  const activeIndex = collectionArtworks.findIndex(
    (a) => a.id === activeArtwork?.id,
  );
  const showDetails = ready && !failed && !!activeArtwork && !traveling;
  const showEditorial = destination.kind === "about" || destination.kind === "contact";
  const showHome =
    !failed &&
    !traveling &&
    (destination.kind === "home" || destination.kind === "room");

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setRevealed(true), 1450);
    return () => window.clearTimeout(timer);
  }, [ready]);

  const closeDrawer = useCallback(() => {
    setDrawer(null);
  }, []);
  const openDrawer = (next: Drawer) => {
    drawerOpener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDrawer(next);
  };
  const navigate = useCallback(
    (next: Destination, push = true, resume = false) => {
      setDrawer(null);
      const previous = lastDestination.current;
      if (
        JSON.stringify(next) === JSON.stringify(previous) &&
        !travelingRef.current
      )
        return;
      const editorial = next.kind === "about" || next.kind === "contact";
      const wasEditorial =
        previous.kind === "about" || previous.kind === "contact";
      if (editorial && !wasEditorial) {
        editorialOpener.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
      }
      // Editorial windows share the live promenade. Returning to the same room
      // keeps its timeline and pose; only choosing a work pauses the visit.
      const currentScene = sceneDestinationRef.current;
      setRoomAutoplay(next.kind === "room" || editorial);
      const currentRoom = document.querySelector<HTMLCanvasElement>(
        ".canvas-wrap canvas",
      )?.dataset.resumeRoom;
      const nextScene = editorial
        ? currentScene.kind === "artwork"
          ? {
              kind: "room" as const,
              roomId:
                currentRoom && data.rooms.includes(currentRoom)
                  ? currentRoom
                  : physicalRoom(currentScene, data),
            }
          : currentScene
        : next.kind === "room" &&
            next.roomId === physicalRoom(currentScene, data) &&
            currentScene.kind === "home"
          ? currentScene
          : next;
      if (
        resume ||
        JSON.stringify(nextScene) !== JSON.stringify(currentScene)
      ) {
        setResumeFromCurrent(
          resume || (editorial && currentScene.kind === "artwork"),
        );
        idRef.current += 1;
        setNavigationId(idRef.current);
        sceneDestinationRef.current = nextScene;
        setSceneDestination(nextScene);
        setTraveling(true);
        setSkip(false);
      }
      lastDestination.current = next;
      setDestination(next);
      setSeenHint(true);
      if (push)
        window.history.pushState(null, "", destinationUrl(next, data.artworks));
    },
    [data],
  );
  const closeArtwork = useCallback(() => {
    if (
      (lastDestination.current.kind !== "artwork" && !travelingRef.current) ||
      Date.now() < suppressClick.current
    )
      return;
    // During an interrupted cross-room journey, resume in the room actually
    // occupied by the camera, not the room of the abandoned artwork target.
    const currentRoom = document.querySelector<HTMLCanvasElement>(
      ".canvas-wrap canvas",
    )?.dataset.resumeRoom;
    navigate(
      {
        kind: "room",
        roomId:
          currentRoom && data.rooms.includes(currentRoom)
            ? currentRoom
            : physicalRoom(sceneDestinationRef.current, data),
      },
      true,
      true,
    );
  }, [data, navigate]);
  const closeEditorial = useCallback(() => {
    navigate({
      kind: "room",
      roomId: physicalRoom(sceneDestinationRef.current, data),
    });
  }, [navigate, data]);

  useEffect(() => {
    const scene = sceneDestinationRef.current;
    if (
      scene.kind === "artwork" &&
      !data.artworks.some((a) => a.id === scene.artworkId)
    )
      navigate({
        kind: "room",
        roomId: data.rooms.includes(lastKnownRoom.current)
          ? lastKnownRoom.current
          : (data.rooms[0] ?? "room-1"),
      });
  }, [data, navigate]);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(motion.matches);
    const change = () => setReducedMotion(motion.matches);
    motion.addEventListener("change", change);
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      if (gl) {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        setCompatible(true);
      } else setFailed(true);
    } catch {
      setFailed(true);
    }
    if (!initialLocationApplied.current) {
      initialLocationApplied.current = true;
      const current = parseDestination(
        window.location.search,
        data.artworks,
        data.rooms,
      );
      setDestination(current);
      setSceneDestination(physicalDestination(current, data));
      setRoomAutoplay(
        current.kind === "room" ||
          current.kind === "about" ||
          current.kind === "contact",
      );
    }
    const pop = () =>
      navigate(
        parseDestination(window.location.search, data.artworks, data.rooms),
        false,
      );
    const full = () => setExpanded(Boolean(document.fullscreenElement));
    window.addEventListener("popstate", pop);
    document.addEventListener("fullscreenchange", full);
    return () => {
      motion.removeEventListener("change", change);
      window.removeEventListener("popstate", pop);
      document.removeEventListener("fullscreenchange", full);
    };
  }, [data.artworks, data.rooms, navigate]);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (drawer && !node.open) node.showModal();
    if (!drawer && node.open) {
      node.close();
      drawerOpener.current?.focus({ preventScroll: true });
    }
  }, [drawer]);
  useEffect(() => {
    const node = editorialDialog.current;
    if (!node) return;
    if (showEditorial && !node.open) node.showModal();
    if (!showEditorial && node.open) {
      node.close();
      const opener = editorialOpener.current;
      if (opener?.isConnected && !opener.closest("dialog:not([open])"))
        opener.focus({ preventScroll: true });
      else
        document
          .querySelector<HTMLElement>(".visit-room-switch")
          ?.focus({ preventScroll: true });
    }
  }, [showEditorial]);
  const onReady = useCallback(() => {
    setReady(true);
    if (initial.current) {
      initial.current = false;
      setTraveling(false);
    }
  }, []);
  const onError = useCallback(() => {
    setFailed(true);
    setTraveling(false);
  }, []);
  const onArrive = useCallback((id: number) => {
    if (id === idRef.current) setTraveling(false);
  }, []);
  const adjacent = useCallback(
    (offset: number) => {
      const collection = collectionArtworks;
      if (!collection.length) return;
      const visibleIndex =
        activeIndex >= 0
          ? activeIndex
          : collection.findIndex((a) => a.id === tourArtwork?.id);
      const base = visibleIndex < 0 ? (offset > 0 ? -1 : 0) : visibleIndex;
      const index = (base + offset + collection.length) % collection.length;
      navigate({ kind: "artwork", artworkId: collection[index].id });
    },
    [activeIndex, collectionArtworks, navigate, tourArtwork?.id],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true],[role=tablist]",
        ) ||
        dialog.current?.open ||
        editorialDialog.current?.open
      )
        return;
      if (event.key === "Escape" && destination.kind !== "home") {
        if (destination.kind === "artwork") closeArtwork();
        else navigate({ kind: "room", roomId });
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        adjacent(1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        adjacent(-1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [destination.kind, roomId, adjacent, navigate, closeArtwork]);
  useEffect(() => {
    const node = filmstrip.current;
    const selected = node?.querySelector<HTMLElement>(
      `[data-artwork="${activeArtwork?.id}"]`,
    );
    if (node && selected)
      node.scrollTo({
        left:
          selected.offsetLeft -
          node.offsetLeft -
          (node.clientWidth - selected.clientWidth) / 2,
        behavior: reducedMotion ? "instant" : "smooth",
      });
  }, [activeArtwork?.id, reducedMotion]);

  function menuLink(
    event: React.MouseEvent<HTMLAnchorElement>,
    next: Destination,
  ) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !ready ||
      failed
    )
      return;
    event.preventDefault();
    navigate(next);
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.querySelector(".visit-shell")?.requestFullscreen();
    } catch {
      /* Browser can decline fullscreen; the normal full viewport stays usable. */
    }
  }
  const selectArtwork = (a: Artwork) =>
    navigate({ kind: "artwork", artworkId: a.id });
  const roomCaption =
    roomId === "room-1"
      ? "La lumière, la couleur, une première rencontre."
      : "Une autre lumière. Le temps de s’attarder.";
  return (
    <div
      className={`visit-shell ${activeArtwork ? "is-artwork" : ""} ${showEditorial ? "is-editorial" : ""} ${traveling ? "is-traveling" : ""}`}
      data-arrival-state={!ready ? "poster" : revealed ? "live" : "revealing"}
      data-scene-destination={sceneDestination.kind}
      data-visit-room={roomId}
      data-room-autoplay={roomAutoplay}
    >
      <a className="skip-link" href={classicUrl(destination, data.artworks)}>
        Accéder au catalogue sans la 3D
      </a>
      <header className="visit-header">
        <Link
          className="visit-brand"
          href="/"
          onClick={(e) => menuLink(e, { kind: "home" })}
        >
          {data.settings.artistName}
          <span>{data.settings.tagline}</span>
        </Link>
        <nav className="visit-navigation" aria-label="Navigation principale">
          <a
            href="/"
            onClick={(e) => menuLink(e, { kind: "home" })}
            aria-current={destination.kind === "home" ? "page" : undefined}
          >
            Accueil
          </a>
          <button onClick={() => openDrawer("artworks")}>Les œuvres</button>
          <a
            href="/a-propos"
            onClick={(e) => menuLink(e, { kind: "about" })}
            aria-current={destination.kind === "about" ? "page" : undefined}
          >
            À propos
          </a>
          <a
            href="/contact"
            onClick={(e) => menuLink(e, { kind: "contact" })}
            aria-current={destination.kind === "contact" ? "page" : undefined}
          >
            Contact
          </a>
        </nav>
        <div className="visit-header-actions">
          <Link
            className="visit-catalogue"
            aria-label="Catalogue classique"
            href={classicUrl(destination, data.artworks)}
          >
            <Grid2X2 size={16} />
            <span>Catalogue classique</span>
          </Link>
          <button
            className="visit-icon visit-fullscreen"
            aria-label={
              expanded ? "Quitter le plein écran" : "Afficher en plein écran"
            }
            onClick={fullscreen}
          >
            {expanded ? <Minimize size={18} /> : <Expand size={18} />}
          </button>
          <button
            className="visit-icon visit-menu"
            aria-label="Ouvrir le menu"
            aria-haspopup="dialog"
            onClick={() => openDrawer("menu")}
          >
            <Menu size={22} />
          </button>
        </div>
      </header>
      <main
        className="visit-scene"
        id="museum"
        aria-label="Galerie en trois dimensions"
      >
        <div
          className="canvas-wrap"
          data-testid="museum-canvas"
          onPointerDown={(event) => {
            if (event.pointerType === "touch" && event.isPrimary)
              touch.current = {
                x: event.clientX,
                y: event.clientY,
                pointerId: event.pointerId,
              };
          }}
          onPointerUp={(event) => {
            const start = touch.current;
            if (!start || start.pointerId !== event.pointerId) return;
            touch.current = null;
            if (!ready || failed) return;
            const dx = event.clientX - start.x,
              dy = event.clientY - start.y;
            if (Math.abs(dx) > 58 && Math.abs(dx) > Math.abs(dy) * 1.6) {
              // A deliberate horizontal drag stays valid on a slower device.
              // Texture uploads or a held finger must not turn it into a tap.
              suppressClick.current = Date.now() + 350;
              adjacent(dx < 0 ? 1 : -1);
            }
          }}
          onPointerCancel={(event) => {
            if (touch.current?.pointerId === event.pointerId)
              touch.current = null;
          }}
          onClickCapture={(event) => {
            if (Date.now() < suppressClick.current) {
              event.preventDefault();
              event.stopPropagation();
            } else if (travelingRef.current) {
              // A moving artwork can slide under the pointer between down/up.
              // During a journey, a scene tap cancels it regardless of ray hits.
              event.stopPropagation();
              closeArtwork();
            }
          }}
        >
          {compatible && !failed && (
            <SceneBoundary onError={onError}>
              <MuseumCanvas
                data={data}
                destination={sceneDestination}
                navigationId={navigationId}
                reducedMotion={reducedMotion}
                onSelect={navigate}
                onArrive={onArrive}
                onReady={onReady}
                onError={onError}
                skipTransition={skip}
                roomAutoplay={roomAutoplay}
                resumeFromCurrent={resumeFromCurrent}
                selectedArtworkId={activeArtwork?.id ?? null}
                onPointerMissed={closeArtwork}
                ambientTour={
                  revealed &&
                  (destination.kind === "home" ||
                    showEditorial ||
                    (destination.kind === "room" && roomAutoplay)) &&
                  !drawer &&
                  !reducedMotion &&
                  (!traveling || roomAutoplay)
                }
                onTourArtwork={setTourArtworkId}
              />
            </SceneBoundary>
          )}
        </div>
        <picture
          className={`visit-arrival ${ready ? "is-ready" : ""}`}
          aria-hidden="true"
        >
          <source
            media="(max-width: 700px) and (orientation: portrait)"
            srcSet={`/api/museum/arrival?room=${roomId}&view=portrait&v=${previewVersion}`}
          />
          <img
            src={`/api/museum/arrival?room=${roomId}&view=wide&v=${previewVersion}`}
            alt=""
            fetchPriority="high"
            loading="eager"
            decoding="sync"
          />
        </picture>
        {!ready && !failed && (
          <span className="sr-only" role="status">
            La visite interactive se prépare. Le catalogue est déjà accessible.
          </span>
        )}
        {failed && (
          <div className="visit-loading visit-fallback">
            <Compass size={34} />
            <h1>La collection vous attend</h1>
            <p>La visite 3D n’est pas disponible dans ce navigateur.</p>
            <Link
              className="visit-primary"
              href={classicUrl(destination, data.artworks)}
            >
              Découvrir le catalogue <ArrowRight size={18} />
            </Link>
          </div>
        )}
        {showHome && (
          <div className="visit-hero is-introduction">
            <p className="eyebrow">{getRoomName(roomId, data.artworks)}</p>
            {overview && (
              <>
                <h1>
                  {data.settings.heroTitle.split("\n").map((line, i) => (
                    <span key={i}>{line}</span>
                  ))}
                </h1>
                <p className="visit-hero-caption">{roomCaption}</p>
                <div className="visit-hero-actions">
                  <button
                    className="visit-primary"
                    onClick={() => {
                      setFilter(currentCollection?.name ?? "all");
                      openDrawer("artworks");
                    }}
                  >
                    Découvrir les œuvres <ArrowRight size={18} />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {ready && !failed && !showHome && !showEditorial && (
          <button
            className="visit-back"
            onClick={closeArtwork}
            aria-label="Reprendre la visite"
          >
            <ArrowLeft size={16} />
            <span>Reprendre la visite</span>
          </button>
        )}
        {traveling && !failed && !showEditorial && (
          <div className="visit-travel" role="status">
            <span className="visit-travel-dot" />{" "}
            {activeArtwork
              ? `Vers ${activeArtwork.title}`
              : destination.kind === "room"
                ? `Vers ${getRoomName(roomId, data.artworks)}`
                : "La visite continue"}
            <button onClick={() => setSkip(true)}>
              Arriver directement <ArrowRight size={13} />
            </button>
          </div>
        )}
        {ready && !failed && overview && tourArtwork && (
          <aside
            className="visit-preview"
            aria-label="Au fil de la visite"
            data-artwork-id={tourArtwork.id}
          >
            <span className="eyebrow">{tourArtwork.collection}</span>
            <button
              className="visit-preview-work"
              onClick={() => selectArtwork(tourArtwork)}
              aria-label={`Voir ${tourArtwork.title}`}
            >
              <img src={tourArtwork.thumbnail} alt={tourArtwork.alt} />
              <span className="visit-preview-title">{tourArtwork.title}</span>
              <span className="visit-preview-price">
                {priceLabel(tourArtwork)} <ArrowUpRight size={15} />
              </span>
            </button>
            <p className="visit-preview-description">
              {data.settings.collectionDescriptions?.[tourArtwork.collection]}
            </p>
            <button
              className="visit-complete"
              onClick={() => {
                setFilter(tourArtwork.collection);
                openDrawer("artworks");
              }}
            >
              Explorer cette collection <ArrowRight size={14} />
            </button>
          </aside>
        )}
        {showDetails && activeArtwork && (
          <aside
            className="visit-details"
            aria-label={`Fiche de ${activeArtwork.title}`}
          >
            <div className="visit-details-top">
              <span className="eyebrow">
                {activeArtwork.collection || getRoomName(roomId, data.artworks)}
              </span>
              <button
                className="visit-icon"
                aria-label="Revenir à la salle"
                onClick={closeArtwork}
              >
                <X size={17} />
              </button>
            </div>
            <h2 title={activeArtwork.title}>{activeArtwork.title}</h2>
            <p className="visit-medium">
              {[
                activeArtwork.technique,
                activeArtwork.widthCm && activeArtwork.heightCm
                  ? `${activeArtwork.widthCm} × ${activeArtwork.heightCm} cm`
                  : "Échelle indicative · dimensions à préciser",
                activeArtwork.year,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="visit-price">
              {priceLabel(activeArtwork)}
              {activeArtwork.availability !== "available" && (
                <span className="visit-price-status">
                  {availabilityLabel(activeArtwork)}
                </span>
              )}
            </p>
            {activeArtwork.description && (
              <p className="visit-description">{activeArtwork.description}</p>
            )}
            <div className="visit-detail-actions">
              <button
                className="visit-primary"
                onClick={() =>
                  navigate({ kind: "contact", artworkId: activeArtwork.id })
                }
              >
                <Mail size={16} />
                <span>S’informer sur cette œuvre</span>
                <ArrowUpRight size={16} />
              </button>
              <Link
                className="visit-complete"
                href={`/oeuvres/${activeArtwork.slug}`}
              >
                Voir la fiche complète <ArrowUpRight size={13} />
              </Link>
            </div>
          </aside>
        )}
        {!failed && (
          <dialog
            ref={editorialDialog}
            className="visit-editorial visit-editorial-paper"
            onCancel={(event) => {
              event.preventDefault();
              closeEditorial();
            }}
            onClick={(event) => {
              if (event.target !== event.currentTarget) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < bounds.left ||
                event.clientX > bounds.right ||
                event.clientY < bounds.top ||
                event.clientY > bounds.bottom
              )
                closeEditorial();
            }}
            aria-label={
              destination.kind === "about"
                ? "À propos de l’artiste"
                : "Contacter l’artiste"
            }
          >
            <button
              className="visit-icon visit-panel-close"
              aria-label="Revenir à la galerie"
              onClick={closeEditorial}
            >
              <X size={18} />
            </button>
            <div className="visit-editorial-art">
              <img
                src={
                  (
                    data.artworks.find((a) => a.id === "oeuvre-06") ??
                    data.artworks[0]
                  )?.image
                }
                alt={
                  (
                    data.artworks.find((a) => a.id === "oeuvre-06") ??
                    data.artworks[0]
                  )?.alt ?? ""
                }
              />
              <span>
                {data.settings.artistName}
                <small>La couleur comme langage</small>
              </span>
            </div>
            <div className="visit-editorial-body">
              <p className="eyebrow">
                {destination.kind === "about"
                  ? "Derrière les couleurs"
                  : "Un premier échange"}
              </p>
              <h2>
                {destination.kind === "about"
                  ? data.settings.aboutTitle
                  : data.settings.contactTitle}
              </h2>
              <p className="visit-editorial-copy">
                {destination.kind === "about"
                  ? data.settings.aboutText
                  : data.settings.contactText}
              </p>
              {destination.kind === "about" ? (
                <>
                  {data.settings.coursesText && (
                    <details className="visit-courses">
                      <summary>
                        Cours d’arts visuels <ChevronDown size={17} />
                      </summary>
                      <p className="visit-editorial-copy">
                        {data.settings.coursesText}
                      </p>
                    </details>
                  )}
                  <button
                    className="visit-primary"
                    onClick={() => navigate({ kind: "contact" })}
                  >
                    Entrer en contact <ArrowRight size={16} />
                  </button>
                </>
              ) : (
                <>
                  <ContactActions
                    settings={data.settings}
                    artwork={contactArtwork}
                  />
                  {contactArtwork && (
                    <button
                      className="visit-general"
                      onClick={() => navigate({ kind: "contact" })}
                    >
                      Faire une demande générale
                    </button>
                  )}
                </>
              )}
            </div>
          </dialog>
        )}
      </main>
      {ready && !failed && (
        <footer className="visit-dock" aria-label="Explorer la collection">
          <div className="visit-dock-heading">
            <button
              className="visit-room-switch"
              aria-label="Changer de salle"
              aria-haspopup="dialog"
              aria-expanded={drawer === "rooms"}
              title="Choisir une salle"
              onClick={() => openDrawer("rooms")}
            >
              <Grid2X2 size={16} />
              <span>Changer de salle</span>
              <ChevronDown className="visit-room-chevron" size={14} />
            </button>
            <button
              className="visit-room-next"
              onClick={() => navigate({ kind: "room", roomId: nextRoomId })}
              disabled={data.rooms.length < 2}
              aria-label={`Salle suivante : ${getRoomName(nextRoomId, data.artworks)}`}
            >
              Salle suivante <ArrowRight size={16} />
            </button>
            <nav
              className="visit-work-steps"
              aria-label="Parcourir les œuvres de cette collection"
            >
              <button
                className="visit-work-step"
                aria-label="Œuvre précédente"
                onClick={() => adjacent(-1)}
                disabled={!collectionArtworks.length}
              >
                <ChevronLeft size={18} />
                <span>Précédente</span>
              </button>
              <button
                className="visit-work-step"
                aria-label="Œuvre suivante"
                onClick={() => adjacent(1)}
                disabled={!collectionArtworks.length}
              >
                <span>Suivante</span>
                <ChevronRight size={18} />
              </button>
            </nav>
          </div>
          <div
            className="visit-series-tabs"
            role="tablist"
            aria-label="Collections de cette salle"
          >
            {roomCollections.map((group) => (
              <button
                key={group.name}
                role="tab"
                aria-selected={group.name === currentCollection?.name}
                aria-controls="visit-room-filmstrip"
                onClick={() => setSelectedCollection(group.name)}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                  event.preventDefault();
                  const index = roomCollections.findIndex(
                    (g) => g.name === group.name,
                  );
                  const next =
                    (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      roomCollections.length) %
                    roomCollections.length;
                  setSelectedCollection(roomCollections[next].name);
                  (
                    event.currentTarget.parentElement?.children[
                      next
                    ] as HTMLButtonElement
                  )?.focus();
                }}
              >
                {group.name}
                <span>{group.artworks.length} œuvres</span>
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            ref={filmstrip}
            id="visit-room-filmstrip"
            className="visit-filmstrip"
            aria-label={`Les œuvres de ${currentCollection?.name ?? "cette collection"}`}
          >
            {collectionArtworks.map((a) => (
              <button
                key={a.id}
                className="visit-film-card"
                data-availability={a.availability}
                data-artwork={a.id}
                aria-label={`Découvrir ${a.title}`}
                aria-describedby={`film-price-${a.id}${priceLabel(a) !== availabilityLabel(a) ? ` film-status-${a.id}` : ""}`}
                aria-pressed={a.id === activeArtwork?.id}
                onClick={() => selectArtwork(a)}
              >
                <img src={a.thumbnail} alt={a.alt} />
                <span>
                  <span className="visit-film-title">{a.title}</span>
                  <small id={`film-price-${a.id}`} className="visit-film-price">
                    {priceLabel(a)}
                  </small>
                  {priceLabel(a) !== availabilityLabel(a) && (
                    <small
                      id={`film-status-${a.id}`}
                      className="visit-film-status"
                    >
                      {availabilityLabel(a)}
                    </small>
                  )}
                </span>
                {a.id === activeArtwork?.id && (
                  <span className="visit-selected">
                    <Check size={12} />
                  </span>
                )}
              </button>
            ))}
          </div>
          {!seenHint && (
            <span className="visit-swipe-hint">
              Sur l’écran, balayez pour changer d’œuvre
            </span>
          )}
        </footer>
      )}
      <dialog
        ref={dialog}
        className={`visit-dialog ${drawer === "menu" ? "is-menu" : ""}`}
        aria-labelledby="visit-dialog-title"
        onCancel={closeDrawer}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDrawer();
        }}
      >
        <div className="visit-dialog-body">
          <div className="visit-dialog-heading">
            <div>
              <p className="eyebrow">La visite, à votre rythme</p>
              <h2 id="visit-dialog-title">
                {drawer === "artworks"
                  ? "Les œuvres"
                  : drawer === "rooms"
                    ? "Les salles"
                    : "Bienvenue"}
              </h2>
            </div>
            <button
              className="visit-icon"
              aria-label="Fermer le menu"
              onClick={closeDrawer}
            >
              <X size={23} />
            </button>
          </div>
          {drawer === "menu" && (
            <nav className="visit-mobile-links" aria-label="Menu de la visite">
              <button onClick={() => navigate({ kind: "home" })}>
                <Home size={20} />
                Accueil <ArrowUpRight size={16} />
              </button>
              <button onClick={() => setDrawer("artworks")}>
                <Grid2X2 size={20} />
                Les œuvres <ArrowRight size={16} />
              </button>
              <button onClick={() => setDrawer("rooms")}>
                <Compass size={20} />
                Changer de salle <ArrowRight size={16} />
              </button>
              <button onClick={() => navigate({ kind: "about" })}>
                À propos <ArrowUpRight size={16} />
              </button>
              <button onClick={() => navigate({ kind: "contact" })}>
                Contact <ArrowUpRight size={16} />
              </button>
              <Link href={classicUrl(destination, data.artworks)}>
                Catalogue classique <ArrowUpRight size={16} />
              </Link>
              <div className="visit-demo-note">
                Version de démonstration · Titres et collections provisoires ·
                Échelle indicative
              </div>
            </nav>
          )}
          {drawer === "rooms" && (
            <div className="visit-rooms">
              {data.rooms.map((id, index) => (
                <button
                  key={id}
                  className="visit-room-card"
                  onClick={() => navigate({ kind: "room", roomId: id })}
                >
                  <div
                    className="visit-room-preview"
                    style={{
                      backgroundImage: `url(/api/museum/arrival?room=${id}&view=wide&v=${previewVersion})`,
                    }}
                  />
                  <span className="eyebrow">
                    {data.artworks.filter((a) => a.roomId === id).length} œuvres
                  </span>
                  <h3>{getRoomName(id, data.artworks)}</h3>
                  <p>
                    {index === 0
                      ? "Des visages aux paysages intérieurs, dans la lumière du grand salon."
                      : "Paysages rêvés et métamorphoses se rencontrent dans le salon."}
                  </p>
                  <span className="visit-room-enter">
                    {roomId === id
                      ? "Salle actuelle"
                      : "Entrer dans cette salle"}
                    <ArrowRight size={18} />
                  </span>
                </button>
              ))}
            </div>
          )}
          {drawer === "artworks" && (
            <>
              <div
                className="visit-filters"
                aria-label="Filtrer par collection"
              >
                <button
                  aria-pressed={filter === "all"}
                  onClick={() => setFilter("all")}
                >
                  Toutes les œuvres
                </button>
                {groupCollections(data.artworks, data.rooms).map((group) => (
                  <button
                    key={group.name}
                    aria-pressed={filter === group.name}
                    onClick={() => setFilter(group.name)}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
              {filter !== "all" &&
                data.settings.collectionDescriptions?.[filter] && (
                  <p className="visit-collection-description">
                    {data.settings.collectionDescriptions[filter]}
                  </p>
                )}
              <div className="visit-art-grid">
                {data.artworks
                  .filter((a) => filter === "all" || a.collection === filter)
                  .map((a) => (
                    <button
                      key={a.id}
                      className="visit-art-card"
                      data-availability={a.availability}
                      aria-label={`Choisir ${a.title}`}
                      aria-describedby={`selection-price-${a.id} selection-status-${a.id}`}
                      aria-pressed={activeArtwork?.id === a.id}
                      onClick={() => selectArtwork(a)}
                    >
                      <div>
                        <img src={a.image} alt={a.alt} loading="lazy" />
                      </div>
                      <span>
                        <strong>{a.title}</strong>
                        <ArrowUpRight size={16} />
                      </span>
                      <small id={`selection-price-${a.id}`}>
                        {a.collection} · {priceLabel(a)}
                      </small>
                      <small id={`selection-status-${a.id}`}>
                        {availabilityLabel(a)}
                      </small>
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      </dialog>
      <span className="sr-only" role="status" aria-live="polite">
        {!traveling && activeArtwork
          ? `${activeArtwork.title}, ${getRoomName(roomId, data.artworks)}`
          : ""}
      </span>
    </div>
  );
}
