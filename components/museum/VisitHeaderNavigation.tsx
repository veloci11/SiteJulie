"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Keeps the existing links and buttons native while moving one glass highlight. */
export function VisitHeaderNavigation({
  activeKey,
  children,
}: {
  activeKey: string;
  children: ReactNode;
}) {
  const navigation = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const node = navigation.current;
    if (!node) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const active = node.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active || !node.clientWidth) {
        node.dataset.indicatorReady = "false";
        return;
      }
      node.style.setProperty("--nav-x", `${active.offsetLeft}px`);
      node.style.setProperty("--nav-width", `${active.offsetWidth}px`);
      node.dataset.indicatorReady = "true";
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node
      .querySelectorAll("a, button")
      .forEach((item) => observer.observe(item));
    measure();
    void document.fonts.ready.then(measure);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [activeKey]);

  return (
    <nav
      ref={navigation}
      className="visit-navigation"
      aria-label="Navigation principale"
    >
      <span className="visit-navigation-indicator" aria-hidden="true" />
      {children}
    </nav>
  );
}
