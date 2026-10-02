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
  DoorOpen,
  BookOpen,
  Grid2X2,
  Home,
  Info,
  Mail,
  Menu,
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
import { TourArtworkPreview } from "./TourArtworkPreview";
import { CollectionTabs } from "./CollectionTabs";
import { VisitHeaderNavigation } from "./VisitHeaderNavigation";
import ContactActions from "@/components/public/ContactActions";
import { useLiveMuseumData, useRoomPreviewVersion } from "./useLiveMuseumData";
import { useLiveRoomPreviews } from "./useLiveRoomPreviews";

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
  const [drawer, setDrawer] = useState<Drawer>(null);
  const { data, version: catalogueVersion } = useLiveMuseumData(
    initialData,
    drawer === "rooms",
  );
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
  const [hasLookedAround, setHasLookedAround] = useState(false);
  const [lookState, setLookState] = useState<
    "dragging" | "resuming" | "blocked" | "idle"
  >("idle");
  const {
    version: previewVersion,
    ready: previewReady,
    fingerprint: previewFingerprint,
  } = useRoomPreviewVersion(catalogueVersion, drawer === "rooms" || !revealed);
  const { images: roomPreviewImages, captureFrame: roomPreviewFrame } =
    useLiveRoomPreviews(
      data,
      previewFingerprint,
      previewReady,
      drawer === "rooms",
    );
  const [filter, setFilter] = useState("all");
  const [stripExpanded, setStripExpanded] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(
    initialDestination.kind === "artwork",
  );
  const [tourArtworkId, setTourArtworkId] = useState<string | null>(null);
  const dock = useRef<HTMLElement>(null);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
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
  const canBrowseInline =
    overview ||
    destination.kind === "artwork" ||
    destination.kind === "about" ||
    destination.kind === "contact";
  const showStrip = stripExpanded && canBrowseInline;
  const lookingAround = lookState === "dragging";
  const showDetails =
    ready &&
    !failed &&
    !!activeArtwork &&
    !traveling &&
    detailsOpen &&
    !lookingAround;
  const showEditorial =
    destination.kind === "about" || destination.kind === "contact";
  const showHome =
    !failed &&
    !traveling &&
    (destination.kind === "home" || destination.kind === "room");

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(
      () => setRevealed(true),
      reducedMotion ? 0 : 450,
    );
    return () => window.clearTimeout(timer);
  }, [ready, reducedMotion]);

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
      setDetailsOpen(next.kind === "artwork");
      const previous = lastDestination.current;
      if (
        JSON.stringify(next) === JSON.stringify(previous) &&
        !travelingRef.current &&
        !resume
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
      }
      if (next.kind === "artwork") {
        const artwork = data.artworks.find((a) => a.id === next.artworkId);
        if (artwork) setSelectedCollection(artwork.collection);
      }
      lastDestination.current = next;
      setDestination(next);

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
    window.addEventListener("popstate", pop);
    return () => {
      motion.removeEventListener("change", change);
      window.removeEventListener("popstate", pop);
    };
  }, [data.artworks, data.rooms, navigate]);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (drawer && !node.open) node.show();
    if (!drawer && node.open) {
      const restoreFocus =
        document.activeElement === document.body ||
        node.contains(document.activeElement);
      node.close();
      if (restoreFocus) drawerOpener.current?.focus({ preventScroll: true });
    }
  }, [drawer]);
  useEffect(() => {
    const node = editorialDialog.current;
    if (!node) return;
    // Content windows leave both navigation bars available.
    if (showEditorial && !node.open) node.show();
    if (!showEditorial && node.open) {
      const restoreFocus =
        document.activeElement === document.body ||
        node.contains(document.activeElement);
      node.close();
      if (!restoreFocus) return;
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
      // Use the latest requested destination, including clicks in the same frame.
      const requested = lastDestination.current;
      const index = collection.findIndex(
        (a) => requested.kind === "artwork" && a.id === requested.artworkId,
      );
      const base = index < 0 ? (offset > 0 ? -1 : 0) : index;
      const next = (base + offset + collection.length) % collection.length;
      navigate({ kind: "artwork", artworkId: collection[next].id });
    },
    [collectionArtworks, navigate],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (dialog.current?.open) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeDrawer();
        }
        return;
      }
      if (editorialDialog.current?.open) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeEditorial();
        }
        return;
      }
      if (
        (event.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true],[role=tablist]",
        )
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
  }, [
    destination.kind,
    roomId,
    adjacent,
    navigate,
    closeArtwork,
    closeEditorial,
    closeDrawer,
  ]);
  useEffect(() => {
    const tabs = dock.current?.querySelector<HTMLElement>(".visit-series-tabs");
    const activeTab = tabs?.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    if (tabs && activeTab) {
      const left = activeTab.offsetLeft - tabs.offsetLeft;
      if (
        left < tabs.scrollLeft ||
        left + activeTab.offsetWidth > tabs.scrollLeft + tabs.clientWidth
      )
        tabs.scrollTo({
          left: Math.max(0, left - 8),
          behavior: reducedMotion ? "instant" : "smooth",
        });
    }
    const node = filmstrip.current;
    const selected = Array.from(
      node?.querySelectorAll<HTMLElement>("[data-artwork]") ?? [],
    ).find((card) => card.dataset.artwork === activeArtwork?.id);
    if (node && selected)
      node.scrollTo({
        left:
          selected.offsetLeft -
          node.offsetLeft -
          (node.clientWidth - selected.clientWidth) / 2,
        behavior: reducedMotion ? "instant" : "smooth",
      });
    else if (node) node.scrollTo({ left: 0, behavior: "instant" });
  }, [activeArtwork?.id, currentCollection?.name, showStrip, reducedMotion]);

  // Reserve the real dock height, including wrapped labels and safe-area spacing.
  useEffect(() => {
    const node = dock.current;
    const shell = node?.closest<HTMLElement>(".visit-shell");
    if (!node || !shell) return;
    const update = () => {
      const clearance =
        shell.getBoundingClientRect().bottom -
        node.getBoundingClientRect().top +
        10;
      shell.style.setProperty("--dock-clearance", `${clearance}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    observer.observe(shell);
    update();
    return () => observer.disconnect();
  }, [ready, failed]);

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
  const selectArtwork = (a: Artwork) =>
    navigate({ kind: "artwork", artworkId: a.id });
  const roomCaption =
    roomId === "room-1"
      ? "La lumière, la couleur, une première rencontre."
      : "Une autre lumière. Le temps de s’attarder.";
  const headerActive =
    drawer === "artworks"
      ? "artworks"
      : destination.kind === "about"
        ? "about"
        : destination.kind === "contact"
          ? "contact"
          : activeArtwork
            ? "artworks"
            : "home";
  return (
    <div
      className={`visit-shell ${activeArtwork ? "is-artwork" : ""} ${showEditorial ? "is-editorial" : ""} ${traveling ? "is-traveling" : ""}`}
      data-arrival-state={!ready ? "poster" : revealed ? "live" : "revealing"}
      data-scene-destination={sceneDestination.kind}
      data-visit-room={roomId}
      data-room-autoplay={roomAutoplay}
      data-drawer-open={!!drawer}
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
        <VisitHeaderNavigation activeKey={headerActive}>
          <a
            href="/"
            onClick={(e) => menuLink(e, { kind: "home" })}
            aria-current={headerActive === "home" ? "page" : undefined}
          >
            Accueil
          </a>
          <button
            aria-current={headerActive === "artworks" ? "page" : undefined}
            aria-haspopup="dialog"
            onClick={() => {
              setFilter("all");
              openDrawer("artworks");
            }}
          >
            Les œuvres
          </button>
          <a
            href="/a-propos"
            onClick={(e) => menuLink(e, { kind: "about" })}
            aria-current={headerActive === "about" ? "page" : undefined}
          >
            À propos
          </a>
          <a
            href="/contact"
            onClick={(e) => menuLink(e, { kind: "contact" })}
            aria-current={headerActive === "contact" ? "page" : undefined}
          >
            Contact
          </a>
        </VisitHeaderNavigation>
        <div className="visit-header-actions">
          <Link
            className="visit-catalogue gallery-view-switch"
            aria-label="Voir le catalogue"
            href={classicUrl(destination, data.artworks)}
          >
            <BookOpen size={17} strokeWidth={1.5} />
            <span>Catalogue</span>
          </Link>
          <button
            className="visit-icon visit-menu"
            aria-label="Ouvrir le menu"
            aria-haspopup="dialog"
            onClick={() => openDrawer("menu")}
          >
            <Menu size={20} />
            <span>Menu</span>
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
          inert={showEditorial || !!drawer}
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
                onSelect={(next) => {
                  if (Date.now() >= suppressClick.current) navigate(next);
                }}
                onArrive={onArrive}
                onReady={onReady}
                onTourArtwork={setTourArtworkId}
                onLookStateChange={setLookState}
                allowManualLook={!showEditorial && !drawer}
                onLookResume={(roomId) => {
                  if (showEditorial || drawer) return;
                  setHasLookedAround(true);
                  suppressClick.current = Date.now() + 350;
                  navigate({ kind: "room", roomId }, true, true);
                }}
                onError={onError}
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
          <span className="visit-loading-hint" role="status">
            <span className="visit-loading-spinner" aria-hidden="true" />
            Chargement de la visite…
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
          <div
            className={`visit-hero ${destination.kind === "home" ? "is-introduction" : "is-room-label"}`}
          >
            <p className="eyebrow">
              {roomCollections.length ? (
                <>
                  Collections :{" "}
                  {roomCollections.map((group) => group.name).join(" · ")}
                </>
              ) : (
                getRoomName(roomId, data.artworks)
              )}
            </p>
            {data.rooms.length > 1 && (
              <button
                className="visit-other-collections"
                onClick={() => navigate({ kind: "room", roomId: nextRoomId })}
              >
                Voir les autres collections <ArrowRight size={15} />
              </button>
            )}
            {destination.kind === "home" && (
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
        {ready && !failed && activeArtwork && (
          <button
            className="visit-back"
            onClick={closeArtwork}
            aria-label="Reprendre la visite"
          >
            <ArrowLeft size={16} />
            <span>Reprendre la visite</span>
          </button>
        )}
        {ready &&
          !failed &&
          overview &&
          (!hasLookedAround || lookState === "blocked") && (
            <p
              className="visit-look-help"
              role={lookState === "blocked" ? "status" : undefined}
            >
              {lookState === "blocked"
                ? "Tournez un peu pour continuer"
                : "Cliquez-glissez pour regarder"}
            </p>
          )}
        {ready && !failed && activeArtwork && !traveling && !detailsOpen && (
          <div
            className="visit-artwork-caption"
            aria-label="Œuvre sélectionnée"
          >
            <span title={activeArtwork.title}>{activeArtwork.title}</span>
            <small>{priceLabel(activeArtwork)}</small>
          </div>
        )}
        {ready && !failed && activeArtwork && (
          <aside
            className="visit-details"
            aria-label={`Fiche de ${activeArtwork.title}`}
            data-visible={showDetails}
            aria-hidden={!showDetails}
            inert={!showDetails}
          >
            <div className="visit-details-top">
              <span className="eyebrow">
                {activeArtwork.collection || getRoomName(roomId, data.artworks)}
              </span>
              <button
                className="visit-icon"
                aria-label="Fermer les informations"
                onClick={() => setDetailsOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <h2 title={activeArtwork.title}>{activeArtwork.title}</h2>
            <p className="visit-price">
              {priceLabel(activeArtwork)}
              {activeArtwork.availability !== "available" && (
                <span className="visit-price-status">
                  {availabilityLabel(activeArtwork)}
                </span>
              )}
            </p>
            {(activeArtwork.technique ||
              (activeArtwork.widthCm && activeArtwork.heightCm) ||
              activeArtwork.year ||
              activeArtwork.description) && (
              <div className="visit-work-info">
                <p className="visit-medium">
                  {[
                    activeArtwork.technique,
                    activeArtwork.widthCm && activeArtwork.heightCm
                      ? `${activeArtwork.widthCm} × ${activeArtwork.heightCm} cm`
                      : null,
                    activeArtwork.year,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {activeArtwork.description && (
                  <p className="visit-description">
                    {activeArtwork.description}
                  </p>
                )}
              </div>
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
        {(showEditorial || drawer) && !failed && (
          <div
            className="visit-editorial-shade"
            aria-hidden="true"
            onClick={drawer ? closeDrawer : closeEditorial}
          />
        )}
        {!failed && (
          <dialog
            ref={editorialDialog}
            className="visit-editorial visit-editorial-paper"
            inert={!!drawer}
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
              {showEditorial && (
                <img
                  crossOrigin="anonymous"
                  decoding="async"
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
              )}
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
                    canSend={data.contactEnabled}
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
      {ready &&
        !failed &&
        revealed &&
        !showEditorial &&
        ((overview && !reducedMotion && !traveling) || lookingAround) &&
        !drawer && (
          <TourArtworkPreview
            lookingAround={lookingAround}
            collectionDescriptions={data.settings.collectionDescriptions}
            artwork={data.artworks.find((a) => a.id === tourArtworkId)}
            dock={dock}
            onSelect={navigate}
          />
        )}
      {ready && !failed && (
        <footer
          ref={dock}
          className={`visit-dock ${showStrip ? "is-expanded" : "is-compact"}`}
          aria-label="Explorer la collection"
        >
          <div className="visit-dock-heading">
            <button
              className="visit-room-switch"
              aria-label="Changer de salle"
              aria-haspopup="dialog"
              aria-expanded={drawer === "rooms"}
              title="Choisir une salle"
              onClick={() => openDrawer("rooms")}
            >
              <DoorOpen size={20} strokeWidth={1.6} aria-hidden="true" />
              <span>Salles</span>
              <ChevronDown className="visit-room-chevron" size={14} />
            </button>
            {canBrowseInline && (
              <CollectionTabs
                collections={roomCollections}
                selected={currentCollection?.name}
                reducedMotion={reducedMotion}
                onSelect={(name) => {
                  setSelectedCollection(name);
                  setStripExpanded(true);
                }}
              />
            )}
            <button
              className="visit-browse-toggle"
              aria-expanded={canBrowseInline ? showStrip : undefined}
              aria-controls={
                canBrowseInline ? "visit-collection-browser" : undefined
              }
              aria-label={
                canBrowseInline
                  ? showStrip
                    ? "Réduire les miniatures"
                    : "Afficher les miniatures"
                  : "Choisir une œuvre"
              }
              onClick={() => {
                if (canBrowseInline) setStripExpanded((value) => !value);
                else {
                  setFilter(currentCollection?.name ?? "all");
                  openDrawer("artworks");
                }
              }}
            >
              <Grid2X2 size={16} />
              <span>Œuvres</span>
              {canBrowseInline && (
                <ChevronDown
                  size={14}
                  className={showStrip ? "" : "is-closed"}
                />
              )}
            </button>
            {activeArtwork && (
              <button
                className="visit-info-toggle"
                aria-label={
                  detailsOpen
                    ? "Masquer les informations"
                    : "Informations sur cette œuvre"
                }
                aria-expanded={detailsOpen}
                onClick={() => setDetailsOpen((value) => !value)}
              >
                <Info size={17} />
                <span>Infos</span>
              </button>
            )}
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
          <div id="visit-collection-browser" hidden={!showStrip}>
            <div className="visit-filmstrip-row">
              <button
                className="visit-strip-arrow visit-icon"
                aria-label="Défiler les miniatures vers la gauche"
                onClick={() =>
                  filmstrip.current?.scrollBy({
                    left: -filmstrip.current.clientWidth * 0.8,
                    behavior: reducedMotion ? "instant" : "smooth",
                  })
                }
              >
                <ChevronLeft size={20} />
              </button>
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
                    <img
                      src={a.thumbnail}
                      alt={a.alt}
                      loading="lazy"
                      decoding="async"
                      crossOrigin="anonymous"
                    />
                    <span>
                      <span className="visit-film-title">{a.title}</span>
                      <small
                        id={`film-price-${a.id}`}
                        className="visit-film-price"
                      >
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
              <button
                className="visit-strip-arrow visit-icon"
                aria-label="Défiler les miniatures vers la droite"
                onClick={() =>
                  filmstrip.current?.scrollBy({
                    left: filmstrip.current.clientWidth * 0.8,
                    behavior: reducedMotion ? "instant" : "smooth",
                  })
                }
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
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
              <button
                onClick={() => {
                  setFilter("all");
                  setDrawer("artworks");
                }}
              >
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
                Catalogue <ArrowUpRight size={16} />
              </Link>
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
                    style={
                      previewReady || roomPreviewImages[id]
                        ? {
                            backgroundImage: `url(${roomPreviewImages[id] || `/api/museum/arrival?room=${id}&view=wide&v=${previewVersion}`})`,
                          }
                        : undefined
                    }
                    data-preview-ready={previewReady || !!roomPreviewImages[id]}
                  >
                    {!previewReady && !roomPreviewImages[id] && (
                      <div className="visit-room-preview-pending">
                        <div>
                          {data.artworks
                            .filter((a) => a.roomId === id)
                            .slice(0, 3)
                            .map((a) => (
                              <img key={a.id} src={a.thumbnail} alt={a.alt} />
                            ))}
                        </div>
                        <span>Aperçu de la salle en préparation</span>
                      </div>
                    )}
                  </div>
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
              {groupCollections(data.artworks, data.rooms)
                .filter((group) => filter === "all" || group.name === filter)
                .map((group) => (
                  <section
                    key={group.name}
                    className="visit-art-collection"
                    aria-label={group.name}
                  >
                    {filter === "all" && (
                      <div className="visit-art-collection-heading">
                        <h3>{group.name}</h3>
                        <span>{group.artworks.length} œuvres</span>
                      </div>
                    )}
                    <div className="visit-art-grid">
                      {group.artworks.map((a) => (
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
                            <img
                              src={a.image}
                              alt={a.alt}
                              loading="lazy"
                              crossOrigin="anonymous"
                              decoding="async"
                            />
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
                  </section>
                ))}
            </>
          )}
        </div>
      </dialog>
      {roomPreviewFrame}
      <span className="sr-only" role="status" aria-live="polite">
        {!traveling && activeArtwork
          ? `${activeArtwork.title}, ${getRoomName(roomId, data.artworks)}`
          : ""}
      </span>
    </div>
  );
}
