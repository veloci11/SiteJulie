"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicData } from "@/lib/data/types";

/** One temporary scene at a time for an uncached public hanging.
 * No public upload, admin session or persistent storage write. */
export function useLiveRoomPreviews(
  data: PublicData,
  fingerprint: string,
  ready: boolean,
  enabled: boolean,
) {
  const frame = useRef<HTMLIFrameElement>(null);
  const urls = useRef<Record<string, string>>({});
  const [snapshot, setSnapshot] = useState<{
    fingerprint: string;
    images: Record<string, string>;
  }>({ fingerprint: "", images: {} });
  const images = snapshot.fingerprint === fingerprint ? snapshot.images : {};
  const [failed, setFailed] = useState<string[]>([]);
  useEffect(() => {
    setSnapshot({ fingerprint, images: {} });
    setFailed([]);
    return () => {
      Object.values(urls.current).forEach(URL.revokeObjectURL);
      urls.current = {};
    };
  }, [fingerprint]);
  useEffect(() => {
    if (enabled) setFailed([]);
  }, [enabled]);
  const room =
    enabled && !ready && /^[a-f0-9]{64}$/.test(fingerprint)
      ? data.rooms.find((id) => !images[id] && !failed.includes(id))
      : undefined;
  useEffect(() => {
    if (!room) return;
    const fail = () => setFailed((previous) => [...previous, room]);
    const timer = setTimeout(fail, 45000);
    const received = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "museum-arrival-capture"
      )
        return;
      if (
        event.data.fingerprint !== fingerprint ||
        event.data.room !== room ||
        event.data.error ||
        !(event.data.blob instanceof Blob)
      ) {
        fail();
        return;
      }
      clearTimeout(timer);
      const url = URL.createObjectURL(event.data.blob);
      if (urls.current[room]) URL.revokeObjectURL(urls.current[room]);
      urls.current[room] = url;
      setSnapshot((previous) => ({
        fingerprint,
        images: {
          ...(previous.fingerprint === fingerprint ? previous.images : {}),
          [room]: url,
        },
      }));
    };
    window.addEventListener("message", received);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", received);
    };
  }, [room, fingerprint]);
  return {
    images,
    captureFrame: room ? (
      <iframe
        ref={frame}
        key={`${fingerprint}-${room}`}
        title="Préparation de l’aperçu de salle"
        aria-hidden="true"
        tabIndex={-1}
        src={`/visite/apercu?room=${encodeURIComponent(room)}&fingerprint=${fingerprint}`}
        style={{
          position: "fixed",
          left: -10000,
          top: 0,
          width: 1000,
          height: 625,
          border: 0,
          pointerEvents: "none",
        }}
      />
    ) : null,
  };
}
