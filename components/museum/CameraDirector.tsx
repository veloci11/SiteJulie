"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  addAfterEffect,
  addEffect,
  useFrame,
  useThree,
} from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import CameraControlsImpl from "camera-controls";
import { PerspectiveCamera, Vector3 } from "three";
import type { Destination, PublicData } from "@/lib/data/types";
import { ROOM_DEPTH, type Vec3 } from "@/lib/museum/config";
import {
  destinationPose,
  artworkPose,
  roomArrivalPose,
  distance,
  motionFromPose,
  motionLookTarget,
  planCameraMotion,
  NAVIGATION_SPEED_MULTIPLIER,
  sampleCameraMotion,
  type CameraMotion,
  type CameraMotionSample,
  type CameraPose,
} from "@/lib/museum/navigation";
import {
  ambientWalkPosterPose,
  createAmbientWalk,
  nearestWalkEntry,
  roomWalkEntry,
  roomWalkEntrySample,
  pausedWalkSample,
  visibleWalkArtwork,
  walkDistanceAt,
  type AmbientWalk,
  canRunAmbientTour,
  tourArtworks,
  TourTimeline,
  TOUR_INITIAL_DELAY,
} from "@/lib/museum/tour";
import {
  automaticLens,
  automaticTourInsets,
  openingLensTarget,
} from "@/lib/museum/automaticFraming";
import {
  ContinuousPromenade,
  continuationRoom,
  manualContinuationRoom,
} from "@/lib/museum/promenade";
import { manualLookSample } from "@/lib/museum/manualLook";
export type LookState = "dragging" | "resuming" | "blocked" | "idle";
interface Props {
  data: PublicData;
  destination: Destination;
  navigationId: number;
  reducedMotion: boolean;
  onArrive: (id: number) => void;
  onError: () => void;
  onFirstFrame?: () => void;
  skipTransition?: boolean;
  ambientTour?: boolean;
  roomAutoplay?: boolean;
  resumeFromCurrent?: boolean;
  onTourArtwork?: (artworkId: string | null) => void;
  onLookResume?: (roomId: string) => void;
  onLookStateChange?: (state: LookState) => void;
  allowManualLook?: boolean;
}
interface Journey {
  id: number;
  motion: CameraMotion;
  startedAt: number | null;
  elapsed: number;
  lastFrame: number | null;
  reframe: boolean;
}
export function CameraDirector({
  data,
  destination,
  navigationId,
  reducedMotion,
  onArrive,
  onError,
  onFirstFrame,
  skipTransition,
  ambientTour = false,
  roomAutoplay = false,
  resumeFromCurrent = false,
  onTourArtwork,
  onLookResume,
  onLookStateChange,
  allowManualLook = true,
}: Props) {
  const controls = useRef<CameraControlsImpl>(null);
  const journey = useRef<Journey | null>(null);
  const presentationTime = useRef<number | null>(null);
  useLayoutEffect(
    () =>
      addEffect((timestamp) => {
        presentationTime.current = timestamp / 1000;
      }),
    [],
  );
  const rendered = useRef<CameraMotionSample | null>(null);
  const first = useRef(true);
  const appliedId = useRef<number | null>(null);
  const appliedPose = useRef<CameraPose | null>(null);
  const arrivedId = useRef<number | null>(null);
  const callbacks = useRef({
    onArrive,
    onError,
    onFirstFrame,
    onTourArtwork,
    onLookResume,
    onLookStateChange,
  });
  callbacks.current = {
    onArrive,
    onError,
    onFirstFrame,
    onTourArtwork,
    onLookResume,
    onLookStateChange,
  };
  const presented = useRef(false);
  useEffect(
    () =>
      addAfterEffect(() => {
        // Hide the poster only after the renderer has painted the applied pose.
        if (presented.current || !rendered.current) return;
        presented.current = true;
        callbacks.current.onFirstFrame?.();
      }),
    [],
  );
  const currentRooms = useRef(data.rooms);
  currentRooms.current = data.rooms;
  const manualResume = useRef(false);
  const cancelledDragPointer = useRef<number | null>(null);
  const manualLookAllowed = useRef(allowManualLook);
  manualLookAllowed.current = allowManualLook;
  const lastManualMetadataTime = useRef(-Infinity);
  const mouseLook = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    active: boolean;
    sample: CameraMotionSample;
  } | null>(null);
  const [visible, setVisible] = useState(true);
  const promenade = useRef<ContinuousPromenade | null>(null);
  const previousActiveTime = useRef(0);
  const automaticLensState = useRef({
    measuredAt: -Infinity,
    target: { fov: 60, offsetX: 0, offsetY: 0 },
  });
  const tour = useRef({
    timeline: new TourTimeline(),
    artworkId: null as string | null,
    walk: null as AmbientWalk | null,
    lastMetadataTime: -Infinity,
    startedAt: 0,
    dueAt: TOUR_INITIAL_DELAY,
    hasStarted: false,
    readyOnLoop: false,
    openingLens: false,
    openingElapsed: 0,
    entryElapsed: null as number | null,
  });
  const wake = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tourAllowed = canRunAmbientTour(
    destination,
    ambientTour,
    reducedMotion,
    visible,
  );
  const allowedRef = useRef(tourAllowed);
  allowedRef.current = tourAllowed;
  const walkData = useRef<PublicData | null>(null);
  // Build the room loops once per catalogue update, never during a cancel click.
  const roomWalks = useMemo(
    () =>
      new Map(
        data.rooms.map((roomId) => [
          roomId,
          createAmbientWalk(roomId, data.rooms, data.artworks),
        ]),
      ),
    [data],
  );
  const currentWalks = useRef(roomWalks);
  currentWalks.current = roomWalks;
  const appliedSize = useRef({ width: 0, height: 0 });
  const latestId = useRef(navigationId);
  latestId.current = navigationId;
  const { camera, size, invalidate, gl } = useThree();
  const [focusInsets, setFocusInsets] = useState<{
    top: number;
    bottom: number;
    left: number;
    right: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (destination.kind !== "artwork") {
      setFocusInsets(null);
      return;
    }
    const shell = gl.domElement.closest<HTMLElement>(".visit-shell");
    if (!shell) return;
    let frame = 0;
    const measure = () => {
      const bounds = gl.domElement.getBoundingClientRect();
      const header = shell
        .querySelector(".visit-header")
        ?.getBoundingClientRect();
      const dock = shell.querySelector(".visit-dock")?.getBoundingClientRect();
      const details = shell
        .querySelector(".visit-details")
        ?.getBoundingClientRect();
      const portrait =
        bounds.width <= 700 &&
        !(bounds.height <= 520 && bounds.width > bounds.height);
      const top = Math.max(
        96,
        (header?.bottom ?? bounds.top + 76) - bounds.top + 16,
      );
      const dockBottom = dock ? bounds.bottom - dock.top + 12 : 220;
      const next = {
        top: portrait ? Math.max(top, 128) : top,
        bottom: portrait
          ? details
            ? bounds.bottom - details.top + 12
            : dockBottom + 40
          : dockBottom + (details ? 0 : 40),
        left: 16,
        right: portrait ? 16 : details ? bounds.right - details.left + 16 : 16,
      };
      setFocusInsets((previous) =>
        previous &&
        Object.keys(next).every(
          (key) =>
            Math.abs(
              previous[key as keyof typeof next] -
                next[key as keyof typeof next],
            ) < 1,
        )
          ? previous
          : next,
      );
      shell
        .querySelectorAll(".visit-header, .visit-dock, .visit-details")
        .forEach((node) => resize.observe(node));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(shell);
    const mutations = new MutationObserver(schedule);
    mutations.observe(shell, { childList: true, subtree: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [destination.kind, gl, size.width, size.height]);

  const cameraRef = camera as PerspectiveCamera;
  const destinationKey = JSON.stringify(destination);
  function clearWake() {
    if (wake.current !== null) clearTimeout(wake.current);
    wake.current = null;
  }
  function setLookState(state: LookState) {
    if (gl.domElement.dataset.lookState === state) return;
    gl.domElement.dataset.lookState = state;
    callbacks.current.onLookStateChange?.(state);
  }
  function updateVisibleArtwork(sample: CameraMotionSample, roomId: string) {
    const shell = gl.domElement.closest<HTMLElement>(".visit-shell");
    const bounds = gl.domElement.getBoundingClientRect();
    const artworkId = visibleWalkArtwork(
      sample,
      tourArtworks(data, roomId),
      size.width,
      size.height,
      tour.current.artworkId,
      automaticTourInsets(shell, size.width, size.height, bounds.bottom),
    );
    if (artworkId !== tour.current.artworkId) {
      tour.current.artworkId = artworkId;
      gl.domElement.dataset.tourArtwork = artworkId ?? "";
      callbacks.current.onTourArtwork?.(artworkId);
    }
  }
  function cancelMouseLook(continueWalking: boolean) {
    const look = mouseLook.current;
    if (!look) return;
    mouseLook.current = null;
    manualResume.current = false;
    if (look.active) cancelledDragPointer.current = look.pointerId;
    if (gl.domElement.hasPointerCapture(look.pointerId))
      gl.domElement.releasePointerCapture(look.pointerId);
    gl.domElement.dataset.lookSuppressUntil = String(Date.now() + 350);
    if (look.active) {
      const stopped = pausedWalkSample(look.sample);
      applySample(stopped, 0);
      if (continueWalking && tour.current.walk) {
        // Opening an overlay does not navigate away from it on pointer release.
        // The background visit rejoins safely from the actual stopped pose,
        // rather than restarting at a stored loop position after the drag.
        const walk =
          currentWalks.current.get(tour.current.walk.roomId) ??
          tour.current.walk;
        promenade.current = new ContinuousPromenade(
          walk,
          stopped,
          currentRooms.current,
          undefined,
          { manualLook: true },
        );
      }
    }
    setLookState("idle");
    invalidate();
  }
  useLayoutEffect(() => {
    if (!allowManualLook) cancelMouseLook(true);
    // Input refs and the current room loops always contain the latest request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowManualLook]);
  function wakeAfter(seconds: number) {
    clearWake();
    wake.current = setTimeout(() => invalidate(), Math.max(0, seconds) * 1000);
  }
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    tour.current.timeline.update(performance.now() / 1000, tourAllowed);
    clearWake();
    // A direct selection while walking retains the last rendered velocity.
    // Only an actual pause of this same request discards that momentum.
    if (
      !tourAllowed &&
      tour.current.hasStarted &&
      !journey.current &&
      appliedId.current === navigationId &&
      rendered.current
    ) {
      if (promenade.current)
        promenade.current = promenade.current.pause(currentRooms.current);
      rendered.current =
        promenade.current?.sample ?? pausedWalkSample(rendered.current);
      gl.domElement.dataset.tourSpeed = "0";
      gl.domElement.dataset.tourYawSpeed = "0";
    }
    gl.domElement.dataset.tourState = tourAllowed
      ? tour.current.hasStarted
        ? "walking"
        : "waiting"
      : tour.current.hasStarted
        ? "paused"
        : "off";
    if (tourAllowed) invalidate();
    return clearWake;
  }, [tourAllowed, navigationId, visible, gl, invalidate]);

  function applySample(sample: CameraMotionSample, delta: number) {
    const controller = controls.current;
    if (!controller) return;
    const target = motionLookTarget(sample);
    void controller.setLookAt(...sample.position, ...target, false);
    // CameraControls is the sole owner of position and orientation. Lens shift
    // keeps the artwork inside the actual HTML-free rectangle of the Canvas.
    cameraRef.fov = sample.fov;
    if (Math.abs(sample.offsetX) + Math.abs(sample.offsetY) > 0.001) {
      cameraRef.setViewOffset(
        size.width,
        size.height,
        sample.offsetX,
        sample.offsetY,
        size.width,
        size.height,
      );
    } else cameraRef.clearViewOffset();
    controller.update(delta);
    gl.domElement.dataset.cameraFov = sample.fov.toFixed(4);
    gl.domElement.dataset.cameraOffset = JSON.stringify([
      sample.offsetX,
      sample.offsetY,
    ]);
    rendered.current = sample;
    gl.domElement.dataset.resumeRoom = continuationRoom(sample, data.rooms);
    gl.domElement.dataset.cameraPosition = JSON.stringify(
      sample.position.map((v) => Number(v.toFixed(5))),
    );
    gl.domElement.dataset.cameraRoom = `room-${Math.max(1, Math.min(data.rooms.length, Math.floor((sample.position[2] + ROOM_DEPTH / 2) / ROOM_DEPTH) + 1))}`;
    gl.domElement.dataset.cameraTarget = JSON.stringify(
      target.map((v) => Number(v.toFixed(5))),
    );
  }
  function arrive(id: number) {
    if (id !== latestId.current) return;
    gl.domElement.dataset.navigationState = "arrived";
    if (id === latestId.current && arrivedId.current !== id) {
      arrivedId.current = id;
      callbacks.current.onArrive(id);
    }
  }
  useEffect(() => {
    const canvas = gl.domElement;
    const down = (event: PointerEvent) => {
      if (
        event.pointerType !== "mouse" ||
        !manualLookAllowed.current ||
        event.button !== 0 ||
        !event.isPrimary ||
        !rendered.current ||
        !callbacks.current.onLookResume
      )
        return;
      // A fresh press is a new visitor intent. Only the release of the old
      // cancelled press must be swallowed; keyboard and dock clicks are native.
      cancelledDragPointer.current = null;
      canvas.dataset.lookSuppressUntil = "0";
      mouseLook.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        active: false,
        sample: rendered.current,
      };
    };
    const move = (event: PointerEvent) => {
      const look = mouseLook.current;
      if (!look || look.pointerId !== event.pointerId) return;
      if (!manualLookAllowed.current) {
        cancelMouseLook(true);
        return;
      }
      if (!look.active) {
        if (
          Math.hypot(event.clientX - look.startX, event.clientY - look.startY) <
          6
        )
          return;
        look.active = true;
        lastManualMetadataTime.current = -Infinity;
        look.sample = pausedWalkSample(rendered.current!);
        journey.current = null;
        promenade.current = null;
        clearWake();
        canvas.setPointerCapture(event.pointerId);
        setLookState("dragging");
        canvas.dataset.navigationState = "looking";
        canvas.dataset.tourState = "looking";
      }
      look.sample = manualLookSample(
        look.sample,
        event.clientX - look.lastX,
        event.clientY - look.lastY,
        canvas.clientWidth,
      );
      look.lastX = event.clientX;
      look.lastY = event.clientY;
      canvas.dataset.lookSuppressUntil = String(Date.now() + 500);
      event.preventDefault();
      invalidate();
    };
    const finish = (event?: PointerEvent) => {
      if (
        cancelledDragPointer.current !== null &&
        event?.pointerId === cancelledDragPointer.current
      ) {
        cancelledDragPointer.current = null;
        canvas.dataset.lookSuppressUntil = String(Date.now() + 350);
      }
      const look = mouseLook.current;
      if (!look || (event && event.pointerId !== look.pointerId)) return;
      if (!manualLookAllowed.current) {
        cancelMouseLook(true);
        return;
      }
      mouseLook.current = null;
      if (canvas.hasPointerCapture(look.pointerId))
        canvas.releasePointerCapture(look.pointerId);
      if (!look.active) return;
      // The release keeps the last gaze exactly; the existing collision-checked
      // promenade chooses a forward merge and circulation from that new heading.
      applySample(look.sample, 0);
      setLookState("resuming");
      canvas.dataset.lookSuppressUntil = String(Date.now() + 350);
      manualResume.current = true;
      callbacks.current.onLookResume?.(
        manualContinuationRoom(look.sample, currentRooms.current),
      );
      invalidate();
    };
    const suppressResidualClick = (event: MouseEvent) => {
      if (
        cancelledDragPointer.current !== null ||
        Date.now() < Number(canvas.dataset.lookSuppressUntil || 0)
      ) {
        // Capture runs before Fiber's mesh click / pointer-missed handlers.
        // A cancelled drag must not select the painting underneath its release.
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const blur = () => cancelMouseLook(true);
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", blur);
    canvas.addEventListener("click", suppressResidualClick, true);
    return () => {
      const look = mouseLook.current;
      if (look && canvas.hasPointerCapture(look.pointerId))
        canvas.releasePointerCapture(look.pointerId);
      mouseLook.current = null;
      manualResume.current = false;
      cancelledDragPointer.current = null;
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", blur);
      canvas.removeEventListener("click", suppressResidualClick, true);
    };
    // Event input only edits a pending sample; CameraDirector remains the sole
    // owner of the rendered pose, including during manual looking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, invalidate]);
  useEffect(() => {
    const controller = controls.current;
    if (!controller) return;
    if (mouseLook.current?.active) {
      if (appliedId.current === navigationId) return;
      cancelMouseLook(false);
    }
    try {
      const overview =
        destination.kind === "home" || destination.kind === "room";
      const roomId =
        destination.kind === "room" ? destination.roomId : "room-1";
      const walk = overview
        ? tour.current.walk?.roomId === roomId && walkData.current === data
          ? tour.current.walk
          : roomWalks.get(roomId)!
        : null;
      walkData.current = data;
      if (walk) tour.current.walk = walk;
      const sameRequest = appliedId.current === navigationId;
      const previousPose = appliedPose.current;
      const roomStart =
        sameRequest && previousPose
          ? motionFromPose(previousPose)
          : rendered.current;
      let pose =
        destination.kind === "room" && roomStart && !first.current
          ? roomArrivalPose(
              destination.roomId,
              roomStart,
              size.width,
              size.height,
              data.rooms,
            )
          : walk
            ? ambientWalkPosterPose(walk, size.width, size.height)
            : destination.kind === "artwork" && focusInsets
              ? artworkPose(
                  data.artworks.find(
                    (artwork) => artwork.id === destination.artworkId,
                  )!,
                  size.width,
                  size.height,
                  focusInsets,
                )
              : destinationPose(destination, data, size.width, size.height);
      const resized =
        appliedSize.current.width !== size.width ||
        appliedSize.current.height !== size.height;
      appliedSize.current = { width: size.width, height: size.height };
      appliedPose.current = pose;
      // A pause or responsive resize must never send an ambient visit home.
      if (
        sameRequest &&
        tour.current.hasStarted &&
        (destination.kind === "home" || destination.kind === "room")
      ) {
        if (resized && promenade.current) {
          applySample(promenade.current.sample, 1 / 60);
          invalidate();
        }
        return;
      }
      if (!sameRequest) {
        const visibleArtworkId = manualResume.current
          ? tour.current.artworkId
          : null;
        if (!manualResume.current) setLookState("idle");
        promenade.current = null;
        previousActiveTime.current = 0;
        clearWake();
        tour.current = {
          timeline: new TourTimeline(),
          artworkId: visibleArtworkId,
          walk,
          lastMetadataTime: -Infinity,
          startedAt: 0,
          dueAt: TOUR_INITIAL_DELAY,
          hasStarted: false,
          readyOnLoop: first.current && roomAutoplay,
          openingLens: first.current && overview,
          openingElapsed: 0,
          entryElapsed: null,
        };
        tour.current.timeline.update(
          performance.now() / 1000,
          allowedRef.current,
        );
        gl.domElement.dataset.tourArtwork = visibleArtworkId ?? "";
        gl.domElement.dataset.tourState = allowedRef.current
          ? "waiting"
          : "off";
        gl.domElement.dataset.tourProgress = "0";
        gl.domElement.dataset.tourCycle = "0";
        gl.domElement.dataset.tourElapsed = "0";
        gl.domElement.dataset.tourSpeed = "0";
        callbacks.current.onTourArtwork?.(visibleArtworkId);
      }
      const wasTraveling = journey.current !== null;
      const from =
        rendered.current ??
        motionFromPose({
          position: controller.getPosition(new Vector3()).toArray() as Vec3,
          target: controller.getTarget(new Vector3()).toArray() as Vec3,
          offsetPx: 0,
          offsetYPx: 0,
          roomId: pose.roomId,
        });
      controller.stop();
      journey.current = null;
      appliedId.current = navigationId;
      gl.domElement.dataset.navigationId = String(navigationId);
      if (
        resumeFromCurrent &&
        !sameRequest &&
        walk &&
        !first.current &&
        (!reducedMotion || manualResume.current)
      ) {
        const wasManualLook = manualResume.current;
        manualResume.current = false;
        promenade.current = reducedMotion
          ? null
          : new ContinuousPromenade(walk, from, data.rooms, undefined, {
              manualLook: wasManualLook,
            });
        tour.current.hasStarted = true;
        tour.current.startedAt = tour.current.timeline.time;
        tour.current.dueAt = 0;
        gl.domElement.dataset.transitionKind = "resume";
        gl.domElement.dataset.transitionDuration = "0";
        gl.domElement.dataset.tourState = reducedMotion
          ? "off"
          : !allowedRef.current
            ? "paused"
            : (promenade.current?.phase ?? "walking");
        setLookState(
          !allowedRef.current
            ? "idle"
            : promenade.current?.phase === "blocked"
              ? "blocked"
              : wasManualLook
                ? "resuming"
                : "idle",
        );
        // The last rendered pose is the first resumed pose. No travel to an
        // arrival marker, no reset to a stored tour time, no second camera.
        applySample(from, 0);
        arrive(navigationId);
        invalidate();
        return;
      }
      let roomEndSample: CameraMotionSample | undefined;
      const differentRoom =
        destination.kind === "room" &&
        !first.current &&
        Math.floor((from.position[2] + ROOM_DEPTH / 2) / ROOM_DEPTH) !==
          Math.floor((pose.position[2] + ROOM_DEPTH / 2) / ROOM_DEPTH);
      if (
        roomAutoplay &&
        walk &&
        (differentRoom ||
          (!sameRequest && destination.kind === "room" && !first.current) ||
          (sameRequest && wasTraveling && tour.current.entryElapsed !== null))
      ) {
        const entryElapsed =
          sameRequest && tour.current.entryElapsed !== null
            ? tour.current.entryElapsed
            : differentRoom
              ? roomWalkEntry(walk, motionFromPose(pose))
              : nearestWalkEntry(walk, from);
        const target = roomWalkEntrySample(
          walk,
          entryElapsed,
          size.width,
          size.height,
        );
        roomEndSample = target;
        pose = {
          position: target.position,
          target: motionLookTarget(target),
          roomId: pose.roomId,
          fov: target.fov,
          offsetPx: target.offsetX,
          offsetYPx: target.offsetY,
          roomEntry: true,
        };
        appliedPose.current = pose;
        tour.current.entryElapsed = entryElapsed;
        tour.current.readyOnLoop = true;
      }
      gl.domElement.dataset.transitionKind = "continuous";
      if (first.current || reducedMotion || skipTransition) {
        first.current = false;
        applySample(motionFromPose(pose), 1 / 60);
        arrive(navigationId);
        if (allowedRef.current) wakeAfter(TOUR_INITIAL_DELAY);
        invalidate(3);
        return;
      }
      const final = motionFromPose(pose);
      const angularDelta =
        Math.abs(
          Math.atan2(
            Math.sin(final.yaw - from.yaw),
            Math.cos(final.yaw - from.yaw),
          ),
        ) + Math.abs(final.pitch - from.pitch);
      if (
        sameRequest &&
        !wasTraveling &&
        distance(from.position, pose.position) < 0.001 &&
        angularDelta < 0.001 &&
        Math.abs(from.fov - final.fov) < 0.001 &&
        Math.abs(from.offsetX - pose.offsetPx) +
          Math.abs(from.offsetY - pose.offsetYPx) <
          0.1
      ) {
        arrive(navigationId);
        invalidate(2);
        return;
      }
      // Resizing never calls the instant-navigation branch. A settled image is
      // gently reframed; a journey in progress retains its current momentum.
      const reframe =
        sameRequest &&
        arrivedId.current === navigationId &&
        previousPose?.roomId === pose.roomId &&
        distance(previousPose.target, pose.target) < 0.001;
      const duration = reframe
        ? Math.min(1.1, 0.55 + distance(from.position, pose.position) * 0.08)
        : undefined;
      const motion = planCameraMotion(from, pose, data.rooms, {
        duration,
        endSample: roomEndSample,
        pace:
          !reframe &&
          (destination.kind === "artwork" || destination.kind === "room")
            ? NAVIGATION_SPEED_MULTIPLIER
            : 1,
      });
      journey.current = {
        id: navigationId,
        motion,
        // Begin on the first rendered frame, excluding synchronous preparation
        // and GPU compilation from the animation clock (which caused a jump).
        startedAt: null,
        elapsed: 0,
        lastFrame: null,
        reframe,
      };
      gl.domElement.dataset.navigationState = reframe
        ? "reframing"
        : "traveling";
      gl.domElement.dataset.transitionDuration = motion.duration.toFixed(3);
      gl.domElement.dataset.transitionLength = motion.length.toFixed(4);
      gl.domElement.dataset.transitionDetour = (
        motion.length / Math.max(0.001, distance(from.position, pose.position))
      ).toFixed(4);
      invalidate();
    } catch (error) {
      console.error("Museum camera:", error);
      callbacks.current.onError();
    }
    // Destination is keyed by value; callback changes cannot restart a journey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    destinationKey,
    focusInsets,
    navigationId,
    reducedMotion,
    skipTransition,
    size.width,
    size.height,
    data,
  ]);
  useEffect(
    () => () => {
      journey.current = null;
      clearWake();
    },
    [],
  );
  useFrame((_, delta) => {
    if (!controls.current) return;
    // Fiber's global before-effect receives the actual RAF timestamp. Sampling
    // performance.now() here would turn intra-frame JS latency into a camera
    // jump, followed by a shorter step on the next equally spaced display frame.
    const now = presentationTime.current;
    if (now === null) return;
    gl.domElement.dataset.cameraSampleTime = (now * 1000).toFixed(4);
    if (mouseLook.current?.active) {
      tour.current.timeline.update(now, false);
      applySample(mouseLook.current.sample, 0);
      // The paused tour clock does not advance while looking around. Follow
      // the rendered gaze on presentation time, without changing its framing.
      if (now - lastManualMetadataTime.current >= 0.15) {
        lastManualMetadataTime.current = now;
        updateVisibleArtwork(
          mouseLook.current.sample,
          continuationRoom(mouseLook.current.sample, data.rooms),
        );
      }
      invalidate();
      return;
    }
    const activeTime = tour.current.timeline.update(now, allowedRef.current);
    // A menu layout or texture upload must not be paid back as a camera jump.
    // Advance at most one 30 Hz display step after a missed presentation frame.
    const activeDelta = Math.min(
      1 / 30,
      Math.max(0, activeTime - previousActiveTime.current),
    );
    previousActiveTime.current = activeTime;
    const current = journey.current;
    if (current) {
      current.startedAt ??= now;
      current.elapsed +=
        current.lastFrame === null
          ? 0
          : Math.min(1 / 30, Math.max(0, now - current.lastFrame));
      current.lastFrame = now;
      const elapsed = current.elapsed;
      gl.domElement.dataset.motionElapsed = elapsed.toFixed(6);
      applySample(sampleCameraMotion(current.motion, elapsed), delta);
      if (elapsed >= current.motion.duration) {
        journey.current = null;
        if (tour.current.readyOnLoop && tour.current.entryElapsed !== null) {
          const overshoot = Math.max(0, elapsed - current.motion.duration);
          tour.current.startedAt = activeTime - overshoot;
          tour.current.hasStarted = true;
          if (tour.current.walk) {
            promenade.current = new ContinuousPromenade(
              tour.current.walk,
              rendered.current!,
              data.rooms,
              walkDistanceAt(tour.current.walk, tour.current.entryElapsed)
                .distance,
            );
            gl.domElement.dataset.tourDuration =
              tour.current.walk.period.toFixed(3);
          }
        }
        arrive(current.id);
        const delay = tour.current.readyOnLoop ? 0 : TOUR_INITIAL_DELAY;
        tour.current.dueAt = activeTime + delay;
        if (allowedRef.current) wakeAfter(delay);
        invalidate(2);
      } else invalidate();
      return;
    }
    if (!allowedRef.current || !rendered.current) {
      if (tour.current.hasStarted && !mouseLook.current?.active)
        gl.domElement.dataset.tourState = "paused";
      return;
    }
    const state = tour.current;
    if (!state.walk) return;
    if (!state.hasStarted) {
      if (activeTime < state.dueAt) {
        wakeAfter(state.dueAt - activeTime);
        return;
      }
      state.startedAt = activeTime;
      state.hasStarted = true;
      gl.domElement.dataset.tourDuration = state.walk.period.toFixed(3);
    }
    const elapsed = activeTime - state.startedAt;
    if (!promenade.current) {
      promenade.current = new ContinuousPromenade(
        state.walk,
        rendered.current,
        data.rooms,
        state.entryElapsed === null
          ? 0
          : walkDistanceAt(state.walk, state.entryElapsed).distance,
      );
    }
    const sample = promenade.current.step(activeDelta, size.width, size.height);
    const promenadePhase = promenade.current.phase;
    setLookState(
      promenadePhase === "blocked"
        ? "blocked"
        : promenadePhase === "resuming"
          ? "resuming"
          : "idle",
    );
    if (promenadePhase !== "walking") {
      // Keep both pose and lens at release during the brief pause, or if no
      // collision-free continuation exists. A later destination still works.
      applySample(sample, delta);
      gl.domElement.dataset.tourState = promenadePhase;
      gl.domElement.dataset.tourSpeed = "0";
      if (promenadePhase === "resuming") invalidate();
      return;
    }
    const lens = automaticLensState.current;
    if (activeTime - lens.measuredAt >= 0.15) {
      lens.measuredAt = activeTime;
      const shell = gl.domElement.closest<HTMLElement>(".visit-shell");
      const bounds = gl.domElement.getBoundingClientRect();
      lens.target = automaticLens(
        sample,
        data.artworks,
        size.width,
        size.height,
        automaticTourInsets(shell, size.width, size.height, bounds.bottom),
        78,
      );
    }
    // Widen promptly on approach, relax slowly on departure: no sudden zoom
    // when changing the watched work or resuming from its detail view.
    // Use the same bounded display steps as the walk, never wall-clock stalls.
    if (state.openingLens) state.openingElapsed += activeDelta;
    const targetLens = state.openingLens
      ? openingLensTarget(
          lens.target,
          size.width,
          size.height,
          state.openingElapsed,
        )
      : lens.target;
    const dt = Math.min(Math.max(activeDelta, 0), 0.1);
    const blend = 1 - Math.exp(-dt * (targetLens.fov > sample.fov ? 4 : 0.35));
    const nextFov = sample.fov + (targetLens.fov - sample.fov) * blend;
    const shiftBlend = 1 - Math.exp(-dt * 1.5);
    const nextX =
      sample.offsetX + (targetLens.offsetX - sample.offsetX) * shiftBlend;
    const nextY =
      sample.offsetY + (targetLens.offsetY - sample.offsetY) * shiftBlend;
    sample.fovVelocity = dt ? (nextFov - sample.fov) / dt : 0;
    sample.offsetVelocityX = dt ? (nextX - sample.offsetX) / dt : 0;
    sample.offsetVelocityY = dt ? (nextY - sample.offsetY) / dt : 0;
    sample.fov = nextFov;
    sample.offsetX = nextX;
    sample.offsetY = nextY;
    applySample(sample, delta);
    const travel = {
      distance: promenade.current.distance,
      speed: Math.hypot(...sample.velocity),
    };
    gl.domElement.dataset.tourState = "walking";
    gl.domElement.dataset.tourElapsed = elapsed.toFixed(5);
    gl.domElement.dataset.tourProgress = (
      (travel.distance / state.walk.length) %
      1
    ).toFixed(6);
    gl.domElement.dataset.tourCycle = String(
      Math.floor(travel.distance / state.walk.length),
    );
    gl.domElement.dataset.tourSpeed = travel.speed.toFixed(5);
    gl.domElement.dataset.tourYawSpeed = (
      (sample.yawVelocity * 180) /
      Math.PI
    ).toFixed(4);
    if (activeTime - state.lastMetadataTime >= 0.3) {
      state.lastMetadataTime = activeTime;
      updateVisibleArtwork(sample, state.walk.roomId);
    }
    invalidate();
  }, -0.5);
  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={false}
      smoothTime={0}
      draggingSmoothTime={0}
      mouseButtons={{ left: 0, middle: 0, right: 0, wheel: 0 }}
      touches={{ one: 0, two: 0, three: 0 }}
    />
  );
}
