"use client";
import { useEffect, useMemo, useState } from "react";
import { useCursor } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import {
  BoxGeometry,
  CanvasTexture,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Artwork, Destination } from "@/lib/data/types";
import {
  artworkSize,
  slotForArtwork,
  CARTEL_WIDTH,
  CARTEL_HEIGHT,
  CARTEL_GAP,
} from "@/lib/museum/config";
interface Props {
  artwork: Artwork;
  texture: Texture;
  selected: boolean;
  showCartel?: boolean;
  onSelect: (destination: Destination) => void;
}
export function ArtworkFrame({
  artwork,
  texture,
  selected,
  onSelect,
  showCartel = true,
}: Props) {
  const slot = slotForArtwork(artwork);
  const [hover, setHover] = useState(false),
    [detail, setDetail] = useState<Texture | null>(null);
  const { invalidate, gl, camera, size: viewport } = useThree();
  const label = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 160;
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, 512, 160);
    let fontSize = 46;
    context.font = `${fontSize}px Georgia`;
    while (context.measureText(artwork.title).width > 470 && fontSize > 20)
      context.font = `${--fontSize}px Georgia`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#4b443a";
    let title = artwork.title;
    while (context.measureText(title).width > 470 && title.length > 1)
      title = title.slice(0, -2) + "…";
    context.fillText(title, 256, artwork.availability === "sold" ? 53 : 83);
    if (artwork.availability === "sold") {
      context.font = "bold 29px Arial";
      context.fillStyle = "#57534d";
      context.fillText("VENDUE", 256, 116);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }, [artwork.title, artwork.availability]);
  const shadow = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.shadowColor = "rgba(26,17,9,.65)";
    context.shadowBlur = 12;
    context.shadowOffsetY = 4;
    context.fillStyle = "#20170f";
    context.fillRect(22, 22, 212, 212);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    return map;
  }, []);
  useEffect(() => () => label.dispose(), [label]);
  useEffect(() => () => shadow.dispose(), [shadow]);
  useCursor(hover, "pointer", "auto");
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    const abort = new AbortController();
    let alive = true;
    let decoded: Texture | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idleHandle: number | undefined;
    const canvas = gl.domElement;
    canvas.dataset.detailArtwork = artwork.id;
    canvas.dataset.detailState = "pending";
    canvas.dataset.detailVariant = "room";
    async function loadDetail() {
      try {
        const response = await fetch(artwork.detailImage, {
          signal: abort.signal,
          cache: "force-cache",
        });
        if (!response.ok) throw new Error("Détail indisponible");
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob, {
          imageOrientation: "flipY",
          premultiplyAlpha: "none",
          colorSpaceConversion: "none",
        });
        if (!alive) {
          bitmap.close();
          return;
        }
        const next = new Texture(bitmap);
        decoded = next;
        next.flipY = false; // ImageBitmap is already oriented for WebGL above.
        next.colorSpace = SRGBColorSpace;
        next.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        next.needsUpdate = true;
        next.addEventListener("dispose", () => bitmap.close());
        function uploadWhenSettled() {
          if (!alive) return;
          // Native room images stay visible throughout travel. Decode happens
          // asynchronously; the larger GPU upload waits until the camera rests.
          if (canvas.dataset.navigationState !== "arrived") {
            timer = setTimeout(uploadWhenSettled, 90);
            return;
          }
          const upload = () => {
            if (!alive) return;
            gl.initTexture(next);
            setDetail(next);
            canvas.dataset.detailState = "ready";
            canvas.dataset.detailVariant = "detail";
            invalidate();
          };
          if ("requestIdleCallback" in window)
            idleHandle = window.requestIdleCallback(upload, { timeout: 450 });
          else timer = setTimeout(upload, 0);
        }
        uploadWhenSettled();
      } catch (error) {
        if (alive && !abort.signal.aborted) {
          canvas.dataset.detailState = "room-fallback";
          // An optional HD failure never interrupts a visit or removes the image.
          console.warn(
            "Museum detail image:",
            error instanceof Error ? error.message : "Unavailable",
          );
        }
      }
    }
    function resolveDetail() {
      if (!alive || !slot) return;
      if (
        canvas.dataset.navigationState !== "arrived" ||
        canvas.dataset.rendererReady !== "true"
      ) {
        timer = setTimeout(resolveDetail, 90);
        return;
      }
      const dimensions = artworkSize(artwork, slot);
      const axis = new Vector3(0, 1, 0);
      const project = (x: number, y: number) =>
        new Vector3(x, y, 0.132)
          .applyAxisAngle(axis, slot!.rotationY)
          .add(new Vector3(...slot!.position))
          .project(camera);
      const left = project(-dimensions.width / 2, 0);
      const right = project(dimensions.width / 2, 0);
      const top = project(0, dimensions.height / 2);
      const bottom = project(0, -dimensions.height / 2);
      const pixelsWide = (Math.abs(right.x - left.x) * canvas.width) / 2;
      const pixelsHigh = (Math.abs(top.y - bottom.y) * canvas.height) / 2;
      const image = texture.image as { width: number; height: number };
      const originalIsLarger =
        artwork.imageWidth > image.width * 1.05 ||
        artwork.imageHeight > image.height * 1.05;
      if (
        !originalIsLarger ||
        (pixelsWide <= image.width && pixelsHigh <= image.height)
      ) {
        // The room texture already supplies every displayed pixel. Avoid a second
        // full image decode/GPU upload when it cannot add visible resolution.
        canvas.dataset.detailState = "ready";
        return;
      }
      canvas.dataset.detailState = "loading";
      void loadDetail();
    }
    resolveDetail();
    return () => {
      alive = false;
      abort.abort();
      if (timer !== undefined) clearTimeout(timer);
      if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle);
      decoded?.dispose();
    };
    // Pose/size changes are driven by the camera, then evaluated once it arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selected,
    artwork.id,
    artwork.detailImage,
    artwork.roomId,
    artwork.slotId,
    artwork.placementOffsetX,
    artwork.placementOffsetY,
    artwork.displayScale,
    artwork.widthCm,
    artwork.heightCm,
    texture,
    invalidate,
    gl,
    camera,
    viewport.width,
    viewport.height,
  ]);
  const dimensions = slot
    ? artworkSize(artwork, slot)
    : { width: 1, height: 1 };
  const { width: w, height: h } = dimensions;
  const frameParts = useMemo(() => {
    // Identical materials share one draw, while preserving every original bevel
    // and position. Combining geometries does not change artwork hit testing.
    const frame = 0.045;
    const rim: BoxGeometry[] = [],
      inlay: BoxGeometry[] = [];
    for (const s of [1, -1]) {
      rim.push(
        new BoxGeometry(frame, h + 0.09, 0.04).translate(
          s * (w / 2 + frame / 2),
          0,
          0.147,
        ),
      );
      rim.push(
        new BoxGeometry(w + 0.09, frame, 0.04).translate(
          0,
          s * (h / 2 + frame / 2),
          0.147,
        ),
      );
      inlay.push(
        new BoxGeometry(0.008, h, 0.01).translate(
          s * (w / 2 + 0.002),
          0,
          0.149,
        ),
      );
    }
    const merged = { rim: mergeGeometries(rim), inlay: mergeGeometries(inlay) };
    for (const part of [...rim, ...inlay]) part.dispose();
    return merged;
  }, [w, h]);
  useEffect(
    () => () => {
      frameParts.rim.dispose();
      frameParts.inlay.dispose();
    },
    [frameParts],
  );
  if (!slot) return null;
  const metal =
    artwork.frameStyle === "brass"
      ? "#ad8248"
      : artwork.frameStyle === "oak"
        ? "#805b39"
        : "#ede7dc";
  const metalness = artwork.frameStyle === "brass" ? 0.58 : 0.02;
  return (
    <group
      name={`${artwork.title}${artwork.availability === "sold" ? " — VENDUE" : ""}`}
      userData={{ artworkId: artwork.id, availability: artwork.availability }}
      position={slot.position}
      rotation={[0, slot.rotationY, 0]}
    >
      <mesh position={[0.012, -0.012, 0.018]}>
        <planeGeometry args={[w + 0.42, h + 0.42]} />
        <meshBasicMaterial
          map={shadow}
          transparent
          opacity={0.3}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      <group
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect({ kind: "artwork", artworkId: artwork.id });
        }}
      >
        <mesh position={[0, 0, 0.035]} castShadow receiveShadow>
          <boxGeometry args={[w + 0.17, h + 0.17, 0.07]} />
          <meshStandardMaterial color="#342b20" roughness={0.78} />
        </mesh>
        <mesh position={[0, 0, 0.08]}>
          <boxGeometry args={[w + 0.1, h + 0.1, 0.09]} />
          <meshStandardMaterial
            color={metal}
            metalness={metalness}
            roughness={0.34}
          />
        </mesh>
        <mesh position={[0, 0, 0.132]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial
            map={selected && detail ? detail : texture}
            color={artwork.availability === "sold" ? "#b0b0b0" : "#ffffff"}
            toneMapped={false}
          />
        </mesh>
        <mesh geometry={frameParts.rim} castShadow>
          <meshStandardMaterial
            color={metal}
            metalness={metalness}
            roughness={0.28}
          />
        </mesh>
        <mesh geometry={frameParts.inlay}>
          <meshStandardMaterial
            color="#dec59a"
            metalness={0.4}
            roughness={0.3}
          />
        </mesh>
      </group>
      {showCartel && (
        <group>
          <mesh position={[0, -h / 2 - CARTEL_GAP, -0.019]}>
            <boxGeometry args={[CARTEL_WIDTH, CARTEL_HEIGHT, 0.006]} />
            <meshStandardMaterial
              color="#d8d2c7"
              metalness={0}
              roughness={0.95}
            />
          </mesh>
          <mesh position={[0, -h / 2 - CARTEL_GAP, -0.015]}>
            <planeGeometry args={[CARTEL_WIDTH - 0.02, CARTEL_HEIGHT - 0.01]} />
            <meshBasicMaterial map={label} transparent toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}
