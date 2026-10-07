import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicData } from "../lib/data/types";

const state = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  setShell: vi.fn(),
  replace: vi.fn(),
  shellRequested: vi.fn(),
  canvasRequested: vi.fn(),
  shellReady: Promise.resolve(),
  canvasFails: false,
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [null, state.setShell],
  useEffect: (effect: () => void | (() => void)) => {
    state.effects.push(effect);
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
}));
const data = {
  artworks: [],
  rooms: ["room-1"],
} as unknown as PublicData;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function mount(phone: boolean) {
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: phone,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
    location: { search: "" },
  });
  const { default: MuseumEntry } =
    await import("../components/museum/MuseumEntry");
  const children = "Accessible catalogue";
  expect(
    MuseumEntry({ data, initialDestination: { kind: "home" }, children }),
  ).toBe(children);
  return state.effects[0]();
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  state.effects.length = 0;
  state.shellReady = Promise.resolve();
  state.canvasFails = false;
  vi.doMock("../components/museum/MuseumShell", async () => {
    state.shellRequested();
    await state.shellReady;
    return { default: () => null };
  });
  vi.doMock("../components/museum/MuseumCanvas", () => {
    state.canvasRequested();
    if (state.canvasFails) throw new Error("Renderer chunk unavailable");
    return { default: () => null };
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("museum entry loading", () => {
  it("starts the desktop renderer before the shell finishes loading", async () => {
    const shell = deferred();
    state.shellReady = shell.promise;
    await mount(false);
    await vi.waitFor(() => {
      expect(state.shellRequested).toHaveBeenCalledOnce();
      expect(state.canvasRequested).toHaveBeenCalledOnce();
    });
    expect(state.setShell).not.toHaveBeenCalled();
    shell.resolve();
    await vi.waitFor(() => expect(state.setShell).toHaveBeenCalledOnce());
  });

  it("keeps the phone catalogue free of both 3D module requests", async () => {
    await mount(true);
    expect(state.replace).toHaveBeenCalledWith("/oeuvres");
    expect(state.shellRequested).not.toHaveBeenCalled();
    expect(state.canvasRequested).not.toHaveBeenCalled();
    expect(state.setShell).toHaveBeenCalledWith(null);
  });

  it("does not prevent the shell from loading when its renderer preload fails", async () => {
    state.canvasFails = true;
    await mount(false);
    await vi.waitFor(() => {
      expect(state.canvasRequested).toHaveBeenCalledOnce();
      expect(state.setShell).toHaveBeenCalledOnce();
    });
  });

  it("retains the usable catalogue when the shell chunk fails", async () => {
    const shell = deferred();
    state.shellReady = shell.promise;
    await mount(false);
    await vi.waitFor(() => expect(state.shellRequested).toHaveBeenCalledOnce());
    shell.reject(new Error("Shell chunk unavailable"));
    // Settle the caught import rejection without requiring a real renderer.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(state.setShell).not.toHaveBeenCalled();
  });

  it("ignores a late desktop load after the entry unmounts", async () => {
    const shell = deferred();
    state.shellReady = shell.promise;
    const cleanup = await mount(false);
    await vi.waitFor(() => expect(state.shellRequested).toHaveBeenCalledOnce());
    cleanup?.();
    shell.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(state.setShell).not.toHaveBeenCalled();
  });
});
