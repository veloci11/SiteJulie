"use client";
import { useLayoutEffect, useRef } from "react";
import type { Artwork } from "@/lib/data/types";

export function CollectionTabs({
  collections,
  selected,
  reducedMotion,
  onSelect,
}: {
  collections: { name: string; artworks: Artwork[] }[];
  selected?: string;
  reducedMotion: boolean;
  onSelect: (name: string) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const names = collections.map((collection) => collection.name).join("\n");
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const active = node.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active) return;
      if (
        active.offsetLeft < node.scrollLeft ||
        active.offsetLeft + active.offsetWidth >
          node.scrollLeft + node.clientWidth
      )
        node.scrollTo({
          left: Math.max(0, active.offsetLeft - 6),
          behavior: reducedMotion ? "instant" : "smooth",
        });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node
      .querySelectorAll('[role="tab"]')
      .forEach((tab) => observer.observe(tab));
    measure();
    void document.fonts.ready.then(measure);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [selected, names, reducedMotion]);
  return (
    <div className="visit-collections-row">
      <div
        ref={list}
        className="visit-series-tabs"
        role="tablist"
        aria-label="Collections de cette salle"
      >
        {collections.map((collection, index) => (
          <button
            key={collection.name}
            role="tab"
            tabIndex={collection.name === selected ? 0 : -1}
            aria-selected={collection.name === selected}
            aria-controls="visit-room-filmstrip"
            onClick={() => onSelect(collection.name)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? collections.length - 1
                    : (index +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        collections.length) %
                      collections.length;
              onSelect(collections[next].name);
              list.current
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus();
            }}
          >
            {collection.name}
            <span>{collection.artworks.length} œuvres</span>
          </button>
        ))}
      </div>
    </div>
  );
}
