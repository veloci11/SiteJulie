"use client";
import { useEffect, useState } from "react";
import { RefreshCw, HardDrive, ShieldCheck } from "lucide-react";
import type { StorageUsage } from "@/lib/storage/usage";
function bytes(value: number) {
  if (value >= 1e9)
    return `${(value / 1e9).toLocaleString("fr-CH", { maximumFractionDigits: 2 })} Go`;
  if (value >= 1e6)
    return `${(value / 1e6).toLocaleString("fr-CH", { maximumFractionDigits: 1 })} Mo`;
  return `${(value / 1e3).toLocaleString("fr-CH", { maximumFractionDigits: 1 })} ko`;
}
export default function StoragePanel() {
  const [usage, setUsage] = useState<
    StorageUsage | { available: false } | null
  >(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/storage", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Le stockage n’a pas pu être vérifié.");
      setUsage(data);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Connexion interrompue.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const details = usage?.available ? usage : null;
  const percentage = details?.capacityBytes
    ? Math.min(100, (details.usedBytes / details.capacityBytes) * 100)
    : null;
  return (
    <>
      <header className="admin-heading">
        <div>
          <span className="admin-overline">L’ATELIER</span>
          <h1>Stockage & sauvegardes</h1>
          <p>Les images de la galerie et leurs copies de sécurité.</p>
        </div>
        <button
          className="admin-secondary"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw size={16} /> {loading ? "Vérification…" : "Actualiser"}
        </button>
      </header>
      {error && (
        <p className="admin-feedback error" role="alert">
          {error}
        </p>
      )}
      {loading && !usage && <p role="status">Lecture du stockage privé…</p>}
      {usage && !usage.available && (
        <p>
          Le suivi du stockage Vercel est disponible sur le site de production.
        </p>
      )}
      {details && (
        <div className="admin-storage-grid">
          <section className="admin-storage-card">
            <div className="admin-storage-title">
              <HardDrive size={21} />
              <h2>Stockage Vercel</h2>
            </div>
            <p className="admin-storage-total">
              {bytes(details.usedBytes)}{" "}
              <span>
                {details.capacityBytes
                  ? `/ ${bytes(details.capacityBytes)} utilisés`
                  : "utilisés"}
              </span>
            </p>
            {percentage !== null && (
              <div
                className="admin-storage-meter"
                role="progressbar"
                aria-label="Stockage utilisé"
                aria-valuenow={Math.round(percentage)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={`${bytes(details.usedBytes)} sur ${bytes(details.capacityBytes!)}`}
              >
                <span style={{ width: `${percentage}%` }} />
              </div>
            )}
            {details.remainingBytes !== null && (
              <p>
                {bytes(details.remainingBytes)} disponibles sur le budget de
                stockage du site.
              </p>
            )}
            <dl className="admin-storage-breakdown">
              <div>
                <dt>Images et originaux</dt>
                <dd>{bytes(details.imageBytes)}</dd>
              </div>
              <div>
                <dt>Sauvegardes</dt>
                <dd>{bytes(details.backupBytes)}</dd>
              </div>
              <div>
                <dt>Nombre de fichiers</dt>
                <dd>{details.fileCount}</dd>
              </div>
            </dl>
            <small>
              Mesure des fichiers du stockage privé à cet instant. L’offre Hobby
              inclut 1 Go en moyenne mensuelle ; les autres limites Vercel
              (transfert et opérations) sont distinctes.
            </small>
          </section>
          <section className="admin-storage-card">
            <div className="admin-storage-title">
              <ShieldCheck size={21} />
              <h2>Sauvegarde du catalogue</h2>
            </div>
            <p>
              {details.dailyBackupEnabled
                ? "Sauvegarde automatique chaque jour."
                : "La sauvegarde quotidienne n’est pas encore activée."}
            </p>
            {details.lastBackup ? (
              <>
                <p className="admin-storage-backup-date">
                  Dernière sauvegarde terminée
                  <br />
                  <strong>
                    {new Date(details.lastBackup.createdAt).toLocaleString(
                      "fr-CH",
                      { dateStyle: "long", timeStyle: "short" },
                    )}
                  </strong>
                </p>
                <p>
                  {details.lastBackup.assets} fichiers protégés, avec le
                  catalogue complet.
                </p>
              </>
            ) : (
              <p>Aucune sauvegarde terminée pour le moment.</p>
            )}
            <small>
              Les copies sont privées. Une image inchangée est copiée une seule
              fois. Ces sauvegardes sont dans le même stockage Vercel ; une
              exportation séparée protège aussi contre la perte du compte.
            </small>
          </section>
        </div>
      )}
    </>
  );
}
