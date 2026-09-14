"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicData } from "@/lib/data/types";
import { CATALOGUE_CHANGED } from "@/lib/museum/catalogueEvents";

export function useLiveMuseumData(initialData: PublicData) {
  const [snapshot, setSnapshot] = useState({ data: initialData, version: 0 });
  const current = useRef(initialData);
  useEffect(() => {
    if (JSON.stringify(current.current) !== JSON.stringify(initialData)) {
      current.current = initialData;
      setSnapshot((old) => ({ data: initialData, version: old.version + 1 }));
    }
  }, [initialData]);
  useEffect(() => {
    let active = true;
    let pending = false;
    let queued = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (document.hidden) return;
      if (pending) {
        queued = true;
        return;
      }
      pending = true;
      do {
        queued = false;
        try {
          const response = await fetch("/api/museum/data", {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) break;
          const fresh: PublicData = await response.json();
          if (
            active &&
            JSON.stringify(fresh) !== JSON.stringify(current.current)
          ) {
            current.current = fresh;
            setSnapshot((old) => ({ data: fresh, version: old.version + 1 }));
          }
        } catch {
          // Keep the working visit on a temporary network error.
        }
      } while (active && queued);
      pending = false;
    };
    const onRefresh = () => {
      void refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === CATALOGUE_CHANGED) onRefresh();
    };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(CATALOGUE_CHANGED);
      channel.onmessage = onRefresh;
    } catch {
      /* Focus and storage events work without BroadcastChannel. */
    }
    window.addEventListener("focus", onRefresh);
    document.addEventListener("visibilitychange", onRefresh);
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      controller.abort();
      channel?.close();
      window.removeEventListener("focus", onRefresh);
      document.removeEventListener("visibilitychange", onRefresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return snapshot;
}

export function useRoomPreviewVersion(
  catalogueVersion: number,
  enabled: boolean,
) {
  const [capture, setCapture] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function check() {
      try {
        const response = await fetch("/api/museum/arrival/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Preview unavailable");
        const status: {
          fingerprint: string;
          ready: boolean;
          supported: boolean;
          error?: string;
          retryAfterMs?: number;
        } = await response.json();
        if (!active) return;
        setCapture(
          `${status.fingerprint}-${status.ready ? "ready" : "pending"}`,
        );
        if (status.ready || !status.supported) return;
        timer = setTimeout(
          check,
          status.error ? Math.max(10000, status.retryAfterMs || 0) : 1500,
        );
      } catch {
        if (active) timer = setTimeout(check, 10000);
      }
    }
    void check();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [catalogueVersion, enabled]);
  return `${catalogueVersion}-${capture}`;
}
