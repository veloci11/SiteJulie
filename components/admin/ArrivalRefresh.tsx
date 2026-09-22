"use client";
import { useEffect, useRef, useState } from "react";
import { CATALOGUE_CHANGED } from "@/lib/museum/catalogueEvents";
type Capture = { fingerprint: string; room: string; view: "wide" | "portrait" };
export default function ArrivalRefresh() {
  const [revision, setRevision] = useState(0);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const changed = () => setRevision((n) => n + 1);
    window.addEventListener(CATALOGUE_CHANGED, changed);
    return () => window.removeEventListener(CATALOGUE_CHANGED, changed);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(async () => {
      try {
        setFailed(false);
        const response = await fetch("/api/museum/arrival/status", {
          cache: "no-store",
          signal,
        });
        if (!response.ok) throw new Error();
        const snapshot = await response.json();
        if (snapshot.ready) {
          setStatus("Image d’accueil à jour");
          return;
        }
        if (snapshot.captureMethod === "server") {
          setStatus("Actualisation de l’image d’accueil…");
          retry = setTimeout(() => setRevision((n) => n + 1), 4000);
          return;
        }
        const catalogueResponse = await fetch("/api/museum/data", {
          cache: "no-store",
          signal,
        });
        if (!catalogueResponse.ok) throw new Error();
        const catalogue = await catalogueResponse.json();
        setStatus(
          "Actualisation de l’image d’accueil… Gardez l’atelier ouvert quelques instants.",
        );
        for (const room of catalogue.rooms as string[])
          for (const view of ["wide", "portrait"] as const) {
            const job = { fingerprint: snapshot.fingerprint, room, view };
            const blob = await new Promise<Blob>((resolve, reject) => {
              const cleanup = () => {
                clearTimeout(timeout);
                window.removeEventListener("message", received);
                signal.removeEventListener("abort", aborted);
              };
              const aborted = () => {
                cleanup();
                reject(new Error("cancelled"));
              };
              const timeout = setTimeout(() => {
                cleanup();
                reject(new Error("timeout"));
              }, 60000);
              const received = (event: MessageEvent) => {
                if (
                  event.origin !== location.origin ||
                  event.source !== frame.current?.contentWindow ||
                  event.data?.type !== "museum-arrival-capture"
                )
                  return;
                cleanup();
                if (
                  event.data.fingerprint !== job.fingerprint ||
                  event.data.error ||
                  event.data.room !== room ||
                  event.data.view !== view ||
                  !(event.data.blob instanceof Blob)
                )
                  reject(
                    new Error(
                      event.data.fingerprint !== job.fingerprint
                        ? "stale"
                        : "capture",
                    ),
                  );
                else resolve(event.data.blob);
              };
              window.addEventListener("message", received);
              signal.addEventListener("abort", aborted, { once: true });
              if (signal.aborted) aborted();
              else setCapture(job);
            });
            setCapture(null);
            const params = new URLSearchParams(job);
            const upload = await fetch(`/api/admin/arrival?${params}`, {
              method: "POST",
              body: blob,
              signal,
              headers: { "Content-Type": "image/webp" },
            });
            if (!upload.ok)
              throw new Error(upload.status === 409 ? "stale" : "upload");
          }
        const commit = await fetch(
          `/api/admin/arrival?fingerprint=${snapshot.fingerprint}&commit=1`,
          { method: "POST", signal },
        );
        if (!commit.ok)
          throw new Error(commit.status === 409 ? "stale" : "commit");
        setStatus("Image d’accueil à jour");
        const channel = new BroadcastChannel(CATALOGUE_CHANGED);
        channel.postMessage("refresh");
        channel.close();
      } catch (error) {
        if (
          !signal.aborted &&
          error instanceof Error &&
          error.message === "stale"
        ) {
          retry = setTimeout(() => setRevision((n) => n + 1), 1500);
        } else if (!signal.aborted) {
          setStatus(
            "Vos modifications sont enregistrées. L’image d’accueil reste à actualiser.",
          );
          setFailed(true);
        }
      } finally {
        if (!signal.aborted) setCapture(null);
      }
    }, 800);
    return () => {
      clearTimeout(timer);
      clearTimeout(retry);
      controller.abort();
    };
  }, [revision]);
  return (
    <>
      {status && (
        <div className="admin-arrival-status" role="status">
          {status}
          {failed && (
            <button type="button" onClick={() => setRevision((n) => n + 1)}>
              Réessayer
            </button>
          )}
        </div>
      )}
      {capture && (
        <iframe
          ref={frame}
          key={`${capture.fingerprint}-${capture.room}-${capture.view}`}
          title="Actualisation de l’image d’accueil"
          aria-hidden="true"
          tabIndex={-1}
          src={`/admin/arrival-capture?room=${capture.room}&view=${capture.view}`}
          style={{
            position: "fixed",
            left: -10000,
            top: 0,
            width: capture.view === "wide" ? 1600 : 430,
            height: capture.view === "wide" ? 1000 : 932,
            border: 0,
            pointerEvents: "none",
          }}
        />
      )}
    </>
  );
}
