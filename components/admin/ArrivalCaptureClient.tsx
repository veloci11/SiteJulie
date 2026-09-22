"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { PublicData } from "@/lib/data/types";
const MuseumCanvas = dynamic(() => import("@/components/museum/MuseumCanvas"), {
  ssr: false,
});
const noop = () => {};
export default function ArrivalCaptureClient({
  data,
  room,
  view,
  fingerprint,
}: {
  data: PublicData;
  room: string;
  view: string;
  fingerprint: string;
}) {
  const [ready, setReady] = useState(false);
  const [arrived, setArrived] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const onArrive = useCallback(() => setArrived(true), []);
  const onError = useCallback(
    () =>
      window.parent.postMessage(
        { type: "museum-arrival-capture", fingerprint, error: true },
        location.origin,
      ),
    [fingerprint],
  );
  useEffect(() => {
    if (!ready || !arrived) return;
    const timer = setTimeout(() => {
      document.querySelector("canvas")?.toBlob(
        (blob) => {
          window.parent.postMessage(
            {
              type: "museum-arrival-capture",
              fingerprint,
              room,
              view,
              blob,
              error: !blob,
            },
            location.origin,
          );
        },
        "image/webp",
        0.9,
      );
    }, 1200);
    return () => clearTimeout(timer);
  }, [ready, arrived, fingerprint, room, view]);
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <MuseumCanvas
        captureBuffer
        data={data}
        destination={{ kind: "room", roomId: room }}
        navigationId={0}
        reducedMotion
        onSelect={noop}
        onReady={onReady}
        onArrive={onArrive}
        onError={onError}
        selectedArtworkId={null}
        onPointerMissed={noop}
      />
    </div>
  );
}
