"use client";
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { museumRenderBudget, usesWebKit } from "@/lib/museum/render-quality";
/** Keep the drawing buffer stable throughout a journey, including arrival. */
export function RenderQuality({
  onPixelRatio,
}: {
  onPixelRatio?: (ratio: number) => void;
}) {
  const { gl, size, invalidate } = useThree();
  useEffect(() => {
    const shell = gl.domElement.closest<HTMLElement>(".visit-shell");
    if (!shell || !usesWebKit(navigator.userAgent)) return;
    // Scope CSS compositing savings to this museum, including its native dialogs.
    shell.dataset.rendererEngine = "webkit";
    return () => {
      delete shell.dataset.rendererEngine;
    };
  }, [gl]);
  useEffect(() => {
    const budget = museumRenderBudget(
      size.width,
      size.height,
      window.devicePixelRatio,
      navigator.userAgent,
    );
    onPixelRatio?.(budget.ratio);
    gl.domElement.dataset.renderQuality = budget.webkit
      ? "webkit-balanced"
      : budget.compact
        ? "mobile-detail"
        : "detail";
    gl.domElement.dataset.requestedPixelRatio = budget.ratio.toFixed(4);
    gl.domElement.dataset.pixelBudget = String(budget.pixels);
    invalidate();
  }, [gl, size.width, size.height, onPixelRatio, invalidate]);
  return null;
}
