"use client";
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace } from "three";
import type { Vec3 } from "@/lib/museum/config";

/** Millimetric recessed lettering, fixed to the wall (never a billboard). */
export function EngravedText({
  text,
  position,
  rotationY = 0,
  width = 2.6,
  height = 1.35,
  small = false,
}: {
  text: string;
  position: Vec3;
  rotationY?: number;
  width?: number;
  height?: number;
  small?: boolean;
}) {
  const gl = useThree((state) => state.gl);
  const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const [albedo, relief] = useMemo(() => {
    const canvas = document.createElement("canvas"),
      depth = document.createElement("canvas");
    canvas.width = depth.width = 2048;
    // Match world proportions exactly: stretching a fixed 2:1 texture distorted
    // the type and its bevel, particularly when viewed from the side.
    canvas.height = depth.height = Math.round((2048 * height) / width);
    const ctx = canvas.getContext("2d")!,
      heightCtx = depth.getContext("2d")!;
    let fontSize = small ? 100 : 172;
    for (const context of [ctx, heightCtx]) {
      context.font = `${fontSize}px ${small ? "Arial, sans-serif" : "Georgia, serif"}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
    }
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      // French punctuation belongs to the preceding word, including at a wrap.
      for (const word of paragraph
        .replace(/ +([?!:;])/g, "\u00a0$1")
        .split(/ +/)) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > 1840 && line) {
          lines.push(line);
          line = word;
        } else line = test;
      }
      lines.push(line);
    }
    if (lines.length === 2 && !small) {
      // A short inscription should read as two balanced lines, not a long
      // sentence followed by an isolated final word.
      const words = lines.join(" ").split(/ +/);
      let best = Infinity;
      for (let split = 1; split < words.length; split++) {
        const pair = [
          words.slice(0, split).join(" "),
          words.slice(split).join(" "),
        ];
        const widths = pair.map((line) => ctx.measureText(line).width);
        const difference = Math.abs(widths[0] - widths[1]);
        if (Math.max(...widths) <= 1840 && difference < best) {
          best = difference;
          lines.splice(0, 2, ...pair);
        }
      }
    }
    fontSize = Math.min(
      fontSize,
      (canvas.height * 0.78) / Math.max(1, lines.length) / 1.25,
    );
    for (const context of [ctx, heightCtx])
      context.font = `${fontSize}px ${small ? "Arial, sans-serif" : "Georgia, serif"}`;
    const leading = fontSize * 1.25;
    heightCtx.fillStyle = "white";
    heightCtx.fillRect(0, 0, canvas.width, canvas.height);
    lines.forEach((line, index) => {
      const y = canvas.height / 2 + (index - (lines.length - 1) / 2) * leading;
      ctx.fillStyle = "#dfcfb7";
      ctx.fillText(line, 1024, y + 1.5, 1840);
      ctx.fillStyle = "#88765f";
      ctx.fillText(line, 1024, y, 1840);
      heightCtx.filter = "blur(1px)";
      heightCtx.fillStyle = "#555555";
      heightCtx.fillText(line, 1024, y, 1840);
    });
    const color = new CanvasTexture(canvas),
      bump = new CanvasTexture(depth);
    color.colorSpace = SRGBColorSpace;
    color.anisotropy = bump.anisotropy = anisotropy;
    return [color, bump];
  }, [text, small, width, height, anisotropy]);
  useEffect(
    () => () => {
      albedo.dispose();
      relief.dispose();
    },
    [albedo, relief],
  );
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        map={albedo}
        bumpMap={relief}
        bumpScale={0.0015}
        transparent
        alphaTest={0.08}
        roughness={0.96}
        depthWrite
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
}
