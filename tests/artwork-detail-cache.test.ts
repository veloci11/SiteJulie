import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera, Texture, Vector3 } from "three";
import type { Artwork } from "../lib/data/types";
import { slotForArtwork } from "../lib/museum/config";
import fixture from "./fixtures/catalog.json";

const state = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  detail: vi.fn(),
  stateIndex: 0,
  renderer: {} as unknown,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [
    initial,
    state.stateIndex++ === 1 ? state.detail : vi.fn(),
  ],
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => void | (() => void)) => {
    state.effects.push(effect);
  },
}));
vi.mock("@react-three/drei", () => ({ useCursor: vi.fn() }));
vi.mock("@react-three/fiber", () => ({ useThree: () => state.renderer }));

let cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.clearAllMocks();
  state.effects.length = 0;
  state.stateIndex = 0;
  cleanups = [];
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect() {},
        fillText() {},
        fillRect() {},
        measureText: () => ({ width: 100 }),
      }),
    }),
  });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 1014, height: 1000, close: vi.fn() })),
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function selectWithCachedDetail(fresh: boolean) {
  const artwork = fixture.artworks[0] as Artwork;
  const slot = slotForArtwork(artwork)!;
  const camera = new PerspectiveCamera(65, 1440 / 900, 0.1, 260);
  camera.position
    .set(...slot.position)
    .addScaledVector(new Vector3(...slot.wallNormal), 3);
  camera.lookAt(new Vector3(...slot.position));
  camera.updateMatrixWorld();
  const canvas = {
    width: 1440,
    height: 900,
    dataset: { navigationState: "arrived", rendererReady: "true" },
  };
  const upload = vi.fn();
  state.renderer = {
    gl: {
      domElement: canvas,
      capabilities: { getMaxAnisotropy: () => 4 },
      initTexture: upload,
    },
    camera,
    invalidate: vi.fn(),
    size: { width: 1440, height: 900 },
  };
  const validatePermission = vi.fn(() => new Response(null, { status: 401 }));
  // A small browser-cache fixture: a fresh entry is reusable, while an expired
  // entry requires permission revalidation unless the caller forces stale reuse.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, request: RequestInit) => {
      if (fresh || request.cache === "force-cache")
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "image/webp" },
        });
      return validatePermission();
    }),
  );
  const { ArtworkFrame } = await import("../components/museum/ArtworkFrame");
  const roomTexture = new Texture({ width: 32, height: 32 });
  ArtworkFrame({
    artwork,
    texture: roomTexture,
    selected: true,
    onSelect: vi.fn(),
  });
  for (const effect of state.effects) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  cleanups.push(() => roomTexture.dispose());
  return { canvas, upload, validatePermission };
}

describe("artwork detail permission-aware browser caching", () => {
  it("rechecks an expired HD image and retains its room fallback after permission denial", async () => {
    const { canvas, upload, validatePermission } =
      await selectWithCachedDetail(false);
    await vi.waitFor(() => {
      expect(validatePermission).toHaveBeenCalledOnce();
      expect(canvas.dataset).toHaveProperty("detailState", "room-fallback");
    });
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(state.detail).not.toHaveBeenCalled();
  });

  it("still decodes a fresh cached HD image without an extra permission request", async () => {
    const { canvas, upload, validatePermission } =
      await selectWithCachedDetail(true);
    await vi.waitFor(() => {
      expect(upload).toHaveBeenCalledOnce();
      expect(canvas.dataset).toHaveProperty("detailState", "ready");
    });
    expect(validatePermission).not.toHaveBeenCalled();
    expect(createImageBitmap).toHaveBeenCalledOnce();
    expect(state.detail).toHaveBeenCalledOnce();
  });
});
