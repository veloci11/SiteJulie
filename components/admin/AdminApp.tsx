"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  LogOut,
  ImagePlus,
  Check,
  Settings,
  Paintbrush,
  Eye,
  Save,
  X,
} from "lucide-react";
import type { AdminArtwork, SiteSettings } from "@/lib/data/types";
import {
  collectionKey,
  groupCollections,
  moveToCollection,
  normalizeCollectionOrder,
} from "@/lib/data/collections";
import PlacementEditor from "./PlacementEditor";
import ArrivalRefresh from "./ArrivalRefresh";
import { ArtworkImage, PriceInput } from "./EditorFields";
import { notifyCatalogueChanged } from "@/lib/museum/catalogueEvents";
import { getSlots } from "@/lib/museum/config";
import { getZones, normalizeZoneArtwork } from "@/lib/museum/zones";
import { showroomReference } from "@/lib/museum/showroomSizing";
import { safeDisplayScale } from "@/lib/validation/placement";
import { slotCode, WALL_GUIDES } from "@/lib/admin/placement-guide";
import { wallKey } from "@/lib/validation/placement";
import RoomOverview from "./RoomOverview";
import RoomLayoutEditor from "./RoomLayoutEditor";
import type { RoomLayoutDraft } from "@/lib/admin/room-layout";
import "./admin.css";
type Data = {
  artworks: AdminArtwork[];
  settings: SiteSettings;
  rooms: string[];
  roomLayoutDrafts?: Record<string, RoomLayoutDraft>;
};
async function api<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers:
        body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      "Connexion interrompue. Vos saisies sont conservées ; vérifiez votre connexion et réessayez.",
    );
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401)
    throw new Error(
      "Votre session a expiré. Reconnectez-vous dans un autre onglet, puis réessayez ici : vos saisies sont conservées.",
    );
  if (!res.ok || !data)
    throw new Error(
      data?.error ||
        "Le serveur est momentanément indisponible. Vos saisies sont conservées ; réessayez.",
    );
  if (
    method !== "GET" &&
    [
      "/api/admin/artworks",
      "/api/admin/process",
      "/api/admin/settings",
      "/api/admin/collections",
      "/api/admin/rooms",
    ].includes(url)
  )
    notifyCatalogueChanged();
  return data;
}
const availability = {
  available: "Disponible",
  reserved: "Réservée",
  sold: "Vendue",
  private_collection: "Collection privée",
};
const publications = {
  draft: "Brouillon",
  published: "Publiée",
  archived: "Archivée",
};
function placementReference(artwork: AdminArtwork) {
  const slot = getSlots(artwork.roomId).find(
    (slot) => slot.id === artwork.slotId,
  );
  if (!slot) return "Emplacement automatique";
  const wall = WALL_GUIDES.find((wall) => wall.id === wallKey(slot))!;
  return `Mur ${wall.code} · ${slotCode(slot)}`;
}
export default function AdminApp({
  initialData,
  demo,
  singleAdmin,
}: {
  initialData: Data | null;
  demo: boolean;
  singleAdmin: boolean;
}) {
  const [data, setData] = useState(
    initialData
      ? {
          ...initialData,
          artworks: normalizeCollectionOrder(
            initialData.artworks,
            initialData.rooms,
          ),
        }
      : null,
  );
  const [editing, setEditing] = useState<AdminArtwork | null>(null);
  const [roomEditing, setRoomEditing] = useState<string | null>(null);
  const [tab, setTab] = useState<"artworks" | "settings">("artworks");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [baseline, setBaseline] = useState<AdminArtwork | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imageChecking, setImageChecking] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [formTouched, setFormTouched] = useState(false);
  const [progress, setProgress] = useState("");
  const operation = useRef(false);
  const dirty =
    settingsDirty ||
    Boolean(
      editing &&
      (formTouched ||
        pendingImage ||
        JSON.stringify(editing) !== JSON.stringify(baseline)),
    );
  useEffect(() => {
    if (!pendingImage) {
      setImagePreview("");
      return;
    }
    const url = URL.createObjectURL(pendingImage);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  function leave(action: () => void) {
    if (operation.current) return;
    if (
      dirty &&
      !window.confirm(
        "Des modifications ne sont pas enregistrées. Quitter cet écran et les abandonner ?",
      )
    )
      return;
    setPendingImage(null);
    setImageChecking(false);
    setSettingsDirty(false);
    setFormTouched(false);
    setError("");
    setMessage("");
    action();
    window.scrollTo({ top: 0 });
  }
  function openArtwork(artwork: AdminArtwork) {
    setImageChecking(false);
    const normalized = normalizeZoneArtwork(artwork);
    setEditing(normalized);
    setBaseline(normalized);
    setPendingImage(null);
    setFormTouched(false);
    setError("");
    setMessage("");
    window.scrollTo({ top: 0 });
  }
  function showError(message: string) {
    setMessage("");
    setError(message);
  }
  function validateForm(form: HTMLFormElement) {
    const invalid = form.querySelector<HTMLInputElement>(
      "input:invalid, select:invalid, textarea:invalid",
    );
    if (!invalid) return true;
    let ancestor = invalid.parentElement;
    while (ancestor) {
      if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
    showError(
      `${invalid.labels?.[0]?.childNodes[0]?.textContent?.trim() || "Champ"} : ${invalid.validationMessage}`,
    );
    invalid.focus();
    return false;
  }
  async function perform(fn: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      operation.current = false;
      setBusy(false);
      setProgress("");
    }
  }
  async function refresh() {
    setData(await api<Data>("/api/admin/artworks", undefined, "GET"));
  }
  const groups = data
    ? groupCollections(data.artworks, data.rooms, data.settings.collectionRooms)
    : [];
  const roomCapacity = (room: string) => {
    const slots = getZones(room, data?.rooms);
    const occupied = new Set(
      data?.artworks
        .filter((a) => a.publication === "published")
        .map((a) => a.slotId),
    );
    return {
      total: slots.length,
      free: slots.filter((slot) => !occupied.has(slot.id)).length,
    };
  };
  const suggestedGroup =
    groups.find((group) => roomCapacity(group.roomId).free > 0) ?? groups[0];
  function newArtwork(
    collection = suggestedGroup?.name ?? "",
    roomId = suggestedGroup?.roomId ?? "room-1",
  ) {
    const id = crypto.randomUUID();
    openArtwork({
      id,
      slug: `oeuvre-${id.slice(0, 8)}`,
      title: "",
      description: "",
      technique: null,
      widthCm: null,
      heightCm: null,
      year: null,
      imageWidth: 0,
      imageHeight: 0,
      image: "",
      thumbnail: "",
      detailImage: "",
      alt: "",
      priceMinor: null,
      currency: data!.settings.currency,
      availability: "available",
      publication: "draft",
      priceVisibility: "on_request",
      roomId,
      slotId: "",
      frameStyle: "brass",
      placementOffsetX: 0,
      placementOffsetY: 0,
      displayScale: 1,
      order: groups.find((g) => g.name === collection)?.artworks.length ?? 0,
      collection,
      revision: 0,
    });
    setError("");
    setMessage("");
  }
  function put<K extends keyof AdminArtwork>(key: K, value: AdminArtwork[K]) {
    setEditing((a) => {
      if (!a) return null;
      const next = { ...a, [key]: value };
      if (
        ["widthCm", "heightCm"].includes(key) &&
        a[key] !== value &&
        (next.widthCm || next.heightCm) &&
        next.imageWidth > 0
      ) {
        const slot =
          getSlots(next.roomId).find((s) => s.id === next.slotId) ??
          getZones(next.roomId, data?.rooms)[0];
        next.displayScale = safeDisplayScale(
          next,
          slot,
          showroomReference(next, slot).scale,
          next.slotId ? (data?.artworks ?? []) : [],
        );
      }
      return next;
    });
  }
  function remember(
    saved: AdminArtwork,
    desiredPublication = saved.publication,
  ) {
    setBaseline(saved);
    setEditing({ ...saved, publication: desiredPublication });
    setData((previous) =>
      previous
        ? {
            ...previous,
            artworks: [
              ...previous.artworks.filter((a) => a.id !== saved.id),
              saved,
            ],
          }
        : previous,
    );
  }
  async function save(a: AdminArtwork) {
    if (a.publication === "published" && !a.image && !pendingImage) {
      showError(
        "Ajoutez l’image du tableau avant de publier. Vous pouvez aussi l’enregistrer en brouillon.",
      );
      return;
    }
    const publication = a.publication;
    const initializeAfterImage = !a.image && !!(a.widthCm || a.heightCm);
    let saved: AdminArtwork;
    setProgress("Enregistrement de la fiche…");
    // A new work needs a private draft before its first media upload.
    saved = await api<AdminArtwork>("/api/admin/artworks", {
      ...a,
      publication: pendingImage && !a.image ? "draft" : publication,
    });
    remember(saved, publication);
    setFormTouched(false);
    if (pendingImage) {
      let imagePrepared = false;
      try {
        setProgress("Envoi de l’image…");
        const token = await api<{ id: string; url: string }>(
          "/api/admin/upload",
          { artworkId: saved.id },
        );
        const response = await fetch(token.url, {
          method: "PUT",
          headers: {
            "Content-Type": pendingImage.type || "application/octet-stream",
          },
          body: pendingImage,
        });
        if (!response.ok)
          throw new Error(
            "Envoi interrompu. Vérifiez votre connexion et réessayez.",
          );
        setProgress("Préparation de l’image…");
        saved = await api<AdminArtwork>("/api/admin/process", { id: token.id });
        remember(saved, publication);
        setPendingImage(null);
        imagePrepared = true;
        if (initializeAfterImage) {
          const slot =
            getSlots(saved.roomId).find((s) => s.id === saved.slotId) ??
            getZones(saved.roomId, data?.rooms)[0];
          saved = await api<AdminArtwork>("/api/admin/artworks", {
            ...saved,
            displayScale: safeDisplayScale(
              saved,
              slot,
              showroomReference(saved, slot).scale,
              saved.slotId ? (data?.artworks ?? []) : [],
            ),
          });
        }
        remember(saved, publication);
        setPendingImage(null);
      } catch (error) {
        throw new Error(
          imagePrepared
            ? `L’image est enregistrée. La taille de départ n’a pas pu être appliquée ; utilisez « Revenir à 100 % » dans l’accrochage puis enregistrez. ${error instanceof Error ? error.message : ""}`
            : `La fiche est enregistrée${saved.publication === "draft" ? " en brouillon" : ""}, mais la nouvelle image n’a pas été enregistrée. ${error instanceof Error ? error.message : "Réessayez."}`,
        );
      }
    }
    if (saved.publication !== publication) {
      setProgress("Publication de l’œuvre…");
      saved = await api<AdminArtwork>("/api/admin/artworks", {
        ...saved,
        publication,
      });
      remember(saved);
    }
    setFormTouched(false);
    setMessage(
      saved.publication === "published"
        ? "Œuvre enregistrée et visible dans la galerie."
        : saved.publication === "archived"
          ? "Œuvre archivée et retirée de la galerie."
          : "Brouillon enregistré. Visible uniquement dans votre atelier.",
    );
    try {
      await refresh();
    } catch {
      setMessage(
        "Enregistrement réussi. La liste n’a pas pu être actualisée ; rechargez-la lorsque la connexion revient.",
      );
    }
  }
  return (
    <main className="admin-shell">
      {data && creatingCollection && (
        <CollectionCreator
          rooms={data.rooms}
          collections={groups.map(({ name, roomId }) => ({ name, roomId }))}
          capacity={roomCapacity}
          onAddRoom={() =>
            perform(async () => {
              const { id } = await api<{ id: string }>("/api/admin/rooms");
              setData((previous) =>
                previous
                  ? { ...previous, rooms: [...previous.rooms, id] }
                  : previous,
              );
            })
          }
          initialRoom={editing?.roomId ?? data.rooms[0]}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) setCreatingCollection(false);
          }}
          onCreate={(name, roomId) =>
            perform(async () => {
              const created = await api<{ name: string; roomId: string }>(
                "/api/admin/collections",
                { name, roomId },
              );
              await refresh();
              if (editing)
                setEditing(
                  moveToCollection(editing, created.name, data.artworks, {
                    ...data.settings.collectionRooms,
                    [created.name]: created.roomId,
                  }),
                );
              setCreatingCollection(false);
              setMessage(
                `Collection « ${created.name} » créée dans la salle ${created.roomId.replace("room-", "")}.`,
              );
            })
          }
        />
      )}
      <aside className="admin-sidebar" aria-label="Navigation de l’atelier">
        <Link
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="admin-brand"
        >
          <span>G</span> L’atelier
        </Link>
        <p className="admin-overline">ESPACE ARTISTE</p>
        {data && (
          <nav>
            <button
              className={tab === "artworks" ? "active" : ""}
              disabled={busy || Boolean(roomEditing)}
              onClick={() =>
                leave(() => {
                  setTab("artworks");
                  setEditing(null);
                })
              }
            >
              <Paintbrush size={18} />
              Les œuvres
            </button>
            <button
              className={tab === "settings" ? "active" : ""}
              disabled={busy || Boolean(roomEditing)}
              onClick={() =>
                leave(() => {
                  setTab("settings");
                  setEditing(null);
                })
              }
            >
              <Settings size={18} />
              Textes & contact
            </button>
          </nav>
        )}
        <div className="admin-sidebar-bottom">
          <Link href="/" target="_blank">
            <Eye size={17} />
            Voir la galerie
          </Link>
          {data && (
            <button
              disabled={busy || Boolean(roomEditing)}
              onClick={() =>
                leave(() => {
                  void perform(async () => {
                    await api("/api/admin/logout");
                    setData(null);
                    setEditing(null);
                    setTab("artworks");
                  });
                })
              }
            >
              <LogOut size={17} />
              Se déconnecter
            </button>
          )}
        </div>
      </aside>
      <div className="admin-main">
        {data && (singleAdmin || demo) && <ArrivalRefresh />}
        {demo && (
          <div className="admin-demo">
            Démonstration locale · Les modifications sont conservées sur cet
            ordinateur. Aucune publication sur Internet.
          </div>
        )}
        <div className="admin-notices" aria-live="polite">
          {error && !editing && tab !== "settings" && !creatingCollection && (
            <div className="admin-error" role="alert">
              {error}
            </div>
          )}
          {message && !editing && tab !== "settings" && (
            <div className="admin-success">
              <Check size={17} />
              {message}
            </div>
          )}
        </div>
        {!data ? (
          <section className="admin-login">
            <p className="admin-overline">BIENVENUE DANS VOTRE ATELIER</p>
            <h1>
              Un espace pour
              <br />
              <em>vos œuvres.</em>
            </h1>
            <p>
              Ajoutez vos tableaux, composez votre galerie
              <br />
              et partagez votre univers.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                perform(async () => {
                  await api(
                    "/api/admin/login",
                    demo
                      ? {}
                      : {
                          ...(singleAdmin
                            ? { username: values.get("username") }
                            : { email: values.get("email") }),
                          password: values.get("password"),
                        },
                  );
                  await refresh();
                });
              }}
            >
              {!demo && !singleAdmin && (
                <>
                  <label>
                    Email
                    <input
                      type="email"
                      name="email"
                      required
                      autoComplete="username"
                    />
                  </label>
                </>
              )}
              {!demo && singleAdmin && (
                <label>
                  Identifiant
                  <input
                    type="text"
                    name="username"
                    required
                    autoComplete="username"
                  />
                </label>
              )}
              {!demo && (
                <label>
                  Mot de passe
                  <input
                    type="password"
                    name="password"
                    required
                    autoComplete="current-password"
                  />
                </label>
              )}
              <button className="admin-primary" disabled={busy}>
                {busy
                  ? "Connexion…"
                  : demo
                    ? "Ouvrir l’atelier de démonstration"
                    : "Se connecter"}{" "}
                <ArrowLeft size={16} style={{ transform: "rotate(180deg)" }} />
              </button>
            </form>
            {demo && (
              <small>
                Accès de test réservé à localhost. Une connexion sécurisée sera
                requise pour la mise en ligne.
              </small>
            )}
          </section>
        ) : roomEditing ? (
          <RoomLayoutEditor
            key={roomEditing}
            roomId={roomEditing}
            rooms={data.rooms}
            onClose={(applied) => {
              setRoomEditing(null);
              setError("");
              setMessage(
                applied
                  ? "La nouvelle disposition de la salle est enregistrée et visible dans la galerie."
                  : "",
              );
              void refresh().catch(() =>
                setError(
                  "La liste n’a pas pu être actualisée. Rechargez l’atelier ; vos enregistrements sont conservés.",
                ),
              );
            }}
          />
        ) : tab === "settings" ? (
          <SettingsEditor
            settings={data.settings}
            busy={busy}
            error={error}
            message={message}
            dirty={settingsDirty}
            onDirty={() => {
              setSettingsDirty(true);
              setMessage("");
              setError("");
            }}
            validateForm={validateForm}
            onSave={(settings) =>
              perform(async () => {
                const saved = await api<SiteSettings>(
                  "/api/admin/settings",
                  settings,
                );
                setData((previous) =>
                  previous ? { ...previous, settings: saved } : previous,
                );
                setSettingsDirty(false);
                setMessage("Textes et contact mis à jour.");
              })
            }
          />
        ) : editing ? (
          <>
            <header className="admin-heading">
              <div>
                <button
                  className="admin-back"
                  disabled={busy}
                  onClick={() => leave(() => setEditing(null))}
                >
                  <ArrowLeft size={16} />
                  Toutes les œuvres
                </button>
                <h1>
                  {editing.revision ? "Modifier l’œuvre" : "Une nouvelle œuvre"}
                </h1>
              </div>
              <span
                className={`admin-badge ${baseline?.publication || "draft"}`}
              >
                {editing.revision
                  ? publications[baseline?.publication || "draft"]
                  : "Nouvelle fiche"}
              </span>
            </header>
            <form
              noValidate
              onInput={() => {
                setFormTouched(true);
                setMessage("");
                setError("");
              }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!validateForm(e.currentTarget)) return;
                void perform(() => save(editing));
              }}
            >
              <fieldset
                className="admin-editor-controls"
                disabled={busy}
                aria-busy={busy}
              >
                <div className="admin-editor">
                  <aside
                    className="admin-preview"
                    aria-label="Image et aperçu de l’œuvre"
                  >
                    <ArtworkImage
                      key={editing.id}
                      artwork={editing}
                      file={pendingImage}
                      preview={imagePreview}
                      busy={busy}
                      onFile={(file) => {
                        setPendingImage(file);
                        setError("");
                        setMessage("");
                      }}
                      onAlt={(alt) => put("alt", alt)}
                      onError={showError}
                      onChecking={setImageChecking}
                    />
                    <section className="admin-card admin-preview-card">
                      <p className="admin-overline">APERÇU DE LA FICHE</p>
                      <h2>{editing.title || "Titre de votre œuvre"}</h2>
                      <p>
                        {[editing.technique, editing.year]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p>
                        {editing.priceVisibility === "public" &&
                        editing.priceMinor !== null
                          ? new Intl.NumberFormat("fr-FR", {
                              style: "currency",
                              currency: editing.currency,
                            }).format(editing.priceMinor / 100)
                          : "Prix sur demande"}
                      </p>
                      <span>{availability[editing.availability]}</span>
                    </section>
                  </aside>
                  <div className="admin-fields">
                    <section className="admin-card">
                      <h2>L’œuvre</h2>
                      <label>
                        Titre
                        <input
                          required
                          maxLength={200}
                          value={editing.title}
                          onChange={(e) => put("title", e.target.value)}
                        />
                      </label>
                      <details className="admin-link-options">
                        <summary>Personnaliser le lien de l’œuvre</summary>
                        <label>
                          Identifiant du lien
                          <input
                            required
                            maxLength={120}
                            pattern="[a-z0-9]+(-[a-z0-9]+)*"
                            value={editing.slug}
                            onChange={(e) => put("slug", e.target.value)}
                          />
                          <small>
                            Lettres minuscules, chiffres et tirets. Modifier ce
                            lien rend l’ancienne adresse indisponible.
                          </small>
                        </label>
                      </details>
                      <label>
                        Description
                        <textarea
                          rows={4}
                          maxLength={6000}
                          value={editing.description}
                          onChange={(e) => put("description", e.target.value)}
                        />
                      </label>
                      <div className="admin-two">
                        <label>
                          Technique <small>facultatif</small>
                          <input
                            maxLength={200}
                            value={editing.technique || ""}
                            onChange={(e) =>
                              put("technique", e.target.value || null)
                            }
                          />
                        </label>
                        <label>
                          Année <small>facultatif</small>
                          <input
                            type="number"
                            min={1000}
                            max={2200}
                            value={editing.year || ""}
                            onChange={(e) =>
                              put(
                                "year",
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                        </label>
                      </div>
                      <div className="admin-two">
                        <label>
                          Largeur réelle (cm)
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            max={100000}
                            value={editing.widthCm || ""}
                            onChange={(e) =>
                              put(
                                "widthCm",
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                        </label>
                        <label>
                          Hauteur réelle (cm)
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            max={100000}
                            value={editing.heightCm || ""}
                            onChange={(e) =>
                              put(
                                "heightCm",
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                        </label>
                      </div>
                      <small>
                        En centimètres. Modifier ces dimensions définit un
                        nouveau 100 % et remet le tableau à cette taille, dans
                        la place disponible. Vous pouvez ensuite le
                        redimensionner dans « Collection & accrochage ». Laissez
                        vides les informations inconnues.
                      </small>
                    </section>
                    <details
                      className="admin-card admin-section"
                      data-section="sale"
                    >
                      <summary>
                        <span>Vente & prix</span>
                        <small>
                          {availability[editing.availability]} ·{" "}
                          {editing.priceVisibility === "public"
                            ? "Prix affiché"
                            : "Prix sur demande"}
                        </small>
                      </summary>
                      <p className="admin-sale-explanation">
                        Le statut de vente et la publication sont indépendants.
                        Une œuvre vendue peut rester exposée et consultable.
                      </p>
                      {editing.availability === "sold" && (
                        <p className="admin-sale-status" role="status">
                          <strong>Vendue</strong> ·{" "}
                          {editing.publication === "published"
                            ? "Elle reste dans la galerie, avec une présentation atténuée et la mention VENDUE."
                            : "Publiez-la si vous souhaitez la conserver dans la galerie, avec la mention VENDUE."}
                        </p>
                      )}
                      <div className="admin-two">
                        <label>
                          Affichage du prix
                          <select
                            value={editing.priceVisibility}
                            onChange={(e) =>
                              put(
                                "priceVisibility",
                                e.target
                                  .value as AdminArtwork["priceVisibility"],
                              )
                            }
                          >
                            <option value="on_request">Prix sur demande</option>
                            <option value="public">Afficher le prix</option>
                          </select>
                        </label>
                        <label>
                          Disponibilité
                          <select
                            value={editing.availability}
                            onChange={(e) =>
                              put(
                                "availability",
                                e.target.value as AdminArtwork["availability"],
                              )
                            }
                          >
                            {Object.entries(availability).map(
                              ([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>
                      <div className="admin-two">
                        <label>
                          Prix{" "}
                          {editing.priceVisibility === "on_request" && (
                            <small>interne, jamais public</small>
                          )}
                          <PriceInput
                            key={editing.id}
                            artwork={editing}
                            onChange={(value) => put("priceMinor", value)}
                          />
                        </label>
                        <label>
                          Devise
                          <select
                            value={editing.currency}
                            onChange={(e) =>
                              put(
                                "currency",
                                e.target.value as AdminArtwork["currency"],
                              )
                            }
                          >
                            <option>EUR</option>
                            <option>CHF</option>
                            <option>USD</option>
                          </select>
                        </label>
                      </div>
                    </details>
                    <details
                      className="admin-card admin-section"
                      data-section="placement"
                    >
                      <summary>
                        <span>Collection & accrochage</span>
                        <small>
                          {editing.collection || "Sans collection"} · Salle{" "}
                          {editing.roomId.replace("room-", "")} ·{" "}
                          {placementReference(editing)}
                        </small>
                      </summary>
                      <label>
                        Collection
                        <select
                          value={editing.collection}
                          onChange={(e) => {
                            setEditing(
                              moveToCollection(
                                editing,
                                e.target.value,
                                data.artworks,
                                data.settings.collectionRooms,
                              ),
                            );
                            setError("");
                            setMessage("");
                          }}
                        >
                          {!groups.some(
                            (g) => g.name === editing.collection,
                          ) && (
                            <option value={editing.collection}>
                              {editing.collection || "Sans collection"}
                            </option>
                          )}
                          {groups.map((g) => (
                            <option key={g.name} value={g.name}>
                              {g.name || "Sans collection"} · Salle{" "}
                              {g.roomId.replace("room-", "")}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="admin-text-button"
                        onClick={() => {
                          setError("");
                          setCreatingCollection(true);
                        }}
                      >
                        + Créer une collection
                      </button>
                      <p className="admin-help">
                        Changer de collection déplace le tableau dans sa salle.
                        Une place libre adaptée est proposée automatiquement,
                        puis vous pouvez l’ajuster.
                      </p>
                      <label>
                        Position dans la collection
                        <select
                          value={editing.order}
                          onChange={(e) => put("order", Number(e.target.value))}
                        >
                          {Array.from(
                            {
                              length:
                                data.artworks.filter(
                                  (a) =>
                                    a.id !== editing.id &&
                                    collectionKey(a.collection) ===
                                      collectionKey(editing.collection),
                                ).length + 1,
                            },
                            (_, i) => (
                              <option key={i} value={i}>
                                {i + 1}
                                {i === 0 ? " · Première œuvre" : ""}
                              </option>
                            ),
                          )}
                        </select>
                        <small>
                          L’ordre recommence à 1 dans chaque collection. Les
                          autres œuvres se décalent automatiquement dans la
                          liste. Cela ne change pas leur place sur le mur.
                        </small>
                      </label>
                      <h3>Emplacement sur le mur</h3>
                      <PlacementEditor
                        key={editing.id}
                        artwork={editing}
                        artworks={data.artworks}
                        rooms={data.rooms}
                        collectionRooms={data.settings.collectionRooms}
                        onChange={(value) => {
                          if (!operation.current) {
                            setEditing(value);
                            setMessage("");
                            setError("");
                          }
                        }}
                      />
                      <div className="admin-two">
                        <label>
                          Cadre
                          <select
                            value={editing.frameStyle}
                            onChange={(e) =>
                              put(
                                "frameStyle",
                                e.target.value as AdminArtwork["frameStyle"],
                              )
                            }
                          >
                            <option value="brass">Laiton fin</option>
                            <option value="oak">Chêne clair</option>
                            <option value="white">Blanc mat</option>
                          </select>
                        </label>
                      </div>
                    </details>
                    <section className="admin-card admin-publication">
                      <label>
                        Publication
                        <select
                          value={editing.publication}
                          onChange={(e) =>
                            put(
                              "publication",
                              e.target.value as AdminArtwork["publication"],
                            )
                          }
                        >
                          <option value="draft">
                            Brouillon · visible par vous seulement
                          </option>
                          <option value="published">
                            Publiée · visible dans la galerie
                          </option>
                          <option value="archived">
                            Archivée · retirée de la galerie
                          </option>
                        </select>
                      </label>
                      <p className="admin-help">
                        Le choix prend effet lorsque vous enregistrez. Une œuvre
                        vendue peut rester publiée.
                      </p>
                      {roomCapacity(editing.roomId).free === 0 &&
                        baseline?.publication !== "published" && (
                          <div className="admin-placement-warning">
                            <strong>Cette salle est complète.</strong>
                            <p>
                              Enregistrez votre brouillon, libérez une place en
                              retirant une œuvre exposée, ou choisissez une
                              collection dans une autre salle.
                            </p>
                            <button
                              type="button"
                              className="admin-text-button"
                              onClick={() => {
                                setError("");
                                setCreatingCollection(true);
                              }}
                            >
                              Créer une collection dans une autre salle
                            </button>
                          </div>
                        )}
                    </section>
                  </div>
                </div>
                <footer className="admin-savebar">
                  {(error || message) && (
                    <div
                      className={`admin-save-feedback ${error ? "is-error" : "is-success"}`}
                      role={error ? "alert" : "status"}
                    >
                      {error || message}
                      {error.includes("session a expiré") && (
                        <a
                          className="admin-text-button"
                          href="/admin"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Se reconnecter dans un autre onglet
                        </a>
                      )}
                      {error.includes("modifiée") && (
                        <button
                          type="button"
                          className="admin-text-button"
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Recharger remplacera vos saisies par la dernière version enregistrée. Continuer ?",
                              )
                            )
                              return;
                            void perform(async () => {
                              const fresh = await api<Data>(
                                "/api/admin/artworks",
                                undefined,
                                "GET",
                              );
                              setData(fresh);
                              const latest = fresh.artworks.find(
                                (a) => a.id === editing.id,
                              );
                              if (latest) openArtwork(latest);
                              setMessage(
                                "Version enregistrée rechargée. Vous pouvez reprendre votre modification.",
                              );
                            });
                          }}
                        >
                          Recharger la version enregistrée
                        </button>
                      )}
                    </div>
                  )}
                  <span className="admin-dirty-state" role="status">
                    {imageChecking
                      ? "Vérification de l’image…"
                      : busy
                        ? progress
                        : dirty
                          ? "Modifications non enregistrées"
                          : editing.revision
                            ? "Tout est enregistré"
                            : "Nouvelle œuvre · brouillon"}
                  </span>
                  <button
                    className="admin-primary"
                    disabled={busy || imageChecking}
                  >
                    <Save size={17} />
                    {busy ? "Enregistrement…" : "Enregistrer les modifications"}
                  </button>
                </footer>
              </fieldset>
            </form>
          </>
        ) : (
          <>
            <header className="admin-heading">
              <div>
                <p className="admin-overline">VOTRE COLLECTION</p>
                <h1>
                  Les œuvres
                  <span className="admin-count">{data.artworks.length}</span>
                </h1>
                <p>Chaque tableau a sa place. Faites vivre votre galerie.</p>
              </div>
              <div className="admin-heading-actions">
                <button
                  className="admin-secondary"
                  onClick={() => {
                    setError("");
                    setCreatingCollection(true);
                  }}
                >
                  <Plus size={17} /> Nouvelle collection
                </button>
                <button className="admin-primary" onClick={() => newArtwork()}>
                  <Plus size={17} />
                  Ajouter une œuvre
                </button>
              </div>
            </header>
            <div className="admin-capacity" aria-label="Capacité des salles">
              {data.rooms.map((room) => {
                const capacity = roomCapacity(room);
                return (
                  <div className="admin-room-entry" key={room}>
                    <strong>Salle {room.replace("room-", "")}</strong> ·{" "}
                    {capacity.total} zones · plusieurs tableaux par zone
                    {(demo || singleAdmin) && (
                      <button
                        type="button"
                        className="admin-secondary"
                        onClick={() => {
                          setError("");
                          setMessage("");
                          setRoomEditing(room);
                          window.scrollTo({ top: 0 });
                        }}
                      >
                        {data.roomLayoutDrafts?.[room]
                          ? "Reprendre le brouillon"
                          : "Réorganiser la salle"}{" "}
                        {room.replace("room-", "")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="admin-list-tools">
              <div className="admin-filters">
                {[
                  ["all", "Toutes"],
                  ["published", "Publiées"],
                  ["draft", "Brouillons"],
                  ["archived", "Archivées"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={filter === key ? "selected" : ""}
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {label}{" "}
                    <span className="admin-filter-count">
                      {key === "all"
                        ? data.artworks.length
                        : data.artworks.filter((a) => a.publication === key)
                            .length}
                    </span>
                  </button>
                ))}
              </div>
              <input
                aria-label="Rechercher une œuvre"
                placeholder="Rechercher une œuvre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {groups.map((group) => {
              const visible = group.artworks.filter(
                (a) =>
                  (filter === "all" || a.publication === filter) &&
                  `${a.title} ${a.collection}`
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLocaleLowerCase("fr")
                    .includes(
                      search
                        .trim()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .toLocaleLowerCase("fr"),
                    ),
              );
              if (
                !visible.length &&
                (group.artworks.length > 0 || filter !== "all" || search.trim())
              )
                return null;
              return (
                <section
                  className="admin-collection-group"
                  key={group.name}
                  data-collection={group.name}
                >
                  <header>
                    <div>
                      <p className="admin-overline">
                        SALLE {group.roomId.replace("room-", "")}
                      </p>
                      <h2>{group.name || "Sans collection"}</h2>
                    </div>
                    <div className="admin-group-actions">
                      <span>
                        {group.artworks.length
                          ? `${group.artworks.length} œuvres · ordre 1 à ${group.artworks.length}`
                          : "Aucune œuvre pour le moment"}
                      </span>
                      {group.artworks.length > 0 && (
                        <button
                          className="admin-secondary"
                          onClick={() => newArtwork(group.name, group.roomId)}
                        >
                          <Plus size={16} />
                          Ajouter une œuvre à {group.name || "cette collection"}
                        </button>
                      )}
                    </div>
                  </header>
                  {!group.artworks.length && (
                    <div className="admin-empty-collection">
                      <p>
                        La collection est prête. Ajoutez une œuvre ou
                        attribuez-lui un tableau existant.
                      </p>
                      <button
                        className="admin-secondary"
                        onClick={() => newArtwork(group.name, group.roomId)}
                      >
                        Ajouter la première œuvre
                      </button>
                    </div>
                  )}
                  <div className="admin-artwork-grid">
                    {visible.map((a) => (
                      <button
                        className="admin-artwork-card"
                        key={a.id}
                        onClick={() => openArtwork(a)}
                      >
                        <div
                          className={`admin-artwork-image ${a.availability === "sold" ? "is-sold" : ""}`}
                        >
                          {a.image ? (
                            <img src={a.thumbnail} alt="" loading="lazy" />
                          ) : (
                            <ImagePlus size={35} />
                          )}
                          <span className={`admin-badge ${a.publication}`}>
                            {publications[a.publication]}
                          </span>
                        </div>
                        <div className="admin-artwork-caption">
                          <h3>
                            <span className="admin-order-number">
                              {a.order + 1}
                            </span>
                            <span className="admin-artwork-title">
                              {a.title}
                            </span>
                          </h3>
                          <p>
                            {a.priceVisibility === "public" &&
                            a.priceMinor !== null
                              ? new Intl.NumberFormat("fr-FR", {
                                  style: "currency",
                                  currency: a.currency,
                                }).format(a.priceMinor / 100)
                              : "Prix sur demande"}
                            <span>{availability[a.availability]}</span>
                          </p>
                          <span className="admin-artwork-location">
                            {placementReference(a)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {data.artworks.length > 0 &&
              !data.artworks.some(
                (a) =>
                  (filter === "all" || a.publication === filter) &&
                  `${a.title} ${a.collection}`
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLocaleLowerCase("fr")
                    .includes(
                      search
                        .trim()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .toLocaleLowerCase("fr"),
                    ),
              ) && (
                <section className="admin-empty" role="status">
                  <h2>Aucune œuvre ne correspond</h2>
                  <p>Essayez un autre titre ou une autre collection.</p>
                  <button
                    className="admin-secondary"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                  >
                    Réinitialiser les filtres
                  </button>
                </section>
              )}
            {data.artworks.length === 0 && (
              <section className="admin-empty">
                <Paintbrush size={40} />
                <h2>Votre galerie commence ici.</h2>
                <p>
                  Ajoutez une première œuvre et prenez le temps de préparer sa
                  fiche.
                </p>
                <button className="admin-primary" onClick={() => newArtwork()}>
                  Ajouter une œuvre
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
function SettingsEditor({
  settings,
  busy,
  onSave,
  error,
  message,
  dirty,
  onDirty,
  validateForm,
}: {
  settings: SiteSettings;
  busy: boolean;
  error: string;
  message: string;
  dirty: boolean;
  onDirty: () => void;
  validateForm: (form: HTMLFormElement) => boolean;
  onSave: (s: SiteSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const limits: Record<string, number> = {
    artistName: 100,
    tagline: 200,
    heroTitle: 200,
    aboutTitle: 100,
    aboutText: 10000,
    contactTitle: 100,
    contactText: 3000,
    coursesText: 6000,
  };
  const field = (
    key: Exclude<
      keyof SiteSettings,
      "collectionDescriptions" | "collectionRooms"
    >,
    label: string,
    multiline = false,
  ) => (
    <label>
      {label}
      {multiline ? (
        <textarea
          rows={key === "aboutText" ? 8 : 3}
          maxLength={limits[key]}
          value={draft[key] ?? ""}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      ) : (
        <input
          type={
            key === "email" ? "email" : key === "instagramUrl" ? "url" : "text"
          }
          maxLength={limits[key]}
          placeholder={
            key === "instagramUrl"
              ? "https://www.instagram.com/votre-compte/"
              : undefined
          }
          value={draft[key] ?? ""}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      )}
    </label>
  );
  return (
    <>
      <header className="admin-heading">
        <div>
          <p className="admin-overline">VOTRE UNIVERS</p>
          <h1>Textes & contact</h1>
          <p>Votre présentation, vos collections et vos coordonnées.</p>
        </div>
      </header>
      <form
        className="admin-settings"
        noValidate
        onInput={onDirty}
        onChange={onDirty}
        onSubmit={(e) => {
          e.preventDefault();
          if (validateForm(e.currentTarget)) onSave(draft);
        }}
      >
        <fieldset
          className="admin-editor-controls admin-settings-fields"
          disabled={busy}
        >
          <section className="admin-card">
            <h2>Accueil</h2>
            {field("artistName", "Nom de l’artiste")}
            {field("tagline", "Accroche courte")}
            {field("heroTitle", "Titre d’accueil", true)}
          </section>
          <section className="admin-card">
            <h2>À propos</h2>
            {field("aboutTitle", "Titre de la présentation")}
            {field("aboutText", "Présentation", true)}
            {field("coursesText", "Cours d’arts visuels", true)}
          </section>
          <section className="admin-card">
            <h2>Contact</h2>
            {field("contactTitle", "Titre du contact")}
            {field("contactText", "Message d’accueil", true)}
            {field("email", "Adresse email publique")}
            {field("instagramUrl", "Lien Instagram")}
            <small>
              Laissez l’email vide tant que l’adresse n’est pas confirmée. Le
              contact ouvre l’application de messagerie du visiteur.
            </small>
            <label>
              Devise par défaut
              <select
                value={draft.currency}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    currency: e.target.value as SiteSettings["currency"],
                  })
                }
              >
                <option>EUR</option>
                <option>CHF</option>
                <option>USD</option>
              </select>
            </label>
          </section>
          <section className="admin-card">
            <h2>Les collections</h2>
            {Object.entries(draft.collectionDescriptions ?? {}).map(
              ([name, text]) => (
                <label key={name}>
                  {name}
                  <textarea
                    rows={5}
                    maxLength={6000}
                    value={text}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        collectionDescriptions: {
                          ...draft.collectionDescriptions,
                          [name]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ),
            )}
          </section>
          <footer className="admin-savebar">
            {(error || message) && (
              <div
                className={`admin-save-feedback ${error ? "is-error" : "is-success"}`}
                role={error ? "alert" : "status"}
              >
                {error || message}
                {error.includes("session a expiré") && (
                  <a href="/admin" target="_blank" rel="noopener noreferrer">
                    Se reconnecter dans un autre onglet
                  </a>
                )}
              </div>
            )}
            <span className="admin-dirty-state" role="status">
              {dirty ? "Modifications non enregistrées" : "Tout est enregistré"}
            </span>
            <button className="admin-primary" disabled={busy}>
              <Save size={17} />
              {busy ? "Enregistrement…" : "Enregistrer les textes"}
            </button>
          </footer>
        </fieldset>
      </form>
    </>
  );
}

function CollectionCreator({
  rooms,
  collections,
  capacity,
  onAddRoom,
  initialRoom,
  busy,
  error,
  onClose,
  onCreate,
}: {
  rooms: string[];
  collections: { name: string; roomId: string }[];
  capacity: (room: string) => { total: number; free: number };
  onAddRoom: () => Promise<void>;
  initialRoom: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onCreate: (name: string, roomId: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [room, setRoom] = useState(initialRoom);
  const previousCount = useRef(rooms.length);
  useEffect(() => {
    if (rooms.length > previousCount.current) setRoom(rooms[rooms.length - 1]);
    previousCount.current = rooms.length;
  }, [rooms]);
  useEffect(() => {
    const modal = dialog.current;
    const trigger = document.activeElement as HTMLElement | null;
    modal?.showModal();
    return () => {
      modal?.close();
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="admin-collection-dialog"
      aria-labelledby="collection-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          void onCreate(
            String(values.get("name")),
            String(values.get("roomId")),
          );
        }}
      >
        <header>
          <h2 id="collection-dialog-title">Nouvelle collection</h2>
          <button
            type="button"
            aria-label="Fermer la création de collection"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </header>
        <p>
          Une collection regroupe vos tableaux. Choisissez la salle qui les
          accueillera : plusieurs collections peuvent partager une salle.
        </p>
        <label>
          Nom de la collection
          <input
            name="name"
            disabled={busy}
            required
            maxLength={200}
            autoFocus
            placeholder="Ex. Lumières d’été"
          />
        </label>
        <RoomOverview
          rooms={rooms}
          collections={collections}
          capacity={capacity}
          selected={room}
          onSelect={setRoom}
          disabled={busy}
        />
        <p className="admin-help">
          Chaque zone peut recevoir plusieurs tableaux. L’ajout dépend de
          l’espace libre et de leur taille.
        </p>
        {rooms.length < 4 ? (
          <button
            type="button"
            className="admin-secondary"
            disabled={busy}
            onClick={() => void onAddRoom()}
          >
            <Plus size={16} />
            Activer une nouvelle salle
          </button>
        ) : (
          <p className="admin-help">
            Les quatre salles sont actives. Pour libérer une place, passez une
            œuvre exposée en brouillon ou archivez-la.
          </p>
        )}
        {rooms.length < 4 && (
          <p className="admin-help">
            L’activation ajoute une salle à la galerie. Jusqu’à quatre salles
            sont disponibles.
          </p>
        )}
        <p className="admin-help">
          Vous pourrez ensuite y ajouter des œuvres. Les emplacements occupés
          restent protégés.
        </p>
        {error && (
          <p className="admin-placement-warning" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button
            type="button"
            className="admin-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Annuler
          </button>
          <button className="admin-primary" disabled={busy}>
            {busy ? "Création…" : "Créer la collection"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
