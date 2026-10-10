import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicData } from "@/lib/data/types";
import { CATALOGUE_CHANGED } from "@/lib/museum/catalogueEvents";
import { useLiveMuseumData } from "@/components/museum/useLiveMuseumData";

const state = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  setSnapshot: vi.fn(),
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => [initial, state.setSnapshot],
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: (effect: () => void | (() => void)) => state.effects.push(effect),
}));

const data = { artworks: [], rooms: ["room-1"] } as unknown as PublicData;
let browser: EventTarget;
let documentEvents: EventTarget & { hidden: boolean };
let broadcast: { onmessage?: () => void };
let cleanup: void | (() => void);
const read = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.effects.length = 0;
  browser = new EventTarget();
  documentEvents = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", documentEvents);
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage?: () => void;
      constructor() {
        broadcast = this;
      }
      close() {}
    },
  );
  read.mockResolvedValue(new Response(JSON.stringify(data)));
  vi.stubGlobal("fetch", read);
  useLiveMuseumData(data);
  cleanup = state.effects.at(-1)!();
});
afterEach(() => {
  cleanup?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("public catalogue refresh request budget", () => {
  it("combines the browser focus/visibility pair into one public read", async () => {
    browser.dispatchEvent(new Event("focus"));
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    expect(read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(read).toHaveBeenCalledOnce();
  });

  it("combines both cross-tab edit signals and supports an edit in the same window", async () => {
    browser.dispatchEvent(
      Object.assign(new Event("storage"), { key: CATALOGUE_CHANGED }),
    );
    broadcast.onmessage?.();
    browser.dispatchEvent(new Event(CATALOGUE_CHANGED));
    await vi.advanceTimersByTimeAsync(100);
    expect(read).toHaveBeenCalledOnce();
  });

  it("does not lose an edit received while the earlier read is pending", async () => {
    let resolve!: (response: Response) => void;
    read.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    read.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ ...data, rooms: ["room-1", "room-2"] })),
    );
    browser.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(100);
    browser.dispatchEvent(new Event(CATALOGUE_CHANGED));
    broadcast.onmessage?.();
    await vi.advanceTimersByTimeAsync(100);
    expect(read).toHaveBeenCalledOnce();
    resolve(new Response(JSON.stringify(data)));
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    expect(state.setSnapshot).toHaveBeenCalledOnce();
  });

  it("does not spend reads on a hidden or unmounted visit", async () => {
    documentEvents.hidden = true;
    browser.dispatchEvent(new Event(CATALOGUE_CHANGED));
    await vi.advanceTimersByTimeAsync(100);
    expect(read).not.toHaveBeenCalled();
    documentEvents.hidden = false;
    browser.dispatchEvent(new Event("focus"));
    cleanup?.();
    cleanup = undefined;
    await vi.advanceTimersByTimeAsync(100);
    expect(read).not.toHaveBeenCalled();
  });
});
