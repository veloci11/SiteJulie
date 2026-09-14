"use client";
import { Component, Suspense, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { MuseumScene, type MuseumProps } from "./MuseumScene";
import { CAMERA_FOV } from "@/lib/museum/navigation";
class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("Museum renderer:", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export default function MuseumCanvas(props: MuseumProps) {
  // Canvas configuration is the sole DPR owner. Fiber reapplies this prop on
  // parent renders, so an imperative setDpr inside the scene would be overwritten.
  const [pixelRatio, setPixelRatio] = useState(1);
  return (
    <SceneBoundary onError={props.onError}>
      <Canvas
        onPointerMissed={props.onPointerMissed}
        frameloop="demand"
        dpr={pixelRatio}
        camera={{
          position: [1.35, 1.9, 7.4],
          fov: CAMERA_FOV,
          near: 0.1,
          far: 260,
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: ACESFilmicToneMapping,
          outputColorSpace: SRGBColorSpace,
          toneMappingExposure: 1.05,
        }}
        fallback={
          <span>
            Le musée nécessite WebGL. Le catalogue classique reste accessible.
          </span>
        }
        onCreated={({ gl }) => {
          gl.domElement.setAttribute(
            "aria-label",
            "Musée en trois dimensions. Sélectionnez une œuvre dans le carrousel pour vous déplacer.",
          );
          gl.domElement.setAttribute("role", "img");
          gl.domElement.addEventListener(
            "webglcontextlost",
            (event) => {
              event.preventDefault();
              props.onError();
            },
            { once: true },
          );
        }}
      >
        <Suspense fallback={null}>
          <MuseumScene {...props} onPixelRatio={setPixelRatio} />
        </Suspense>
      </Canvas>
    </SceneBoundary>
  );
}
