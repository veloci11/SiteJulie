import { describe, expect, it } from "vitest";
import { visitMotionState } from "../components/museum/MuseumShell";
import type { Destination } from "../lib/data/types";
import { TourTimeline } from "../lib/museum/tour";

const walking = {
  destination: { kind: "room", roomId: "room-1" } as Destination,
  drawer: null,
  revealed: true,
  roomAutoplay: true,
  reducedMotion: false,
  traveling: false,
} as const;

describe("Visit overlay motion policy", () => {
  it("keeps the promenade clock running while browsing works and after closing", () => {
    const clock = new TourTimeline();
    clock.update(0, visitMotionState(walking).ambientTour);
    clock.update(1, visitMotionState(walking).ambientTour);
    const browsing = visitMotionState({ ...walking, drawer: "artworks" });
    expect(browsing.allowManualLook).toBe(false);
    expect(browsing.ambientTour).toBe(true);
    expect(clock.update(2, browsing.ambientTour)).toBe(2);
    expect(clock.update(3, browsing.ambientTour)).toBe(3);
    const closed = visitMotionState(walking);
    expect(closed.allowManualLook).toBe(true);
    expect(clock.update(4, closed.ambientTour)).toBe(4);
  });

  it("stops the promenade as soon as a work is selected, even during travel", () => {
    for (const traveling of [false, true]) {
      const selected = visitMotionState({
        ...walking,
        destination: { kind: "artwork", artworkId: "test-work" },
        traveling,
      });
      expect(selected.ambientTour).toBe(false);
      expect(selected.allowManualLook).toBe(true);
      expect(
        visitMotionState({
          ...walking,
          destination: { kind: "artwork", artworkId: "test-work" },
          drawer: "artworks",
          traveling,
        }).ambientTour,
      ).toBe(false);
    }
  });

  it("preserves the editorial promenade and accessibility motion opt-out", () => {
    for (const kind of ["home", "about", "contact"] as const) {
      const state = visitMotionState({ ...walking, destination: { kind } });
      expect(state.ambientTour).toBe(true);
      expect(state.allowManualLook).toBe(kind === "home");
    }
    expect(
      visitMotionState({ ...walking, drawer: "artworks", reducedMotion: true })
        .ambientTour,
    ).toBe(false);
    expect(
      visitMotionState({ ...walking, drawer: "artworks", revealed: false })
        .ambientTour,
    ).toBe(false);
    for (const drawer of ["rooms", "menu"] as const) {
      expect(visitMotionState({ ...walking, drawer }).ambientTour).toBe(false);
      expect(visitMotionState({ ...walking, drawer }).allowManualLook).toBe(
        false,
      );
    }
  });
});
