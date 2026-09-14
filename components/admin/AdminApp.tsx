"use client";
import { useState } from "react";
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
import { notifyCatalogueChanged } from "@/lib/museum/catalogueEvents";
import "./admin.css";
type Data = {
  artworks: AdminArtwork[];
  settings: SiteSettings;
  rooms: string[];
};
async function api<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Opération impossible.");
  if (
    method !== "GET" &&
    [
      "/api/admin/artworks",
      "/api/admin/process",
      "/api/admin/settings",
    ].includes(url)
  )
    notifyCatalogueChanged();
  return data;
}
const availability = {
  available: "Disponible",
  reserved: "Réservée",
  sold: "Vendue",
};
const publications = {
  draft: "Brouillon",
  published: "Publiée",
  archived: "Archivée",
};
export default function AdminApp({
  initialData,
  demo,
}: {
  initialData: Data | null;
  demo: boolean;
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
  const [tab, setTab] = useState<"artworks" | "settings">("artworks");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setData(await api<Data>("/api/admin/artworks", undefined, "GET"));
  }
  const groups = data ? groupCollections(data.artworks, data.rooms) : [];
  function newArtwork() {
    const id = crypto.randomUUID();
    setEditing({
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
      roomId: groups[0]?.roomId ?? "room-1",
      slotId: "",
      frameStyle: "brass",
      placementOffsetX: 0,
      placementOffsetY: 0,
      displayScale: 1,
      order: groups[0]?.artworks.length ?? 0,
      collection: groups[0]?.name ?? "",
      revision: 0,
    });
    setError("");
    setMessage("");
  }
  function put<K extends keyof AdminArtwork>(key: K, value: AdminArtwork[K]) {
    setEditing((a) => (a ? { ...a, [key]: value } : null));
  }
  async function save(a: AdminArtwork) {
    const saved = await api<AdminArtwork>("/api/admin/artworks", a);
    setEditing(saved);
    await refresh();
    setMessage(
      saved.publication === "published"
        ? `Enregistré · ${saved.collection || "Sans collection"} · position ${saved.order + 1}. L’œuvre reste visible dans la galerie.`
        : "Modifications enregistrées.",
    );
    return saved;
  }
  async function upload(file: File) {
    if (!editing) return;
    if (file.size > 20 * 1024 * 1024)
      throw new Error("L’image dépasse 20 Mio.");
    let current = editing;
    if (!current.title.trim())
      throw new Error("Renseignez le titre avant d’ajouter une image.");
    current = await save(current);
    const token = await api<{ id: string; url: string; demo: boolean }>(
      "/api/admin/upload",
      { artworkId: current.id },
    );
    const res = await fetch(token.url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok)
      throw new Error("Téléversement interrompu. Vous pouvez réessayer.");
    const saved = await api<AdminArtwork>("/api/admin/process", {
      id: token.id,
    });
    setEditing(saved);
    await refresh();
    setMessage("Image traitée : miniature, vue de salle et détail prêts.");
  }
  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="admin-brand">
          <span>G</span> L’atelier
        </Link>
        <p className="admin-overline">ESPACE ARTISTE</p>
        {data && (
          <nav>
            <button
              className={tab === "artworks" ? "active" : ""}
              onClick={() => {
                setTab("artworks");
                setEditing(null);
              }}
            >
              <Paintbrush size={18} />
              Les œuvres
            </button>
            <button
              className={tab === "settings" ? "active" : ""}
              onClick={() => {
                setTab("settings");
                setEditing(null);
              }}
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
              onClick={() =>
                perform(async () => {
                  await api("/api/admin/logout");
                  setData(null);
                  setEditing(null);
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
        {demo && (
          <div className="admin-demo">
            Démonstration locale · Les modifications sont conservées sur cet
            ordinateur. Aucune publication sur Internet.
          </div>
        )}
        <div className="admin-notices" aria-live="polite">
          {error && !editing && (
            <div className="admin-error" role="alert">
              {error}
            </div>
          )}
          {message && !editing && (
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
                          email: values.get("email"),
                          password: values.get("password"),
                        },
                  );
                  await refresh();
                });
              }}
            >
              {!demo && (
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
                  <label>
                    Mot de passe
                    <input
                      type="password"
                      name="password"
                      required
                      autoComplete="current-password"
                    />
                  </label>
                </>
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
                Accès de test réservé à localhost. Une authentification Supabase
                sera requise pour la mise en ligne.
              </small>
            )}
          </section>
        ) : tab === "settings" ? (
          <SettingsEditor
            settings={data.settings}
            busy={busy}
            onSave={(settings) =>
              perform(async () => {
                await api("/api/admin/settings", settings);
                await refresh();
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
                  onClick={() => {
                    setEditing(null);
                    setMessage("");
                    setError("");
                  }}
                >
                  <ArrowLeft size={16} />
                  Toutes les œuvres
                </button>
                <h1>
                  {editing.revision ? "Modifier l’œuvre" : "Une nouvelle œuvre"}
                </h1>
              </div>
              <span className={`admin-badge ${editing.publication}`}>
                {publications[editing.publication]}
              </span>
            </header>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const invalid = e.currentTarget.querySelector<HTMLInputElement>(
                  "input:invalid, select:invalid, textarea:invalid",
                );
                if (invalid) {
                  const label =
                    invalid.labels?.[0]?.textContent?.trim() || "Champ";
                  setMessage("");
                  setError(`${label} : ${invalid.validationMessage}`);
                  invalid.focus();
                  return;
                }
                perform(() => save(editing).then(() => {}));
              }}
            >
              <div className="admin-editor">
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
                    <label>
                      Identifiant du lien
                      <input
                        required
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        value={editing.slug}
                        onChange={(e) => put("slug", e.target.value)}
                      />
                      <small>Lettres minuscules, chiffres et tirets.</small>
                    </label>
                    <label>
                      Description
                      <textarea
                        rows={4}
                        value={editing.description}
                        onChange={(e) => put("description", e.target.value)}
                      />
                    </label>
                    <div className="admin-two">
                      <label>
                        Technique <small>facultatif</small>
                        <input
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
                        Largeur (cm)
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
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
                        Hauteur (cm)
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
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
                      Laissez vides les informations inconnues. L’échelle
                      d’exposition sera illustrative.
                    </small>
                  </section>
                  <section className="admin-card">
                    <h2>Vente & prix</h2>
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
                              e.target.value as AdminArtwork["priceVisibility"],
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
                          {Object.entries(availability).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="admin-two">
                      <label>
                        Prix{" "}
                        {editing.priceVisibility === "on_request" && (
                          <small>interne, jamais public</small>
                        )}
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          required={editing.priceVisibility === "public"}
                          value={
                            editing.priceMinor === null
                              ? ""
                              : editing.priceMinor / 100
                          }
                          onChange={(e) =>
                            put(
                              "priceMinor",
                              e.target.value
                                ? Math.round(Number(e.target.value) * 100)
                                : null,
                            )
                          }
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
                  </section>
                  <section className="admin-card">
                    <h2>Collection & accrochage</h2>
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
                            ),
                          );
                          setError("");
                          setMessage("");
                        }}
                      >
                        {!groups.some((g) => g.name === editing.collection) && (
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
                    <p className="admin-help">
                      Changer de collection déplace le tableau dans sa salle.
                      Une place libre adaptée est proposée automatiquement, puis
                      vous pouvez l’ajuster.
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
                        autres œuvres se décalent automatiquement.
                      </small>
                    </label>
                    <h3>Emplacement sur le mur</h3>
                    <PlacementEditor
                      key={editing.id}
                      artwork={editing}
                      artworks={data.artworks}
                      rooms={data.rooms}
                      onChange={setEditing}
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
                  </section>
                </div>
                <aside className="admin-preview">
                  <section className="admin-card">
                    <h2>Image principale</h2>
                    <div className="admin-image-preview">
                      {editing.image ? (
                        <img
                          src={editing.detailImage || editing.image}
                          alt={editing.alt || "Aperçu du tableau"}
                        />
                      ) : (
                        <div>
                          <ImagePlus size={40} />
                          <p>Votre tableau prendra place ici</p>
                        </div>
                      )}
                    </div>
                    <label className="admin-upload">
                      <ImagePlus size={18} />
                      {editing.image
                        ? "Remplacer l’image"
                        : "Choisir une image"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) perform(() => upload(file));
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <small>
                      JPEG, PNG, WebP, AVIF · 20 Mio maximum.
                      <br />
                      L’original reste privé, les proportions sont conservées.
                    </small>
                    <label>
                      Texte alternatif
                      <input
                        value={editing.alt}
                        onChange={(e) => put("alt", e.target.value)}
                        placeholder="Décrivez brièvement ce que l’on voit"
                        required={editing.publication === "published"}
                      />
                    </label>
                  </section>
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
              </div>
              <footer className="admin-savebar">
                {(error || message) && (
                  <div
                    className={`admin-save-feedback ${error ? "is-error" : "is-success"}`}
                    role={error ? "alert" : "status"}
                  >
                    {error || message}
                    {error.includes("modifiée") && (
                      <button
                        type="button"
                        className="admin-text-button"
                        onClick={() =>
                          perform(async () => {
                            const fresh = await api<Data>(
                              "/api/admin/artworks",
                              undefined,
                              "GET",
                            );
                            setData(fresh);
                            setEditing(
                              fresh.artworks.find((a) => a.id === editing.id) ??
                                null,
                            );
                            setMessage(
                              "Version enregistrée rechargée. Vous pouvez reprendre votre modification.",
                            );
                          })
                        }
                      >
                        Recharger la version enregistrée
                      </button>
                    )}
                  </div>
                )}
                <div>
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
                </div>
                <button className="admin-primary" disabled={busy}>
                  <Save size={17} />
                  {busy ? "Enregistrement…" : "Enregistrer les modifications"}
                </button>
              </footer>
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
              <button className="admin-primary" onClick={newArtwork}>
                <Plus size={17} />
                Ajouter une œuvre
              </button>
            </header>
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
                    onClick={() => setFilter(key)}
                  >
                    {label}
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
                  a.title
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()),
              );
              if (!visible.length) return null;
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
                    <span>
                      {group.artworks.length} œuvres · ordre 1 à{" "}
                      {group.artworks.length}
                    </span>
                  </header>
                  <div className="admin-artwork-grid">
                    {visible.map((a) => (
                      <button
                        className="admin-artwork-card"
                        key={a.id}
                        onClick={() => {
                          setEditing(a);
                          setError("");
                          setMessage("");
                        }}
                      >
                        <div
                          className={`admin-artwork-image ${a.availability === "sold" ? "is-sold" : ""}`}
                        >
                          {a.image ? (
                            <img src={a.thumbnail} alt={a.alt} />
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
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {data.artworks.length === 0 && (
              <section className="admin-empty">
                <Paintbrush size={40} />
                <h2>Votre galerie commence ici.</h2>
                <p>
                  Ajoutez une première œuvre et prenez le temps de préparer sa
                  fiche.
                </p>
                <button className="admin-primary" onClick={newArtwork}>
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
}: {
  settings: SiteSettings;
  busy: boolean;
  onSave: (s: SiteSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const field = (key: keyof SiteSettings, label: string, multiline = false) => (
    <label>
      {label}
      {multiline ? (
        <textarea
          rows={key === "aboutText" ? 8 : 3}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      ) : (
        <input
          type={key === "email" ? "email" : "text"}
          value={draft[key]}
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
          <p>Votre voix, sur les murs de la galerie.</p>
        </div>
      </header>
      <form
        className="admin-settings"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
      >
        <section className="admin-card">
          <h2>Accueil</h2>
          {field("artistName", "Nom de l’artiste")}
          {field("tagline", "Accroche courte")}
          {field("heroTitle", "Titre d’accueil")}
        </section>
        <section className="admin-card">
          <h2>À propos</h2>
          {field("aboutTitle", "Titre du mur")}
          {field("aboutText", "Présentation", true)}
        </section>
        <section className="admin-card">
          <h2>Contact</h2>
          {field("contactTitle", "Titre du mur")}
          {field("contactText", "Message d’accueil", true)}
          {field("email", "Adresse email publique")}
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
        <button className="admin-primary" disabled={busy}>
          <Save size={17} />
          {busy ? "Enregistrement…" : "Enregistrer les textes"}
        </button>
      </form>
    </>
  );
}
