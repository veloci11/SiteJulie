"use client";
import { MuseumEnvironment } from "./MuseumEnvironment";
export function MuseumLighting() {
  return (
    <>
      <MuseumEnvironment />
      {/* Architecture carries its own baked exhibition lighting. These lights
          affect the dynamic frames, fig foliage and engraved lettering. */}
      <directionalLight
        position={[-6, 10, 3]}
        color="#fff1dc"
        intensity={1.65}
      />
      <hemisphereLight args={["#ebe9e2", "#726858", 0.95]} />
    </>
  );
}
